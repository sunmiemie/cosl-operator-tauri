use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const RESULT_FILE_NAME: &str = "ocr_readings_0.5s.json";
const CSV_FILE_NAME: &str = "ocr_readings.csv";
const SUMMARY_FILE_NAME: &str = "experiment_summary.json";
const CURVE_FILE_NAME: &str = "振动测试曲线.png";
const SCREENSHOT_FILE_NAME: &str = "振动软件页面截图.jpg";

pub struct VibrationOcrState {
    pub process: Arc<Mutex<Option<Child>>>,
}

impl Default for VibrationOcrState {
    fn default() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
        }
    }
}

#[derive(serde::Serialize)]
pub struct VibrationOcrDevice {
    pub index: u32,
    pub name: String,
    pub device: String,
    pub available: bool,
}

fn create_hidden_command(program: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new(program);
        command.creation_flags(CREATE_NO_WINDOW);
        command
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
            current_dir.join(".venv-ocr").join("bin").join("python"),
            current_dir
                .join(".venv-ocr")
                .join("Scripts")
                .join("python.exe"),
            current_dir
                .join("..")
                .join(".venv-ocr")
                .join("bin")
                .join("python"),
            current_dir
                .join("..")
                .join(".venv-ocr")
                .join("Scripts")
                .join("python.exe"),
            current_dir.join(".venv").join("bin").join("python"),
            current_dir.join(".venv").join("Scripts").join("python.exe"),
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

fn ensure_ocr_dependencies(python_program: &str) -> Result<(), String> {
    let script = if cfg!(target_os = "linux") {
        "import cv2, numpy, onnxruntime, paddleocr, prometheus_client, pydantic, yaml, gi; gi.require_version('Gst', '1.0'); from gi.repository import Gst, GstApp"
    } else {
        "import cv2, numpy, onnxruntime, paddleocr, prometheus_client, pydantic, yaml"
    };
    let output = create_hidden_command(python_program)
        .args(["-c", script])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("检查振动台 OCR 依赖失败: {}", error))?;
    if output.status.success() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(format!(
        "当前 Python 缺少振动台 OCR 依赖，请按 resources/vibration/ocr-service/requirements.txt 安装依赖{}。Python: {}{}",
        if cfg!(target_os = "linux") {
            "，Deepin 还需安装 PyGObject 与 GStreamer V4L2 组件"
        } else {
            ""
        },
        python_program,
        if detail.is_empty() {
            String::new()
        } else {
            format!("；详情: {}", detail)
        }
    ))
}

fn resolve_script_path(app: &AppHandle) -> Result<PathBuf, String> {
    let bundled = app
        .path()
        .resolve(
            "resources/vibration/ocr-service/run_vibration_ocr.py",
            BaseDirectory::Resource,
        )
        .map_err(|error| format!("解析振动台 OCR 脚本失败: {}", error))?;
    if bundled.exists() {
        return Ok(bundled);
    }
    let current_dir =
        std::env::current_dir().map_err(|error| format!("获取当前工作目录失败: {}", error))?;
    let relative = Path::new("resources")
        .join("vibration")
        .join("ocr-service")
        .join("run_vibration_ocr.py");
    for fallback in [
        current_dir.join(&relative),
        current_dir.join("src-tauri").join(&relative),
    ] {
        if fallback.exists() {
            return Ok(fallback);
        }
    }
    Err("未找到振动台 OCR 启动脚本 run_vibration_ocr.py".to_string())
}

fn resolve_model_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let relative = "resources/high-temp-pressure/ocr-service/models/PP-OCRv6_small_rec";
    let bundled = app
        .path()
        .resolve(relative, BaseDirectory::Resource)
        .map_err(|error| format!("解析共享 OCR 模型目录失败: {}", error))?;
    if bundled.join("inference.onnx").exists() {
        return Ok(bundled);
    }
    let current_dir =
        std::env::current_dir().map_err(|error| format!("获取当前工作目录失败: {}", error))?;
    for fallback in [
        current_dir.join(relative),
        current_dir.join("src-tauri").join(relative),
    ] {
        if fallback.join("inference.onnx").exists() {
            return Ok(fallback);
        }
    }
    Err("未找到振动台与高温高压共用的 PP-OCRv6_small_rec 模型".to_string())
}

#[cfg(target_os = "windows")]
fn resolve_ffmpeg_program(app: &AppHandle) -> Result<String, String> {
    let relative = "resources/vibration/ocr-service/bin/windows/x64/ffmpeg.exe";
    if let Ok(path) = app.path().resolve(relative, BaseDirectory::Resource) {
        if path.exists() {
            return Ok(path.to_string_lossy().to_string());
        }
    }
    if let Ok(current_dir) = std::env::current_dir() {
        let fallback = current_dir.join("src-tauri").join(relative);
        if fallback.exists() {
            return Ok(fallback.to_string_lossy().to_string());
        }
    }
    let output = create_hidden_command("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    if matches!(output, Ok(status) if status.success()) {
        return Ok("ffmpeg".to_string());
    }
    Err("未找到 ffmpeg.exe。请将其放入 resources/vibration/ocr-service/bin/windows/x64，或加入系统 PATH".to_string())
}

fn sanitize_folder_name(value: &str) -> String {
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let sanitized = value
        .chars()
        .map(|character| {
            if invalid.contains(&character) {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    let sanitized = sanitized.trim().trim_matches('.');
    if sanitized.is_empty() {
        "vibration".to_string()
    } else {
        sanitized.to_string()
    }
}

fn create_output_dir(
    app: &AppHandle,
    test_mode: Option<String>,
    order_number: Option<String>,
) -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_millis();
    let base = app
        .path()
        .resolve("vibration-captures", BaseDirectory::AppData)
        .map_err(|error| format!("解析振动台采集目录失败: {}", error))?;
    let mode = match test_mode.as_deref() {
        Some("formal") => "work-order",
        _ => "temporary",
    };
    let order = sanitize_folder_name(order_number.as_deref().unwrap_or("local"));
    let output_dir = base
        .join("vibration_ocr")
        .join(mode)
        .join(order)
        .join(timestamp.to_string());
    fs::create_dir_all(&output_dir)
        .map_err(|error| format!("创建振动台采集输出目录失败: {}", error))?;
    Ok(output_dir)
}

fn write_control_action(output_dir: &Path, action: &str) -> Result<(), String> {
    fs::write(
        output_dir.join("ocr_control.json"),
        serde_json::to_string_pretty(&serde_json::json!({ "action": action }))
            .map_err(|error| format!("序列化 OCR 控制指令失败: {}", error))?,
    )
    .map_err(|error| format!("写入 OCR 控制指令失败: {}", error))
}

fn absolutize_path_field(payload: &mut serde_json::Value, key: &str, output_dir: &Path) {
    let Some(raw) = payload.get(key).and_then(|value| value.as_str()) else {
        return;
    };
    if raw.is_empty() {
        return;
    }
    let absolute = if Path::new(raw).is_absolute() {
        PathBuf::from(raw)
    } else {
        output_dir.join(raw)
    };
    if let Some(object) = payload.as_object_mut() {
        object.insert(
            key.to_string(),
            serde_json::Value::String(absolute.to_string_lossy().to_string()),
        );
    }
}

fn read_progress_file(output_dir: &Path) -> Result<serde_json::Value, String> {
    let path = output_dir.join("ocr_progress.json");
    if !path.exists() {
        return Ok(serde_json::json!({
            "exists": false,
            "current": 0,
            "accepted_current": 0,
            "ready_pct": 0,
            "complete": false,
            "paused": false,
        }));
    }
    let text =
        fs::read_to_string(&path).map_err(|error| format!("读取振动台 OCR 状态失败: {}", error))?;
    let mut payload: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| format!("解析振动台 OCR 状态失败: {}", error))?;
    absolutize_path_field(&mut payload, "latest_frame", output_dir);
    if let Some(object) = payload.as_object_mut() {
        object.insert("exists".to_string(), serde_json::Value::Bool(true));
    }
    Ok(payload)
}

fn read_capture_result(output_dir: &Path) -> Result<serde_json::Value, String> {
    let json_path = output_dir.join(RESULT_FILE_NAME);
    let csv_path = output_dir.join(CSV_FILE_NAME);
    let summary_path = output_dir.join(SUMMARY_FILE_NAME);
    let payload_text = fs::read_to_string(&json_path)
        .map_err(|error| format!("读取振动台 OCR 采样结果失败: {}", error))?;
    let summary_text = fs::read_to_string(&summary_path)
        .map_err(|error| format!("读取振动台 OCR 汇总失败: {}", error))?;
    let payload: serde_json::Value = serde_json::from_str(&payload_text)
        .map_err(|error| format!("解析振动台 OCR 采样结果失败: {}", error))?;
    let summary: serde_json::Value = serde_json::from_str(&summary_text)
        .map_err(|error| format!("解析振动台 OCR 汇总失败: {}", error))?;
    let latest_frame = output_dir.join("latest_frame.jpg");
    Ok(serde_json::json!({
        "output_dir": output_dir.to_string_lossy(),
        "json_path": json_path.to_string_lossy(),
        "csv_path": csv_path.to_string_lossy(),
        "summary_path": summary_path.to_string_lossy(),
        "latest_frame": if latest_frame.exists() { latest_frame.to_string_lossy().to_string() } else { String::new() },
        "summary": summary,
        "records": payload.get("records").cloned().unwrap_or(serde_json::Value::Array(Vec::new())),
    }))
}

fn copy_if_exists(source: &Path, target: &Path) -> Result<(), String> {
    if source.exists() {
        fs::copy(source, target).map_err(|error| {
            format!(
                "复制振动台结果失败: {} -> {} ({})",
                source.to_string_lossy(),
                target.to_string_lossy(),
                error
            )
        })?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_vibration_ocr_devices() -> Result<Vec<VibrationOcrDevice>, String> {
    let mut devices = nokhwa::query(nokhwa::utils::ApiBackend::Auto)
        .map_err(|error| format!("枚举振动台采集设备失败: {}", error))?
        .into_iter()
        .filter_map(|item| {
            let index = item.index().as_index().ok()?;
            let name = item.human_name();
            let device = if cfg!(target_os = "linux") {
                format!("/dev/video{}", index)
            } else {
                name.clone()
            };
            Some(VibrationOcrDevice {
                index,
                name,
                device,
                available: true,
            })
        })
        .collect::<Vec<_>>();
    devices.sort_by_key(|item| item.index);
    Ok(devices)
}

#[tauri::command]
pub fn start_vibration_ocr_stream(
    app: AppHandle,
    state: State<VibrationOcrState>,
    python_path: Option<String>,
    device: Option<String>,
    interval: f64,
    test_mode: Option<String>,
    order_number: Option<String>,
) -> Result<serde_json::Value, String> {
    let python_program = resolve_python_program(python_path)?;
    ensure_ocr_dependencies(&python_program)?;
    let script_path = resolve_script_path(&app)?;
    let model_dir = resolve_model_dir(&app)?;
    let output_dir = create_output_dir(&app, test_mode, order_number)?;
    let capture_device = device.unwrap_or_default().trim().to_string();
    let capture_device = if capture_device.is_empty() {
        if cfg!(target_os = "linux") {
            "/dev/video0".to_string()
        } else {
            "AFN_cap video".to_string()
        }
    } else {
        capture_device
    };

    {
        let mut guard = state.process.lock().map_err(|error| error.to_string())?;
        if let Some(child) = guard.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => *guard = None,
                Ok(None) => return Err("已有振动台 OCR 采集任务正在运行".to_string()),
                Err(error) => return Err(format!("检查振动台 OCR 进程失败: {}", error)),
            }
        }
    }

    let mut command = create_hidden_command(&python_program);
    command.args([
        script_path.to_string_lossy().as_ref(),
        "--device",
        capture_device.as_str(),
        "--model-dir",
        model_dir.to_string_lossy().as_ref(),
        "--output-dir",
        output_dir.to_string_lossy().as_ref(),
        "--interval",
        interval.to_string().as_str(),
    ]);
    #[cfg(target_os = "windows")]
    command.env("VIBRATION_FFMPEG_PATH", resolve_ffmpeg_program(&app)?);
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|error| format!("启动振动台 OCR 进程失败: {}", error))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取振动台 OCR 标准输出".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取振动台 OCR 错误输出".to_string())?;

    {
        let mut guard = state.process.lock().map_err(|error| error.to_string())?;
        *guard = Some(child);
    }

    let stderr_buffer = Arc::new(Mutex::new(String::new()));
    let stderr_for_thread = stderr_buffer.clone();
    let stderr_handle = std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if !line.trim().is_empty() {
                if let Ok(mut buffer) = stderr_for_thread.lock() {
                    buffer.push_str(&line);
                    buffer.push('\n');
                }
            }
        }
    });

    let app_clone = app.clone();
    let process_handle = state.process.clone();
    let output_dir_clone = output_dir.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let text = line.trim();
            if text.is_empty() {
                continue;
            }
            if let Ok(mut payload) = serde_json::from_str::<serde_json::Value>(text) {
                absolutize_path_field(&mut payload, "preview_path", &output_dir_clone);
                absolutize_path_field(&mut payload, "latest_frame", &output_dir_clone);
                let _ = app_clone.emit("vibration-ocr-stream", payload);
            }
        }

        let _ = stderr_handle.join();
        let stderr_text = stderr_buffer
            .lock()
            .map(|value| value.trim().to_string())
            .unwrap_or_default();
        let wait_result = {
            let mut guard = process_handle.lock().ok();
            guard
                .as_mut()
                .and_then(|value| value.take())
                .and_then(|mut child| child.wait().ok())
        };
        if let Some(status) = wait_result {
            if !status.success() {
                let message = if stderr_text.is_empty() {
                    format!("振动台 OCR 进程异常退出，退出码: {:?}", status.code())
                } else {
                    stderr_text
                };
                let _ = app_clone.emit(
                    "vibration-ocr-stream",
                    serde_json::json!({ "event": "error", "message": message }),
                );
            }
        }
    });

    Ok(serde_json::json!({
        "output_dir": output_dir.to_string_lossy(),
        "script_path": script_path.to_string_lossy(),
        "python_program": python_program,
        "device": capture_device,
        "platform": if cfg!(target_os = "linux") { "v4l2" } else { "dshow" },
    }))
}

fn ensure_running_process(state: &State<VibrationOcrState>) -> Result<(), String> {
    let mut guard = state.process.lock().map_err(|error| error.to_string())?;
    let child = guard
        .as_mut()
        .ok_or_else(|| "振动台 OCR 采集进程未运行".to_string())?;
    if child
        .try_wait()
        .map_err(|error| format!("检查振动台 OCR 进程失败: {}", error))?
        .is_some()
    {
        return Err("振动台 OCR 采集进程已结束".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn pause_vibration_ocr_stream(
    state: State<VibrationOcrState>,
    output_dir: String,
) -> Result<(), String> {
    ensure_exists(&output_dir, "振动台采集输出目录")?;
    ensure_running_process(&state)?;
    write_control_action(Path::new(&output_dir), "pause")
}

#[tauri::command]
pub fn resume_vibration_ocr_stream(
    state: State<VibrationOcrState>,
    output_dir: String,
) -> Result<(), String> {
    ensure_exists(&output_dir, "振动台采集输出目录")?;
    ensure_running_process(&state)?;
    write_control_action(Path::new(&output_dir), "resume")
}

#[tauri::command]
pub fn stop_vibration_ocr_stream(
    state: State<VibrationOcrState>,
    output_dir: Option<String>,
) -> Result<(), String> {
    if let Some(dir) = output_dir.as_ref() {
        let _ = write_control_action(Path::new(dir), "stop");
    }
    let mut guard = state.process.lock().map_err(|error| error.to_string())?;
    if let Some(child) = guard.as_mut() {
        for _ in 0..300 {
            if child
                .try_wait()
                .map_err(|error| format!("等待振动台 OCR 进程退出失败: {}", error))?
                .is_some()
            {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
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
    }
    Ok(())
}

#[tauri::command]
pub fn get_vibration_capture_status(output_dir: String) -> Result<serde_json::Value, String> {
    ensure_exists(&output_dir, "振动台采集输出目录")?;
    read_progress_file(Path::new(&output_dir))
}

#[tauri::command]
pub fn get_vibration_capture_result(output_dir: String) -> Result<serde_json::Value, String> {
    ensure_exists(&output_dir, "振动台采集输出目录")?;
    read_capture_result(Path::new(&output_dir))
}

#[tauri::command]
pub fn export_vibration_capture_output(
    source_output_dir: String,
    target_dir: String,
    folder_name: Option<String>,
    curve_image_data_url: Option<String>,
) -> Result<serde_json::Value, String> {
    ensure_exists(&source_output_dir, "振动台采集源目录")?;
    ensure_exists(&target_dir, "振动台导出目标目录")?;
    let source = PathBuf::from(source_output_dir);
    let target = PathBuf::from(target_dir).join(sanitize_folder_name(
        folder_name.as_deref().unwrap_or("vibration_ocr_capture"),
    ));
    fs::create_dir_all(&target).map_err(|error| format!("创建振动台导出目录失败: {}", error))?;
    for file_name in [RESULT_FILE_NAME, CSV_FILE_NAME] {
        copy_if_exists(&source.join(file_name), &target.join(file_name))?;
    }
    let screenshot_source = source.join("latest_frame.jpg");
    if !screenshot_source.exists() {
        return Err("未找到振动软件页面截图，请确认采集卡画面已正常识别".to_string());
    }
    copy_if_exists(&screenshot_source, &target.join(SCREENSHOT_FILE_NAME))?;

    let curve_data_url = curve_image_data_url
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "未生成振动测试曲线".to_string())?;
    let encoded = curve_data_url
        .split_once(',')
        .map(|(_, value)| value)
        .unwrap_or(curve_data_url.as_str());
    let curve_bytes = BASE64
        .decode(encoded)
        .map_err(|error| format!("解析振动测试曲线失败: {}", error))?;
    fs::write(target.join(CURVE_FILE_NAME), curve_bytes)
        .map_err(|error| format!("保存振动测试曲线失败: {}", error))?;

    Ok(serde_json::json!({
        "export_dir": target.to_string_lossy(),
        "json_path": target.join(RESULT_FILE_NAME).to_string_lossy(),
        "csv_path": target.join(CSV_FILE_NAME).to_string_lossy(),
        "curve_path": target.join(CURVE_FILE_NAME).to_string_lossy(),
        "screenshot_path": target.join(SCREENSHOT_FILE_NAME).to_string_lossy(),
    }))
}
