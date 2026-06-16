use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct VibrationVideoState {
    pub process: Arc<Mutex<Option<Child>>>,
    pub stop_reason: Arc<Mutex<Option<String>>>,
}

impl Default for VibrationVideoState {
    fn default() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
            stop_reason: Arc::new(Mutex::new(None)),
        }
    }
}

fn create_hidden_command(program: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new(program);
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new(program)
    }
}

fn ensure_exists(path: &str, label: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err(format!("{}不能为空", label));
    }
    if !Path::new(path).exists() {
        return Err(format!("{}不存在: {}", label, path));
    }
    Ok(())
}

fn resolve_python_program(python_path: Option<String>) -> Result<String, String> {
    let candidate = python_path.unwrap_or_default().trim().to_string();
    if !candidate.is_empty() {
        let looks_like_path =
            candidate.contains('\\') || candidate.contains('/') || candidate.contains(':');
        if looks_like_path {
            ensure_exists(&candidate, "Python解释器路径")?;
        }
        return Ok(candidate);
    }

    if let Ok(current_dir) = std::env::current_dir() {
        let candidates = [
            current_dir.join(".venv-video").join("bin").join("python"),
            current_dir.join("..").join(".venv-video").join("bin").join("python"),
            current_dir.join(".venv-video").join("Scripts").join("python.exe"),
            current_dir.join("..").join(".venv-video").join("Scripts").join("python.exe"),
            current_dir.join(".venv").join("Scripts").join("python.exe"),
            current_dir.join("..").join(".venv").join("Scripts").join("python.exe"),
            current_dir.join(".venv").join("bin").join("python"),
            current_dir.join("..").join(".venv").join("bin").join("python"),
        ];
        for path in candidates {
            if path.exists() {
                return Ok(path.to_string_lossy().to_string());
            }
        }
    }

    Ok(if cfg!(target_os = "windows") {
        "python".to_string()
    } else {
        "python3".to_string()
    })
}

fn ensure_video_dependencies(python_program: &str) -> Result<(), String> {
    let import_check = create_hidden_command(python_program)
        .args(["-c", "import av, cv2, numpy; from PIL import Image, ImageDraw, ImageFont"])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("检查振动视频识别依赖失败: {}", e))?;

    if import_check.status.success() {
        return Ok(());
    }

    let detail = String::from_utf8_lossy(&import_check.stderr)
        .trim()
        .to_string();
    Err(format!(
        "当前 Python 缺少振动视频识别依赖，请在设置中选择已安装 av、opencv-python-headless、numpy、Pillow 的 Python，或执行 python -m pip install av opencv-python-headless numpy Pillow。Python: {}{}",
        python_program,
        if detail.is_empty() {
            String::new()
        } else {
            format!("；详情: {}", detail)
        }
    ))
}

fn resolve_vibration_script_path(app: &AppHandle) -> Result<PathBuf, String> {
    let bundled = app
        .path()
        .resolve("resources/vibration/process_chart_video.py", BaseDirectory::Resource)
        .map_err(|e| format!("解析振动视频脚本资源失败: {}", e))?;
    if bundled.exists() {
        return Ok(bundled);
    }

    let dev_fallback = std::env::current_dir()
        .map_err(|e| format!("获取当前工作目录失败: {}", e))?
        .join("src-tauri")
        .join("resources")
        .join("vibration")
        .join("process_chart_video.py");
    if dev_fallback.exists() {
        return Ok(dev_fallback);
    }

    Err("未找到项目内振动视频处理脚本 resources/vibration/process_chart_video.py".to_string())
}

fn create_output_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let base_dir = app
        .path()
        .resolve("vibration-captures", BaseDirectory::AppData)
        .map_err(|e| format!("解析截图输出目录失败: {}", e))?;
    let output_dir = base_dir
        .join("vibration_extract")
        .join(timestamp.to_string());
    fs::create_dir_all(&output_dir).map_err(|e| format!("创建输出目录失败: {}", e))?;
    Ok(output_dir)
}

fn write_progress_status(output_dir: &Path, paused: bool, complete: bool) -> Result<(), String> {
    let progress_path = output_dir.join("capture_progress.json");
    if !progress_path.exists() {
        return Ok(());
    }
    let progress_text = fs::read_to_string(&progress_path)
        .map_err(|e| format!("读取采集进度失败: {}", e))?;
    let mut progress: serde_json::Value =
        serde_json::from_str(&progress_text).map_err(|e| format!("解析采集进度失败: {}", e))?;
    if let Some(obj) = progress.as_object_mut() {
        obj.insert("paused".to_string(), serde_json::Value::Bool(paused));
        obj.insert("complete".to_string(), serde_json::Value::Bool(complete));
    }
    fs::write(
        &progress_path,
        serde_json::to_string_pretty(&progress).map_err(|e| format!("写入采集进度失败: {}", e))?,
    )
    .map_err(|e| format!("写入采集进度失败: {}", e))
}

fn absolutize_record_screenshot(payload: &mut serde_json::Value, output_dir: &Path) {
    let Some(record) = payload.get_mut("record") else {
        return;
    };
    let Some(raw) = record.get("chart_screenshot").and_then(|value| value.as_str()) else {
        return;
    };
    let path = Path::new(raw);
    let final_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        output_dir.join(path)
    };
    if let Some(obj) = record.as_object_mut() {
        obj.insert(
            "chart_screenshot".to_string(),
            serde_json::Value::String(final_path.to_string_lossy().to_string()),
        );
    }
}

fn read_payload_files(output_dir: &Path) -> Result<serde_json::Value, String> {
    let payload_dir = if output_dir.join("top_readings_0.5s.json").exists() {
        output_dir.to_path_buf()
    } else {
        output_dir
            .parent()
            .filter(|parent| {
                output_dir.file_name().and_then(|name| name.to_str()) == Some("chart_screenshots")
                    && parent.join("top_readings_0.5s.json").exists()
            })
            .map(Path::to_path_buf)
            .unwrap_or_else(|| output_dir.to_path_buf())
    };
    let json_path = payload_dir.join("top_readings_0.5s.json");
    let summary_path = payload_dir.join("experiment_summary.json");
    let csv_path = payload_dir.join("experiment_data.csv");

    let payload_text = fs::read_to_string(&json_path)
        .map_err(|e| format!("读取采样JSON失败: {}", e))?;
    let summary_text = fs::read_to_string(&summary_path)
        .map_err(|e| format!("读取实验汇总失败: {}", e))?;

    let mut payload: serde_json::Value =
        serde_json::from_str(&payload_text).map_err(|e| format!("解析采样JSON失败: {}", e))?;
    let summary: serde_json::Value =
        serde_json::from_str(&summary_text).map_err(|e| format!("解析实验汇总失败: {}", e))?;

    if let Some(records) = payload.get_mut("records").and_then(|value| value.as_array_mut()) {
        for record in records.iter_mut() {
            let screenshot = record
                .get("chart_screenshot")
                .and_then(|value| value.as_str())
                .unwrap_or_default();
            let absolute = if Path::new(screenshot).is_absolute() {
                PathBuf::from(screenshot)
            } else {
                payload_dir.join(screenshot)
            };
            if let Some(obj) = record.as_object_mut() {
                obj.insert(
                    "chart_screenshot".to_string(),
                    serde_json::Value::String(absolute.to_string_lossy().to_string()),
                );
            }
        }
    }

    Ok(serde_json::json!({
        "output_dir": payload_dir.to_string_lossy(),
        "json_path": json_path.to_string_lossy(),
        "summary_path": summary_path.to_string_lossy(),
        "csv_path": csv_path.to_string_lossy(),
        "summary": summary,
        "records": payload.get("records").cloned().unwrap_or(serde_json::Value::Array(vec![])),
    }))
}

fn read_progress_file(output_dir: &Path) -> Result<serde_json::Value, String> {
    let progress_path = output_dir.join("capture_progress.json");
    if !progress_path.exists() {
        return Ok(serde_json::json!({
            "exists": false,
            "current": 0,
            "progress_pct": 0,
            "latest_screenshot": "",
            "complete": false,
        }));
    }

    let progress_text = fs::read_to_string(&progress_path)
        .map_err(|e| format!("读取采集进度失败: {}", e))?;
    let mut progress: serde_json::Value =
        serde_json::from_str(&progress_text).map_err(|e| format!("解析采集进度失败: {}", e))?;

    let latest_screenshot = progress
        .get("latest_screenshot")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    if !latest_screenshot.is_empty() {
        let absolute = if Path::new(latest_screenshot).is_absolute() {
            PathBuf::from(latest_screenshot)
        } else {
            output_dir.join(latest_screenshot)
        };
        if let Some(obj) = progress.as_object_mut() {
            obj.insert(
                "latest_screenshot".to_string(),
                serde_json::Value::String(absolute.to_string_lossy().to_string()),
            );
        }
    }

    if let Some(obj) = progress.as_object_mut() {
        obj.insert("exists".to_string(), serde_json::Value::Bool(true));
    }

    Ok(progress)
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|e| format!("创建导出目录失败: {}", e))?;
    for entry in fs::read_dir(source).map_err(|e| format!("读取导出源目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取导出目录项失败: {}", e))?;
        let entry_path = entry.path();
        let target_path = target.join(entry.file_name());
        let metadata = entry
            .metadata()
            .map_err(|e| format!("读取导出文件信息失败: {}", e))?;
        if metadata.is_dir() {
            copy_dir_recursive(&entry_path, &target_path)?;
        } else {
            fs::copy(&entry_path, &target_path).map_err(|e| {
                format!(
                    "复制文件失败: {} -> {} ({})",
                    entry_path.to_string_lossy(),
                    target_path.to_string_lossy(),
                    e
                )
            })?;
        }
    }
    Ok(())
}

fn remove_legacy_vibration_report_file(export_path: &Path) -> Result<(), String> {
    for file_name in [
        "experiment_summary.json",
        "experiment_data.csv",
        "capture_progress.json",
        "振动测试数据.csv",
        "图像采集结果.png",
        "测试报告.docx",
    ] {
        let path = export_path.join(file_name);
        if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| format!("清理旧报告文件失败: {} ({})", path.to_string_lossy(), e))?;
        }
    }
    Ok(())
}

fn copy_vibration_report_output(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|e| format!("创建导出目录失败: {}", e))?;

    let json_source = source.join("top_readings_0.5s.json");
    if !json_source.exists() {
        return Err(format!("采样JSON不存在: {}", json_source.to_string_lossy()));
    }
    fs::copy(&json_source, target.join("top_readings_0.5s.json"))
        .map_err(|e| format!("复制采样JSON失败: {}", e))?;

    let screenshots_source = source.join("chart_screenshots");
    if !screenshots_source.exists() {
        return Err(format!("截图目录不存在: {}", screenshots_source.to_string_lossy()));
    }
    copy_dir_recursive(&screenshots_source, &target.join("chart_screenshots"))?;

    remove_legacy_vibration_report_file(target)?;
    Ok(())
}

fn sanitize_folder_name(input: &str) -> String {
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut sanitized = input
        .chars()
        .map(|c| if invalid.contains(&c) { '_' } else { c })
        .collect::<String>();
    sanitized = sanitized.trim().trim_matches('.').to_string();
    if sanitized.is_empty() {
        "vibration_capture".to_string()
    } else {
        sanitized
    }
}

#[tauri::command]
pub fn extract_vibration_video_data(
    app: AppHandle,
    python_path: Option<String>,
    video_path: String,
    interval: f64,
) -> Result<serde_json::Value, String> {
    ensure_exists(&video_path, "视频文件路径")?;

    let python_program = resolve_python_program(python_path)?;
    ensure_video_dependencies(&python_program)?;
    let script_path = resolve_vibration_script_path(&app)?;
    let output_dir = create_output_dir(&app)?;
    let script_path_str = script_path.to_string_lossy().to_string();
    let output_dir_str = output_dir.to_string_lossy().to_string();
    let interval_str = interval.to_string();

    let output = create_hidden_command(&python_program)
        .args([
            script_path_str.as_str(),
            "--video",
            video_path.as_str(),
            "--output-dir",
            output_dir_str.as_str(),
            "--interval",
            interval_str.as_str(),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("执行视频处理脚本失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let reason = if !stderr.is_empty() { stderr } else { stdout };
        return Err(format!("视频处理失败: {}", reason));
    }

    read_payload_files(&output_dir)
}

#[tauri::command]
pub fn start_vibration_video_stream(
    app: AppHandle,
    state: State<VibrationVideoState>,
    python_path: Option<String>,
    video_path: String,
    interval: f64,
    output_dir: Option<String>,
    resume: Option<bool>,
) -> Result<serde_json::Value, String> {
    ensure_exists(&video_path, "视频文件路径")?;
    let python_program = resolve_python_program(python_path)?;
    ensure_video_dependencies(&python_program)?;
    let script_path = resolve_vibration_script_path(&app)?;
    let resume_mode = resume.unwrap_or(false);
    let output_dir = if let Some(existing) = output_dir {
        ensure_exists(&existing, "采集输出目录")?;
        PathBuf::from(existing)
    } else {
        create_output_dir(&app)?
    };

    {
        let mut guard = state.process.lock().map_err(|e| e.to_string())?;
        if let Some(child) = guard.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    *guard = None;
                }
                Ok(None) => {
                    return Err("已有振动视频处理任务正在运行".to_string());
                }
                Err(e) => return Err(format!("检查振动视频处理进程状态失败: {}", e)),
            }
        }
    }
    if let Ok(mut reason_guard) = state.stop_reason.lock() {
        *reason_guard = None;
    }

    let script_path_str = script_path.to_string_lossy().to_string();
    let output_dir_str = output_dir.to_string_lossy().to_string();
    let interval_str = interval.to_string();
    let mut cmd = create_hidden_command(&python_program);
    cmd.args([
        script_path_str.as_str(),
        "--video",
        video_path.as_str(),
        "--output-dir",
        output_dir_str.as_str(),
        "--interval",
        interval_str.as_str(),
        "--emit-events",
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    if resume_mode {
        cmd.arg("--resume");
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动振动视频处理脚本失败: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取振动视频处理脚本标准输出".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取振动视频处理脚本错误输出".to_string())?;

    {
        let mut guard = state.process.lock().map_err(|e| e.to_string())?;
        *guard = Some(child);
    }

    let stderr_buffer = Arc::new(Mutex::new(String::new()));
    let stderr_for_thread = stderr_buffer.clone();
    let stderr_handle = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines() {
            let Ok(line) = line else { continue };
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(mut guard) = stderr_for_thread.lock() {
                guard.push_str(&line);
                guard.push('\n');
            }
        }
    });

    let app_clone = app.clone();
    let process_handle = state.process.clone();
    let stop_reason_handle = state.stop_reason.clone();
    let output_dir_clone = output_dir.clone();

    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { continue };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            match serde_json::from_str::<serde_json::Value>(trimmed) {
                Ok(mut payload) => {
                    absolutize_record_screenshot(&mut payload, &output_dir_clone);
                    let _ = app_clone.emit("vibration-video-stream", payload);
                }
                Err(_) => {
                    let _ = app_clone.emit(
                        "vibration-video-stream",
                        serde_json::json!({
                            "event": "log",
                            "message": trimmed,
                        }),
                    );
                }
            }
        }

        let _ = stderr_handle.join();
        let stderr_text = stderr_buffer
            .lock()
            .map(|value| value.trim().to_string())
            .unwrap_or_default();

        let wait_result = {
            let mut guard = process_handle.lock().ok();
            match guard.as_mut().and_then(|inner| inner.take()) {
                Some(mut child) => child.wait().ok(),
                None => None,
            }
        };

        if let Some(status) = wait_result {
            let reason = stop_reason_handle
                .lock()
                .ok()
                .and_then(|mut guard| guard.take());
            if let Some(reason) = reason {
                let event_name = if reason == "paused" { "paused" } else { "stopped" };
                let message = if reason == "paused" { "图像采集已暂停" } else { "图像采集已中止" };
                let _ = app_clone.emit(
                    "vibration-video-stream",
                    serde_json::json!({
                        "event": event_name,
                        "message": message,
                        "output_dir": output_dir_clone.to_string_lossy().to_string(),
                    }),
                );
            } else if !status.success() {
                let message = if stderr_text.is_empty() {
                    format!("振动视频处理脚本退出失败，退出码: {:?}", status.code())
                } else {
                    stderr_text
                };
                let _ = app_clone.emit(
                    "vibration-video-stream",
                    serde_json::json!({
                        "event": "error",
                        "message": message,
                    }),
                );
            }
        }
    });

    Ok(serde_json::json!({
        "output_dir": output_dir.to_string_lossy(),
        "script_path": script_path.to_string_lossy(),
        "python_program": python_program,
    }))
}

#[tauri::command]
pub fn stop_vibration_video_stream(
    app: AppHandle,
    state: State<VibrationVideoState>,
    output_dir: Option<String>,
) -> Result<(), String> {
    if let Ok(mut guard) = state.stop_reason.lock() {
        *guard = Some("stopped".to_string());
    }
    if let Some(dir) = output_dir.as_ref() {
        let _ = write_progress_status(Path::new(dir), false, false);
    }
    let mut guard = state.process.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        #[cfg(target_os = "windows")]
        {
            let _ = create_hidden_command("taskkill")
                .args(["/PID", &child.id().to_string(), "/F", "/T"])
                .output();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = child.kill();
        }

        let _ = child.wait();
    }

    let _ = app;
    Ok(())
}

#[tauri::command]
pub fn pause_vibration_video_stream(
    state: State<VibrationVideoState>,
    output_dir: String,
) -> Result<(), String> {
    ensure_exists(&output_dir, "采集输出目录")?;
    write_progress_status(Path::new(&output_dir), true, false)?;
    if let Ok(mut guard) = state.stop_reason.lock() {
        *guard = Some("paused".to_string());
    }

    let mut guard = state.process.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        #[cfg(target_os = "windows")]
        {
            let _ = create_hidden_command("taskkill")
                .args(["/PID", &child.id().to_string(), "/F", "/T"])
                .output();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = child.kill();
        }

        let _ = child.wait();
    }
    Ok(())
}

#[tauri::command]
pub fn get_vibration_capture_status(output_dir: String) -> Result<serde_json::Value, String> {
    ensure_exists(&output_dir, "采集输出目录")?;
    read_progress_file(Path::new(&output_dir))
}

#[tauri::command]
pub fn get_vibration_capture_result(output_dir: String) -> Result<serde_json::Value, String> {
    ensure_exists(&output_dir, "采集输出目录")?;
    read_payload_files(Path::new(&output_dir))
}

#[tauri::command]
pub fn export_vibration_capture_output(
    source_output_dir: String,
    target_dir: String,
    folder_name: Option<String>,
) -> Result<serde_json::Value, String> {
    ensure_exists(&source_output_dir, "采集输出目录")?;
    ensure_exists(&target_dir, "导出目标目录")?;
    let source = PathBuf::from(source_output_dir);
    let target_root = PathBuf::from(target_dir);
    let folder_name = sanitize_folder_name(folder_name.unwrap_or_else(|| "vibration_capture".to_string()).as_str());
    let final_target = target_root.join(folder_name);

    if final_target.exists() {
        fs::remove_dir_all(&final_target).map_err(|e| format!("清理旧导出目录失败: {}", e))?;
    }

    copy_vibration_report_output(&source, &final_target)?;

    Ok(serde_json::json!({
        "export_dir": final_target.to_string_lossy(),
        "source_dir": source.to_string_lossy(),
    }))
}

#[tauri::command]
pub fn write_vibration_report_files(
    export_dir: String,
    _csv_content: String,
    _report_text: String,
    _image_bytes: Option<Vec<u8>>,
) -> Result<serde_json::Value, String> {
    ensure_exists(&export_dir, "导出目录")?;
    let export_path = PathBuf::from(&export_dir);
    remove_legacy_vibration_report_file(&export_path)?;

    Ok(serde_json::json!({
        "export_dir": export_dir,
        "json_path": export_path.join("top_readings_0.5s.json").to_string_lossy(),
        "screenshots_dir": export_path.join("chart_screenshots").to_string_lossy(),
    }))
}
