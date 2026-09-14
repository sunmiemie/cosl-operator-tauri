use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const EVENT_NAME: &str = "sensorless-oven-monitor";

pub struct SensorlessOvenState {
    pub process: Arc<Mutex<Option<Child>>>,
}

impl Default for SensorlessOvenState {
    fn default() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct SensorlessOvenPort {
    pub device: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub hwid: String,
    #[serde(default)]
    pub serial_number: String,
    #[serde(default)]
    pub manufacturer: String,
    #[serde(default)]
    pub vid: Option<u32>,
    #[serde(default)]
    pub pid: Option<u32>,
    #[serde(default)]
    pub by_id: Option<String>,
    #[serde(default)]
    pub display: String,
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

fn wait_for_exit(child: &mut Child) -> Result<(), String> {
    for _ in 0..50 {
        if child
            .try_wait()
            .map_err(|error| format!("等待无感烘箱采集进程退出失败: {}", error))?
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

    match child.wait() {
        Ok(_) => Ok(()),
        Err(error) => {
            if child
                .try_wait()
                .map_err(|wait_error| format!("等待无感烘箱采集进程退出失败: {}", wait_error))?
                .is_some()
            {
                Ok(())
            } else {
                Err(format!("等待无感烘箱采集进程退出失败: {}", error))
            }
        }
    }
}

fn release_process(process: &Mutex<Option<Child>>) -> Result<(), String> {
    let mut guard = process.lock().map_err(|error| error.to_string())?;
    if let Some(child) = guard.as_mut() {
        wait_for_exit(child)?;
    }
    *guard = None;
    Ok(())
}

pub fn cleanup_sensorless_oven(state: &SensorlessOvenState) {
    if let Ok(mut process_guard) = state.process.lock() {
        if let Some(ref mut child) = *process_guard {
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
            *process_guard = None;
        }
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

fn write_control_action(output_dir: &Path, action: &str) -> Result<(), String> {
    let control_path = output_dir.join("capture_control.json");
    fs::write(
        &control_path,
        serde_json::to_string_pretty(&serde_json::json!({ "action": action }))
            .map_err(|error| format!("序列化采集控制指令失败: {}", error))?,
    )
    .map_err(|error| format!("写入采集控制指令失败: {}", error))
}

fn ensure_pyserial(python_program: &str) -> Result<(), String> {
    let import_check = create_hidden_command(python_program)
        .args(["-c", "import serial, serial.tools.list_ports"])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("检查 pyserial 失败: {}", error))?;

    if import_check.status.success() {
        return Ok(());
    }

    let detail = String::from_utf8_lossy(&import_check.stderr)
        .trim()
        .to_string();
    Err(format!(
        "当前 Python 缺少 pyserial，请按 resources/sensorless-oven/yet-service/requirements.txt 安装依赖。Python: {}{}",
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
            "resources/sensorless-oven/yet-service/run_sensorless_oven_monitor.py",
            BaseDirectory::Resource,
        )
        .map_err(|error| format!("解析无感烘箱采集脚本失败: {}", error))?;
    if bundled.exists() {
        return Ok(bundled);
    }

    let current_dir = std::env::current_dir().map_err(|error| format!("获取当前工作目录失败: {}", error))?;
    for candidate in [
        current_dir
            .join("src-tauri")
            .join("resources")
            .join("sensorless-oven")
            .join("yet-service")
            .join("run_sensorless_oven_monitor.py"),
        current_dir
            .join("resources")
            .join("sensorless-oven")
            .join("yet-service")
            .join("run_sensorless_oven_monitor.py"),
    ] {
        if candidate.exists() {
            return Ok(candidate);
        }
    }

    Err("未找到无感烘箱采集脚本 resources/sensorless-oven/yet-service/run_sensorless_oven_monitor.py".to_string())
}

fn sanitize_folder_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.trim_matches('_').is_empty() {
        "unknown".to_string()
    } else {
        cleaned
    }
}

fn create_output_dir(app: &AppHandle, order_id: &str, session_id: &str) -> Result<PathBuf, String> {
    let stamp = if session_id.trim().is_empty() {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis()
            .to_string()
    } else {
        sanitize_folder_name(session_id)
    };
    let order_folder = sanitize_folder_name(order_id);
    let base_dir = app
        .path()
        .resolve("sensorless-oven", BaseDirectory::AppData)
        .map_err(|error| format!("解析无感烘箱采集输出目录失败: {}", error))?;
    let output_dir = base_dir.join(order_folder).join(stamp);
    fs::create_dir_all(&output_dir).map_err(|error| format!("创建采集输出目录失败: {}", error))?;
    Ok(output_dir)
}

fn run_python_json(
    python_program: &str,
    script_path: &Path,
    extra_args: &[&str],
) -> Result<serde_json::Value, String> {
    let output = create_hidden_command(python_program)
        .arg(script_path)
        .args(extra_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|error| format!("运行无感烘箱采集脚本失败: {}", error))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("无感烘箱采集脚本退出失败，退出码: {:?}", output.status.code())
        } else {
            stderr
        });
    }

    let line = stdout
        .lines()
        .rev()
        .find(|item| !item.trim().is_empty())
        .ok_or_else(|| "无感烘箱采集脚本没有返回数据".to_string())?;
    serde_json::from_str(line).map_err(|error| format!("解析无感烘箱采集脚本输出失败: {}", error))
}

fn ensure_process_running(state: &State<SensorlessOvenState>) -> Result<(), String> {
    let mut guard = state.process.lock().map_err(|error| error.to_string())?;
    let child = guard
        .as_mut()
        .ok_or_else(|| "无感烘箱采集进程未运行".to_string())?;
    if child
        .try_wait()
        .map_err(|error| format!("检查无感烘箱采集进程失败: {}", error))?
        .is_some()
    {
        return Err("无感烘箱采集进程已结束".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn list_sensorless_oven_ports(
    app: AppHandle,
    python_path: Option<String>,
) -> Result<Vec<SensorlessOvenPort>, String> {
    let python_program = crate::ocr_runtime::resolve_ocr_python(&app, python_path)?;
    ensure_pyserial(&python_program)?;
    let script_path = resolve_script_path(&app)?;
    let payload = run_python_json(&python_program, &script_path, &["--list-ports"])?;
    let ports = payload
        .get("ports")
        .cloned()
        .unwrap_or(serde_json::Value::Array(vec![]));
    serde_json::from_value(ports).map_err(|error| format!("解析串口列表失败: {}", error))
}

#[tauri::command]
pub fn start_sensorless_oven_monitor(
    app: AppHandle,
    state: State<SensorlessOvenState>,
    left_port: String,
    right_port: String,
    order_id: Option<String>,
    session_id: Option<String>,
    python_path: Option<String>,
) -> Result<serde_json::Value, String> {
    let left_port = left_port.trim().to_string();
    let right_port = right_port.trim().to_string();
    if left_port.is_empty() && right_port.is_empty() {
        return Err("请先在设置中配置无感烘箱左侧或右侧设备".to_string());
    }
    if !left_port.is_empty() && left_port == right_port {
        return Err("左右侧串口不能相同".to_string());
    }

    let python_program = crate::ocr_runtime::resolve_ocr_python(&app, python_path)?;
    ensure_pyserial(&python_program)?;
    let script_path = resolve_script_path(&app)?;
    let output_dir = create_output_dir(
        &app,
        order_id.as_deref().unwrap_or("unknown"),
        session_id.as_deref().unwrap_or(""),
    )?;

    release_process(&state.process)?;

    let script_path_str = script_path.to_string_lossy().to_string();
    let output_dir_str = output_dir.to_string_lossy().to_string();
    let mut args = vec![
        script_path_str.clone(),
        "--output-dir".to_string(),
        output_dir_str.clone(),
    ];
    if !left_port.is_empty() {
        args.push("--left-port".to_string());
        args.push(left_port.clone());
    }
    if !right_port.is_empty() {
        args.push("--right-port".to_string());
        args.push(right_port.clone());
    }
    let mut cmd = create_hidden_command(&python_program);
    cmd.args(&args)
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());

    if let Some(script_dir) = script_path.parent() {
        cmd.current_dir(script_dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|error| format!("启动无感烘箱采集进程失败: {}", error))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取无感烘箱采集进程标准输出".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取无感烘箱采集进程错误输出".to_string())?;

    {
        let mut guard = state.process.lock().map_err(|error| error.to_string())?;
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
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { continue };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            match serde_json::from_str::<serde_json::Value>(trimmed) {
                Ok(payload) => {
                    let _ = app_clone.emit(EVENT_NAME, payload);
                }
                Err(_) => {
                    let _ = app_clone.emit(
                        EVENT_NAME,
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
        let wait_result = match process_handle.lock() {
            Ok(mut guard) => guard
                .as_mut()
                .and_then(|child| child.try_wait().ok().flatten()),
            Err(_) => None,
        };
        if let Some(status) = wait_result {
            if !status.success() {
                let message = if stderr_text.is_empty() {
                    format!("无感烘箱采集进程退出失败，退出码: {:?}", status.code())
                } else {
                    stderr_text
                };
                let _ = app_clone.emit(
                    EVENT_NAME,
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
        "left_port": left_port,
        "right_port": right_port,
    }))
}

#[tauri::command]
pub fn pause_sensorless_oven_monitor(
    state: State<SensorlessOvenState>,
    output_dir: String,
) -> Result<(), String> {
    ensure_exists(&output_dir, "采集输出目录")?;
    ensure_process_running(&state)?;
    write_control_action(Path::new(&output_dir), "pause")
}

#[tauri::command]
pub fn resume_sensorless_oven_monitor(
    state: State<SensorlessOvenState>,
    output_dir: String,
) -> Result<(), String> {
    ensure_exists(&output_dir, "采集输出目录")?;
    ensure_process_running(&state)?;
    write_control_action(Path::new(&output_dir), "resume")
}

#[tauri::command]
pub fn stop_sensorless_oven_monitor(
    state: State<SensorlessOvenState>,
    output_dir: Option<String>,
) -> Result<(), String> {
    if let Some(dir) = output_dir.as_ref() {
        if Path::new(dir).exists() {
            let _ = write_control_action(Path::new(dir), "stop");
        }
    }
    release_process(&state.process)
}
