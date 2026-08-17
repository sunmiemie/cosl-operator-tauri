//! Flojoy Python 后端进程管理
//! 支持 Python 解释器配置、版本检测、Poetry 依赖安装

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// Windows: 隐藏命令行窗口
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// 创建隐藏窗口的 Command（跨平台）
fn create_hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Flojoy 后端状态
pub struct FlojoyBackendState {
    /// Python 解释器路径
    python_path: Mutex<String>,
    /// Flojoy 后端目录（resources/flojoy）
    backend_dir: Mutex<String>,
    /// 后端进程（pub 供 lib.rs 访问以便清理）
    pub process: Mutex<Option<Child>>,
    /// 后端端口
    port: Mutex<u16>,
    /// Poetry 是否已安装
    poetry_installed: Mutex<bool>,
    /// 依赖是否已安装
    dependencies_installed: Mutex<bool>,
}

impl Default for FlojoyBackendState {
    fn default() -> Self {
        Self {
            python_path: Mutex::new(String::new()),
            backend_dir: Mutex::new(String::new()),
            process: Mutex::new(None),
            port: Mutex::new(5392),
            poetry_installed: Mutex::new(false),
            dependencies_installed: Mutex::new(false),
        }
    }
}

/// 获取 Flojoy 后端目录路径
/// 根据 Tauri 官方文档，使用 resolve 方法解析资源路径
/// 参考: https://v2.tauri.app/zh-cn/develop/resources/
fn get_flojoy_dir(app: &AppHandle) -> PathBuf {
    // 使用 Tauri 官方 API 解析资源路径
    // tauri.conf.json 配置: "resources/flojoy/**/*" (数组格式保留路径结构)
    // 解析路径需要与配置中的源路径一致
    println!(
        "resource_path: {:?}",
        app.path()
            .resolve("resources/flojoy", BaseDirectory::Resource)
    );
    match app
        .path()
        .resolve("resources/flojoy", BaseDirectory::Resource)
    {
        Ok(resource_path) => resource_path,
        Err(e) => {
            eprintln!("Failed to resolve flojoy resource path: {}", e);
            PathBuf::from("resources/flojoy")
        }
    }
}

/// 配置 Python 解释器路径
#[tauri::command]
pub fn configure_python(
    state: State<FlojoyBackendState>,
    app: AppHandle,
    python_path: String,
) -> Result<(), String> {
    let mut py_path = state.python_path.lock().map_err(|e| e.to_string())?;
    let mut be_dir = state.backend_dir.lock().map_err(|e| e.to_string())?;

    *py_path = python_path;
    *be_dir = get_flojoy_dir(&app).to_string_lossy().to_string();

    Ok(())
}

/// 检查 Python 版本
#[tauri::command]
pub fn check_python_version(python_path: String) -> Result<(u32, u32, u32, bool), String> {
    // 执行 python --version 获取版本
    let output = create_hidden_command(&python_path)
        .args(["--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("无法执行 Python: {}", e))?;

    let version_str = String::from_utf8_lossy(&output.stdout);
    let version_str = if version_str.is_empty() {
        String::from_utf8_lossy(&output.stderr)
    } else {
        version_str
    };

    // 解析版本号 "Python 3.11.5"
    let parts: Vec<&str> = version_str.trim().split_whitespace().collect();
    if parts.len() < 2 {
        return Err(format!("无法解析 Python 版本: {}", version_str));
    }

    let version_parts: Vec<&str> = parts[1].split('.').collect();
    if version_parts.len() < 2 {
        return Err(format!("无法解析版本号: {}", parts[1]));
    }

    let major: u32 = version_parts[0].parse().map_err(|_| "无法解析主版本号")?;
    let minor: u32 = version_parts[1].parse().map_err(|_| "无法解析次版本号")?;
    let patch: u32 = version_parts
        .get(2)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);

    // 检查是否为 Python 3.11
    let is_valid = major == 3 && minor == 11;

    Ok((major, minor, patch, is_valid))
}

/// 检查 Poetry 是否已安装
#[tauri::command]
pub fn check_poetry_installed(state: State<FlojoyBackendState>) -> Result<bool, String> {
    let py_path = state.python_path.lock().map_err(|e| e.to_string())?;
    if py_path.is_empty() {
        return Err("请先配置 Python 解释器".to_string());
    }

    // 获取 poetry 路径
    let poetry_path = get_poetry_path(&py_path);

    // 首先尝试直接运行 poetry
    let output = create_hidden_command(&poetry_path)
        .args(["--version"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    let installed = match output {
        Ok(out) if out.status.success() => true,
        _ => {
            // 尝试通过 python -m poetry
            create_hidden_command(&*py_path)
                .args(["-m", "poetry", "--version"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .output()
                .map(|o| o.status.success())
                .unwrap_or(false)
        }
    };

    let mut poetry_installed = state.poetry_installed.lock().map_err(|e| e.to_string())?;
    *poetry_installed = installed;

    Ok(installed)
}

/// 安装 Poetry
#[tauri::command]
pub fn install_poetry(state: State<FlojoyBackendState>) -> Result<String, String> {
    let py_path = state.python_path.lock().map_err(|e| e.to_string())?;
    if py_path.is_empty() {
        return Err("请先配置 Python 解释器".to_string());
    }

    // 直接用 pip 安装 poetry（更可靠，支持 python -m poetry）
    let output = create_hidden_command(&*py_path)
        .args(["-m", "pip", "install", "poetry"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("安装 Poetry 失败: {}", e))?;

    if output.status.success() {
        let mut poetry_installed = state.poetry_installed.lock().map_err(|e| e.to_string())?;
        *poetry_installed = true;
        Ok("Poetry 安装成功".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Poetry 安装失败: {}", stderr))
    }
}

/// 获取 Poetry 可执行路径
fn get_poetry_path(python_path: &str) -> String {
    // 尝试从 Python 路径推断 Poetry 路径
    let python_dir = std::path::Path::new(python_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    #[cfg(target_os = "windows")]
    {
        // Windows: 检查 Scripts 目录
        let poetry_in_scripts = format!("{}\\Scripts\\poetry.exe", python_dir);
        if std::path::Path::new(&poetry_in_scripts).exists() {
            return poetry_in_scripts;
        }

        // 检查用户 pipx 目录
        if let Ok(home) = std::env::var("USERPROFILE") {
            let pipx_poetry = format!(
                "{}\\AppData\\Local\\pipx\\pipx\\venvs\\poetry\\Scripts\\poetry.exe",
                home
            );
            if std::path::Path::new(&pipx_poetry).exists() {
                return pipx_poetry;
            }
            // 检查用户 Scripts 目录
            let user_poetry = format!(
                "{}\\AppData\\Roaming\\Python\\Python311\\Scripts\\poetry.exe",
                home
            );
            if std::path::Path::new(&user_poetry).exists() {
                return user_poetry;
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Unix: 检查 bin 目录
        let poetry_in_bin = format!("{}/poetry", python_dir);
        if std::path::Path::new(&poetry_in_bin).exists() {
            return poetry_in_bin;
        }

        // 检查用户 pipx 目录
        if let Ok(home) = std::env::var("HOME") {
            let pipx_poetry = format!("{}/.local/pipx/venvs/poetry/bin/poetry", home);
            if std::path::Path::new(&pipx_poetry).exists() {
                return pipx_poetry;
            }
            let local_poetry = format!("{}/.local/bin/poetry", home);
            if std::path::Path::new(&local_poetry).exists() {
                return local_poetry;
            }
        }
    }

    // 默认使用 poetry（依赖 PATH）
    "poetry".to_string()
}

/// 确保 Flojoy 运行所需的 Poetry 依赖已安装
fn ensure_flojoy_dependencies(
    poetry_path: &str,
    python_path: &str,
    working_dir: &PathBuf,
) -> Result<bool, String> {
    let import_check = create_hidden_command(poetry_path)
        .args(["run", "python", "-c", "import uvicorn"])
        .current_dir(working_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output();

    if let Ok(out) = import_check {
        if out.status.success() {
            return Ok(false);
        }
    }

    println!("[Flojoy] 检测到依赖缺失，尝试执行 poetry install --no-root");

    let install_result = create_hidden_command(poetry_path)
        .args(["install", "--no-interaction", "--no-root"])
        .current_dir(working_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    if let Ok(out) = install_result {
        if out.status.success() {
            println!("[Flojoy] Poetry 依赖安装完成");
            return Ok(true);
        }
    }

    if !python_path.is_empty() {
        let fallback = create_hidden_command(python_path)
            .args(["-m", "poetry", "install", "--no-interaction", "--no-root"])
            .current_dir(working_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .map_err(|e| format!("安装 Flojoy 依赖失败: {}", e))?;

        if fallback.status.success() {
            println!("[Flojoy] 通过 python -m poetry 安装依赖完成");
            return Ok(true);
        }

        let stderr = String::from_utf8_lossy(&fallback.stderr);
        return Err(format!("安装 Flojoy 依赖失败: {}", stderr));
    }

    Err("安装 Flojoy 依赖失败，Poetry 环境尚未完成初始化".to_string())
}

/// 安装依赖
#[tauri::command]
pub fn install_dependencies(
    state: State<FlojoyBackendState>,
    app: AppHandle,
) -> Result<String, String> {
    let py_path = state.python_path.lock().map_err(|e| e.to_string())?;
    let mut be_dir = state.backend_dir.lock().map_err(|e| e.to_string())?;

    // 如果后端目录未配置或不存在，重新获取
    if be_dir.is_empty() || !std::path::Path::new(&*be_dir).exists() {
        let new_dir = get_flojoy_dir(&app);
        if !new_dir.exists() {
            return Err(format!("Flojoy 后端目录不存在: {:?}", new_dir));
        }
        *be_dir = new_dir.to_string_lossy().to_string();
    }

    // 验证目录存在
    let backend_path = std::path::Path::new(&*be_dir);
    if !backend_path.exists() {
        return Err(format!("后端目录不存在: {}", *be_dir));
    }

    // 验证 pyproject.toml 存在
    if !backend_path.join("pyproject.toml").exists() {
        return Err(format!("pyproject.toml 不存在于: {}", *be_dir));
    }

    // 获取 poetry 路径
    let poetry_path = get_poetry_path(&py_path);

    // 首先使用 poetry env use 指定 Python 版本
    let env_use_result = create_hidden_command(&poetry_path)
        .args(["env", "use", &*py_path])
        .current_dir(&*be_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    // 如果直接调用 poetry 失败，尝试通过 python -m poetry
    if env_use_result.is_err() || !env_use_result.as_ref().unwrap().status.success() {
        let _ = create_hidden_command(&*py_path)
            .args(["-m", "poetry", "env", "use", &*py_path])
            .current_dir(&*be_dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output();
    }

    // 然后运行 poetry install --no-root（不安装当前项目，只安装依赖）
    let output = create_hidden_command(&poetry_path)
        .args(["install", "--no-interaction", "--no-root"])
        .current_dir(&*be_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output();

    match output {
        Ok(out) if out.status.success() => {
            let mut deps_installed = state
                .dependencies_installed
                .lock()
                .map_err(|e| e.to_string())?;
            *deps_installed = true;
            return Ok("依赖安装成功".to_string());
        }
        _ => {}
    }

    // 如果直接运行失败，尝试通过 python -m poetry
    let output2 = create_hidden_command(&*py_path)
        .args(["-m", "poetry", "install", "--no-interaction", "--no-root"])
        .current_dir(&*be_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("安装依赖失败: {}", e))?;

    if output2.status.success() {
        let mut deps_installed = state
            .dependencies_installed
            .lock()
            .map_err(|e| e.to_string())?;
        *deps_installed = true;
        Ok("依赖安装成功".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output2.stderr);
        Err(format!("安装依赖失败: {}", stderr))
    }
}

/// 获取 Flojoy 配置
#[tauri::command]
pub fn get_flojoy_config(
    state: State<FlojoyBackendState>,
) -> Result<(String, String, u16, bool, bool), String> {
    let py_path = state.python_path.lock().map_err(|e| e.to_string())?;
    let be_dir = state.backend_dir.lock().map_err(|e| e.to_string())?;
    let port = state.port.lock().map_err(|e| e.to_string())?;
    let poetry_installed = state.poetry_installed.lock().map_err(|e| e.to_string())?;
    let deps_installed = state
        .dependencies_installed
        .lock()
        .map_err(|e| e.to_string())?;

    Ok((
        py_path.clone(),
        be_dir.clone(),
        *port,
        *poetry_installed,
        *deps_installed,
    ))
}

/// 启动 Flojoy 后端
#[tauri::command]
pub fn start_flojoy_backend(
    state: State<FlojoyBackendState>,
    app: AppHandle,
) -> Result<String, String> {
    let mut process_guard = state.process.lock().map_err(|e| e.to_string())?;

    // 检查是否已经在运行
    if let Some(ref mut child) = *process_guard {
        match child.try_wait() {
            Ok(Some(_)) => {
                *process_guard = None;
            }
            Ok(None) => {
                return Err("Flojoy 后端已在运行中".to_string());
            }
            Err(e) => {
                return Err(format!("检查进程状态失败: {}", e));
            }
        }
    }

    let py_path = state.python_path.lock().map_err(|e| e.to_string())?;
    let be_dir = state.backend_dir.lock().map_err(|e| e.to_string())?;
    let port = state.port.lock().map_err(|e| e.to_string())?;

    // 确定后端目录
    let backend_dir = if be_dir.is_empty() {
        get_flojoy_dir(&app)
    } else {
        PathBuf::from(&*be_dir)
    };

    if !backend_dir.exists() {
        return Err(format!("后端目录不存在: {:?}", backend_dir));
    }

    // 获取 poetry 路径
    let poetry_path = get_poetry_path(&py_path);

    // 工作目录应该是 flojoy 根目录（不是 captain 子目录）
    // 因为 main.py 中使用 "from captain.routes import ..." 这样的导入
    // Python 需要从 flojoy/ 目录运行才能正确解析 captain 模块
    let working_dir = backend_dir.clone();

    // 规范化路径，去掉 Windows 扩展路径前缀 \\?\
    let working_dir_str = working_dir.to_string_lossy().to_string();
    let working_dir_clean = if working_dir_str.starts_with(r"\\?\") {
        PathBuf::from(&working_dir_str[4..])
    } else {
        working_dir.clone()
    };

    println!("[Flojoy] 后端目录: {:?}", backend_dir);
    println!("[Flojoy] 工作目录: {:?}", working_dir_clean);
    println!("[Flojoy] Poetry 路径: {}", poetry_path);

    let dependencies_installed =
        ensure_flojoy_dependencies(&poetry_path, &py_path, &working_dir_clean)?;
    if dependencies_installed {
        let mut deps_guard = state
            .dependencies_installed
            .lock()
            .map_err(|e| e.to_string())?;
        *deps_guard = true;
    }

    // 检查 main.py 是否存在（入口在 flojoy/main.py，使用 uvicorn 运行 captain.main:app）
    let main_py = working_dir_clean.join("main.py");
    if !main_py.exists() {
        return Err(format!("main.py 不存在: {:?}", main_py));
    }
    println!("[Flojoy] main.py 存在: {:?}", main_py);

    // 获取 Python 所在目录，用于设置 PATH 环境变量
    let python_dir = std::path::Path::new(&*py_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    // 构建新的 PATH，将 Python 目录放在最前面
    let current_path = std::env::var("PATH").unwrap_or_default();
    let new_path = if python_dir.is_empty() {
        current_path
    } else {
        format!("{};{}", python_dir, current_path)
    };

    println!("[Flojoy] Python 目录: {}", python_dir);

    // 首先尝试直接使用 poetry
    // 使用 Stdio::inherit() 以便在控制台看到错误输出
    // 设置 PATH 环境变量确保 Poetry 使用正确的 Python
    // 从 flojoy 根目录运行 main.py（入口文件，使用 uvicorn 运行 captain.main:app）
    let child_result = create_hidden_command(&poetry_path)
        .args(["run", "python", "main.py", "--port", &port.to_string()])
        .current_dir(&working_dir_clean)
        .env("PATH", &new_path)
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .spawn();

    let mut child = match child_result {
        Ok(c) => c,
        Err(e1) => {
            println!(
                "[Flojoy] poetry 直接启动失败: {}, 尝试 python -m poetry",
                e1
            );
            // 如果 poetry 命令失败，尝试通过 python -m poetry
            create_hidden_command(&*py_path)
                .args([
                    "-m",
                    "poetry",
                    "run",
                    "python",
                    "main.py",
                    "--port",
                    &port.to_string(),
                ])
                .current_dir(&working_dir_clean)
                .env("PATH", &new_path)
                .stdout(Stdio::inherit())
                .stderr(Stdio::inherit())
                .spawn()
                .map_err(|e2| format!("启动后端失败: poetry: {}, python -m: {}", e1, e2))?
        }
    };

    let pid = child.id();
    println!("[Flojoy] 进程已 spawn，PID: {}", pid);

    // 等待更长时间检查进程是否立即退出（Python 启动可能需要时间）
    std::thread::sleep(std::time::Duration::from_millis(2000));

    match child.try_wait() {
        Ok(Some(status)) => {
            // 进程已退出，说明启动失败
            return Err(format!(
                "Flojoy 后端启动后退出，退出码: {:?}，工作目录: {:?}",
                status.code(),
                working_dir_clean
            ));
        }
        Ok(None) => {
            // 进程仍在运行，正常
            println!("[Flojoy] 后端进程正在运行，PID: {}", pid);
        }
        Err(e) => {
            return Err(format!("检查进程状态失败: {}", e));
        }
    }

    *process_guard = Some(child);

    // 更新后端目录
    drop(be_dir);
    let mut be_dir = state.backend_dir.lock().map_err(|e| e.to_string())?;
    *be_dir = backend_dir.to_string_lossy().to_string();

    Ok(format!("Flojoy 后端已启动，PID: {}, Port: {}", pid, *port))
}

/// 停止 Flojoy 后端
#[tauri::command]
pub fn stop_flojoy_backend(state: State<FlojoyBackendState>) -> Result<String, String> {
    let mut process_guard = state.process.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut child) = *process_guard {
        #[cfg(target_os = "windows")]
        {
            let pid = child.id();
            let _ = create_hidden_command("taskkill")
                .args(["/PID", &pid.to_string(), "/F", "/T"])
                .output();
        }

        #[cfg(not(target_os = "windows"))]
        {
            let _ = child.kill();
        }

        let _ = child.wait();
        *process_guard = None;

        Ok("Flojoy 后端已停止".to_string())
    } else {
        Ok("Flojoy 后端未在运行".to_string())
    }
}

/// 检查 Flojoy 后端是否在运行
#[tauri::command]
pub fn is_flojoy_backend_running(state: State<FlojoyBackendState>) -> Result<bool, String> {
    let mut process_guard = state.process.lock().map_err(|e| e.to_string())?;

    if let Some(ref mut child) = *process_guard {
        match child.try_wait() {
            Ok(Some(_)) => {
                *process_guard = None;
                Ok(false)
            }
            Ok(None) => Ok(true),
            Err(e) => Err(format!("检查进程状态失败: {}", e)),
        }
    } else {
        Ok(false)
    }
}

/// 获取 Flojoy 后端进程 ID
#[tauri::command]
pub fn get_flojoy_backend_pid(state: State<FlojoyBackendState>) -> Result<Option<u32>, String> {
    let process_guard = state.process.lock().map_err(|e| e.to_string())?;
    Ok(process_guard.as_ref().map(|child| child.id()))
}

/// 设置后端端口
#[tauri::command]
pub fn set_flojoy_backend_port(
    state: State<FlojoyBackendState>,
    new_port: u16,
) -> Result<(), String> {
    let mut port = state.port.lock().map_err(|e| e.to_string())?;
    *port = new_port;
    Ok(())
}

/// 初始化 Flojoy 后端目录
#[tauri::command]
pub fn init_flojoy_backend_dir(
    state: State<FlojoyBackendState>,
    app: AppHandle,
) -> Result<String, String> {
    let backend_dir = get_flojoy_dir(&app);

    // 验证目录存在
    if !backend_dir.exists() {
        return Err(format!(
            "Flojoy 后端目录不存在: {:?}。请确保 src-tauri/resources/flojoy 目录存在。",
            backend_dir
        ));
    }

    // 验证 pyproject.toml 存在
    if !backend_dir.join("pyproject.toml").exists() {
        return Err(format!(
            "pyproject.toml 不存在于 {:?}。请确保 Flojoy 后端文件完整。",
            backend_dir
        ));
    }

    let mut be_dir = state.backend_dir.lock().map_err(|e| e.to_string())?;
    *be_dir = backend_dir.to_string_lossy().to_string();

    println!("[Flojoy] 后端目录已初始化: {}", *be_dir);

    Ok(be_dir.clone())
}
