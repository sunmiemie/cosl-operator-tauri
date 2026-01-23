//! Flojoy 服务进程管理
//!
//! 负责启动、停止和监控 Flojoy 服务进程
//! 支持内嵌运行时（从资源目录加载）和外部运行时两种模式

use lazy_static::lazy_static;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

/// Flojoy 服务状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FlojoyStatus {
    /// 未启动
    Stopped,
    /// 正在启动
    Starting,
    /// 运行中
    Running,
    /// 启动失败
    Failed,
    /// 正在停止
    Stopping,
}

/// Flojoy 运行时模式
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FlojoyRuntimeMode {
    /// 内嵌模式：使用打包的运行时和资源
    Embedded,
    /// 外部模式：使用用户指定的外部路径
    External,
}

impl Default for FlojoyRuntimeMode {
    fn default() -> Self {
        FlojoyRuntimeMode::Embedded
    }
}

/// Flojoy 服务配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlojoyConfig {
    /// 运行时模式
    #[serde(default)]
    pub mode: FlojoyRuntimeMode,
    /// 外部可执行文件路径（仅外部模式使用）
    #[serde(default)]
    pub executable_path: String,
    /// 启动参数
    #[serde(default)]
    pub args: Vec<String>,
    /// 监听端口
    #[serde(default = "default_port")]
    pub port: u16,
    /// 启动超时时间（秒）
    #[serde(default = "default_timeout")]
    pub startup_timeout: u64,
}

fn default_port() -> u16 {
    5392
}

fn default_timeout() -> u64 {
    30
}

impl Default for FlojoyConfig {
    fn default() -> Self {
        Self {
            mode: FlojoyRuntimeMode::Embedded,
            executable_path: String::new(),
            args: vec![],
            port: 5392,
            startup_timeout: 30,
        }
    }
}

/// Flojoy 状态信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlojoyStatusInfo {
    /// 当前状态
    pub status: FlojoyStatus,
    /// 运行时模式
    pub mode: FlojoyRuntimeMode,
    /// 端口号
    pub port: u16,
    /// 错误信息
    pub error: Option<String>,
    /// 服务 URL
    pub url: Option<String>,
    /// 是否内嵌资源可用
    pub embedded_available: bool,
}

/// 内嵌资源路径信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbeddedPaths {
    /// Python 可执行文件路径
    pub python_path: Option<PathBuf>,
    /// Flojoy UI 静态资源路径
    pub ui_path: Option<PathBuf>,
    /// Flojoy 后端源码路径
    pub backend_path: Option<PathBuf>,
    /// 是否所有资源都可用
    pub all_available: bool,
}

/// Flojoy 服务状态管理
struct FlojoyState {
    /// 进程句柄
    process: Option<Child>,
    /// 当前状态
    status: FlojoyStatus,
    /// 配置
    config: FlojoyConfig,
    /// 错误信息
    error: Option<String>,
    /// 是否正在运行（用于线程通信）
    running: Arc<AtomicBool>,
    /// 内嵌资源路径（缓存）
    embedded_paths: Option<EmbeddedPaths>,
}

impl Default for FlojoyState {
    fn default() -> Self {
        Self {
            process: None,
            status: FlojoyStatus::Stopped,
            config: FlojoyConfig::default(),
            error: None,
            running: Arc::new(AtomicBool::new(false)),
            embedded_paths: None,
        }
    }
}

lazy_static! {
    static ref FLOJOY_STATE: Mutex<FlojoyState> = Mutex::new(FlojoyState::default());
}

/// 检查端口是否可连接
fn check_port_available(port: u16) -> bool {
    match TcpStream::connect_timeout(
        &format!("127.0.0.1:{}", port).parse().unwrap(),
        Duration::from_millis(500),
    ) {
        Ok(_) => true,
        Err(_) => false,
    }
}

/// 等待端口可用
fn wait_for_port(port: u16, timeout_secs: u64) -> bool {
    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs);

    while start.elapsed() < timeout {
        if check_port_available(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(500));
    }

    false
}

/// 获取平台特定的 Python 可执行文件名
fn get_python_executable_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "python.exe"
    }
    #[cfg(not(target_os = "windows"))]
    {
        "bin/python3"
    }
}

/// 查找系统 Python
fn find_system_python() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        // Windows: 尝试 python, python3, py
        for cmd in &["python", "python3", "py"] {
            if let Ok(output) = Command::new(cmd)
                .args(&["--version"])
                .output()
            {
                if output.status.success() {
                    return Some(PathBuf::from(cmd));
                }
            }
        }
        None
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Linux/macOS: 尝试 python3, python
        for cmd in &["python3", "python"] {
            if let Ok(output) = Command::new(cmd)
                .args(&["--version"])
                .output()
            {
                if output.status.success() {
                    return Some(PathBuf::from(cmd));
                }
            }
        }
        None
    }
}

/// 解析内嵌资源路径
fn resolve_embedded_paths(app: &AppHandle) -> EmbeddedPaths {
    let resource_dir = app
        .path()
        .resource_dir()
        .ok()
        .unwrap_or_else(|| PathBuf::from("."));

    // Python 运行时路径
    // 优先级: 1. 打包的 Python 2. 开发目录的 Python 3. 系统 Python
    let python_path = {
        let target_triple = get_target_triple();
        
        // 尝试打包后的路径
        let bundled_python_dir = resource_dir.join("runtime").join("python");
        let bundled_python_exe = bundled_python_dir.join(get_python_executable_name());
        
        if bundled_python_exe.exists() {
            Some(bundled_python_exe)
        } else {
            // 开发模式：在 binaries 目录下按平台查找
            let dev_python_dir = resource_dir
                .join("..")
                .join("binaries")
                .join(format!("python-{}", target_triple));
            let dev_python_exe = dev_python_dir.join(get_python_executable_name());
            
            if dev_python_exe.exists() {
                Some(dev_python_exe)
            } else {
                // 尝试不带平台后缀的路径
                let alt_python_dir = resource_dir.join("..").join("binaries").join("python");
                let alt_python_exe = alt_python_dir.join(get_python_executable_name());
                
                if alt_python_exe.exists() {
                    Some(alt_python_exe)
                } else {
                    // 回退到系统 Python
                    find_system_python()
                }
            }
        }
    };

    // Flojoy UI 路径
    let ui_path = resource_dir.join("flojoy").join("ui");
    let ui_available = ui_path.exists() && ui_path.is_dir() 
        && ui_path.join("index.html").exists();

    // Flojoy Backend 路径
    let backend_path = resource_dir.join("flojoy").join("backend");
    let backend_available = backend_path.exists() && backend_path.is_dir()
        && (backend_path.join("main_with_ui.py").exists() 
            || backend_path.join("captain").exists());

    // 只要有 Python 和后端就算可用（UI 是可选的，因为 main_with_ui.py 会自动查找）
    let all_available = python_path.is_some() && backend_available;

    EmbeddedPaths {
        python_path,
        ui_path: if ui_available { Some(ui_path) } else { None },
        backend_path: if backend_available {
            Some(backend_path)
        } else {
            None
        },
        all_available,
    }
}

/// 获取当前平台的目标三元组
fn get_target_triple() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        "x86_64-pc-windows-msvc"
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        "x86_64-unknown-linux-gnu"
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        "aarch64-unknown-linux-gnu"
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        "x86_64-apple-darwin"
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        "aarch64-apple-darwin"
    }
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64")
    )))]
    {
        "unknown"
    }
}

/// 检查内嵌资源是否可用
#[tauri::command]
pub fn check_embedded_flojoy(app: AppHandle) -> EmbeddedPaths {
    let paths = resolve_embedded_paths(&app);
    
    // 缓存路径信息
    {
        let mut state = FLOJOY_STATE.lock();
        state.embedded_paths = Some(paths.clone());
    }
    
    paths
}

/// 启动 Flojoy 服务
#[tauri::command]
pub fn start_flojoy(app: AppHandle, config: FlojoyConfig) -> Result<FlojoyStatusInfo, String> {
    let mut state = FLOJOY_STATE.lock();

    // 检查是否已经在运行
    if state.status == FlojoyStatus::Running || state.status == FlojoyStatus::Starting {
        return Ok(FlojoyStatusInfo {
            status: state.status.clone(),
            mode: state.config.mode.clone(),
            port: state.config.port,
            error: None,
            url: Some(format!("http://127.0.0.1:{}", state.config.port)),
            embedded_available: state.embedded_paths.as_ref().map(|p| p.all_available).unwrap_or(false),
        });
    }

    // 解析内嵌资源路径
    let embedded_paths = resolve_embedded_paths(&app);
    state.embedded_paths = Some(embedded_paths.clone());

    // 根据模式确定启动参数
    let (python_path, backend_path, ui_path) = match config.mode {
        FlojoyRuntimeMode::Embedded => {
            // 内嵌模式：使用内嵌资源
            // 检查必要资源
            if embedded_paths.python_path.is_none() {
                return Err("未找到 Python 运行时，请安装 Python 或运行 setup-runtime 脚本".to_string());
            }
            if embedded_paths.backend_path.is_none() {
                return Err("未找到 Flojoy 后端，请运行 build-flojoy 脚本".to_string());
            }
            
            // UI 是可选的，如果没有，main_with_ui.py 会以 API-only 模式运行
            (
                embedded_paths.python_path.clone().unwrap(),
                embedded_paths.backend_path.clone().unwrap(),
                embedded_paths.ui_path.clone(),
            )
        }
        FlojoyRuntimeMode::External => {
            // 外部模式：使用用户指定路径
            if config.executable_path.is_empty() {
                return Err("未配置外部 Flojoy 可执行文件路径".to_string());
            }
            
            let exe_path = PathBuf::from(&config.executable_path);
            if !exe_path.exists() {
                return Err(format!("外部可执行文件不存在: {}", config.executable_path));
            }
            
            // 外部模式下，backend 和 ui 路径可以为空（由外部服务自行管理）
            (exe_path, PathBuf::new(), None)
        }
    };

    // 更新配置
    state.config = config.clone();
    state.status = FlojoyStatus::Starting;
    state.error = None;
    state.running.store(true, Ordering::SeqCst);

    // 发送状态更新事件
    let _ = app.emit(
        "flojoy-status",
        FlojoyStatusInfo {
            status: FlojoyStatus::Starting,
            mode: config.mode.clone(),
            port: config.port,
            error: None,
            url: None,
            embedded_available: embedded_paths.all_available,
        },
    );

    // 构建启动命令
    let mut cmd = if config.mode == FlojoyRuntimeMode::Embedded {
        // 内嵌模式：使用 Python 启动 Flojoy 后端
        let mut c = Command::new(&python_path);
        
        // 设置工作目录为后端目录
        c.current_dir(&backend_path);
        
        // 使用 main_with_ui.py 入口（同时服务 API 和 UI 静态文件）
        let entry_point = backend_path.join("main_with_ui.py");
        if entry_point.exists() {
            c.arg(&entry_point);
        } else {
            // 回退到 captain.main
            c.arg("-m").arg("captain.main");
        }
        
        // 设置环境变量
        c.env("FLOJOY_PORT", config.port.to_string());
        
        // 如果有 UI 路径，通过环境变量传递
        if let Some(ref ui) = ui_path {
            c.env("FLOJOY_UI_DIR", ui);
        }
        
        // 添加自定义参数
        c.args(&config.args);
        
        c
    } else {
        // 外部模式：直接使用外部可执行文件
        let mut c = Command::new(&python_path);
        c.args(&config.args);
        c
    };

    // 配置标准输出
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());

    // 设置环境变量（避免 Python 缓冲输出）
    cmd.env("PYTHONUNBUFFERED", "1");

    match cmd.spawn() {
        Ok(mut child) => {
            let port = config.port;
            let timeout = config.startup_timeout;
            let mode = config.mode.clone();
            let app_clone = app.clone();
            let running = state.running.clone();
            let embedded_available = embedded_paths.all_available;

            // 捕获 stdout 用于日志
            if let Some(stdout) = child.stdout.take() {
                let app_log = app.clone();
                thread::spawn(move || {
                    let reader = BufReader::new(stdout);
                    for line in reader.lines() {
                        if let Ok(line) = line {
                            let _ = app_log.emit(
                                "flojoy-log",
                                serde_json::json!({
                                    "type": "stdout",
                                    "message": line
                                }),
                            );
                        }
                    }
                });
            }

            // 捕获 stderr 用于错误日志
            if let Some(stderr) = child.stderr.take() {
                let app_err = app.clone();
                thread::spawn(move || {
                    let reader = BufReader::new(stderr);
                    for line in reader.lines() {
                        if let Ok(line) = line {
                            let _ = app_err.emit(
                                "flojoy-log",
                                serde_json::json!({
                                    "type": "stderr",
                                    "message": line
                                }),
                            );
                        }
                    }
                });
            }

            state.process = Some(child);

            // 在后台线程中等待服务启动
            thread::spawn(move || {
                if wait_for_port(port, timeout) && running.load(Ordering::SeqCst) {
                    // 服务启动成功
                    {
                        let mut state = FLOJOY_STATE.lock();
                        state.status = FlojoyStatus::Running;
                    }
                    let _ = app_clone.emit(
                        "flojoy-status",
                        FlojoyStatusInfo {
                            status: FlojoyStatus::Running,
                            mode: mode.clone(),
                            port,
                            error: None,
                            url: Some(format!("http://127.0.0.1:{}", port)),
                            embedded_available,
                        },
                    );
                } else if running.load(Ordering::SeqCst) {
                    // 服务启动超时
                    {
                        let mut state = FLOJOY_STATE.lock();
                        state.status = FlojoyStatus::Failed;
                        state.error = Some("服务启动超时".to_string());
                    }
                    let _ = app_clone.emit(
                        "flojoy-status",
                        FlojoyStatusInfo {
                            status: FlojoyStatus::Failed,
                            mode,
                            port,
                            error: Some("服务启动超时".to_string()),
                            url: None,
                            embedded_available,
                        },
                    );
                }
            });

            Ok(FlojoyStatusInfo {
                status: FlojoyStatus::Starting,
                mode: config.mode,
                port: config.port,
                error: None,
                url: None,
                embedded_available: embedded_paths.all_available,
            })
        }
        Err(e) => {
            state.status = FlojoyStatus::Failed;
            state.error = Some(e.to_string());
            state.running.store(false, Ordering::SeqCst);

            let _ = app.emit(
                "flojoy-status",
                FlojoyStatusInfo {
                    status: FlojoyStatus::Failed,
                    mode: config.mode.clone(),
                    port: config.port,
                    error: Some(e.to_string()),
                    url: None,
                    embedded_available: embedded_paths.all_available,
                },
            );

            Err(format!("启动 Flojoy 失败: {}", e))
        }
    }
}

/// 停止 Flojoy 服务
#[tauri::command]
pub fn stop_flojoy(app: AppHandle) -> Result<FlojoyStatusInfo, String> {
    let mut state = FLOJOY_STATE.lock();

    let embedded_available = state.embedded_paths.as_ref().map(|p| p.all_available).unwrap_or(false);

    if state.status == FlojoyStatus::Stopped {
        return Ok(FlojoyStatusInfo {
            status: FlojoyStatus::Stopped,
            mode: state.config.mode.clone(),
            port: state.config.port,
            error: None,
            url: None,
            embedded_available,
        });
    }

    state.status = FlojoyStatus::Stopping;
    state.running.store(false, Ordering::SeqCst);

    let _ = app.emit(
        "flojoy-status",
        FlojoyStatusInfo {
            status: FlojoyStatus::Stopping,
            mode: state.config.mode.clone(),
            port: state.config.port,
            error: None,
            url: None,
            embedded_available,
        },
    );

    // 终止进程
    if let Some(ref mut child) = state.process {
        match child.kill() {
            Ok(_) => {
                // 等待进程退出
                let _ = child.wait();
            }
            Err(e) => {
                println!("警告: 终止 Flojoy 进程时出错: {}", e);
            }
        }
    }

    state.process = None;
    state.status = FlojoyStatus::Stopped;
    state.error = None;

    let _ = app.emit(
        "flojoy-status",
        FlojoyStatusInfo {
            status: FlojoyStatus::Stopped,
            mode: state.config.mode.clone(),
            port: state.config.port,
            error: None,
            url: None,
            embedded_available,
        },
    );

    Ok(FlojoyStatusInfo {
        status: FlojoyStatus::Stopped,
        mode: state.config.mode.clone(),
        port: state.config.port,
        error: None,
        url: None,
        embedded_available,
    })
}

/// 获取 Flojoy 服务状态
#[tauri::command]
pub fn flojoy_status() -> FlojoyStatusInfo {
    let state = FLOJOY_STATE.lock();

    let embedded_available = state.embedded_paths.as_ref().map(|p| p.all_available).unwrap_or(false);

    // 如果状态显示正在运行，验证端口是否真的可用
    let actual_status = if state.status == FlojoyStatus::Running {
        if check_port_available(state.config.port) {
            FlojoyStatus::Running
        } else {
            FlojoyStatus::Stopped
        }
    } else {
        state.status.clone()
    };

    FlojoyStatusInfo {
        status: actual_status.clone(),
        mode: state.config.mode.clone(),
        port: state.config.port,
        error: state.error.clone(),
        url: if actual_status == FlojoyStatus::Running {
            Some(format!("http://127.0.0.1:{}", state.config.port))
        } else {
            None
        },
        embedded_available,
    }
}

/// 重启 Flojoy 服务
#[tauri::command]
pub fn restart_flojoy(app: AppHandle) -> Result<FlojoyStatusInfo, String> {
    let config = {
        let state = FLOJOY_STATE.lock();
        state.config.clone()
    };

    // 先停止
    stop_flojoy(app.clone())?;

    // 等待一下再启动
    thread::sleep(Duration::from_millis(500));

    // 再启动
    start_flojoy(app, config)
}

/// 更新 Flojoy 配置（不启动服务）
#[tauri::command]
pub fn update_flojoy_config(config: FlojoyConfig) -> Result<(), String> {
    let mut state = FLOJOY_STATE.lock();

    // 如果服务正在运行，不允许更新配置
    if state.status == FlojoyStatus::Running || state.status == FlojoyStatus::Starting {
        return Err("服务运行中，无法更新配置。请先停止服务。".to_string());
    }

    state.config = config;
    Ok(())
}

/// 获取当前 Flojoy 配置
#[tauri::command]
pub fn get_flojoy_config() -> FlojoyConfig {
    let state = FLOJOY_STATE.lock();
    state.config.clone()
}
