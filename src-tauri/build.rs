fn main() {
    // 标准 Tauri 构建
    tauri_build::build();

    // 检查 Flojoy 资源是否存在（仅在发布构建时警告）
    #[cfg(not(debug_assertions))]
    check_flojoy_resources();
}

#[cfg(not(debug_assertions))]
fn check_flojoy_resources() {
    use std::path::Path;

    let resources_dir = Path::new("resources/flojoy");

    // 检查 UI 资源
    let ui_dir = resources_dir.join("ui");
    if !ui_dir.exists() || is_empty_dir(&ui_dir) {
        println!(
            "cargo:warning=Flojoy UI 资源未找到或为空: {}",
            ui_dir.display()
        );
        println!("cargo:warning=请先运行 scripts/build-flojoy 脚本构建 Flojoy");
    }

    // 检查后端资源
    let backend_dir = resources_dir.join("backend");
    if !backend_dir.exists() || is_empty_dir(&backend_dir) {
        println!(
            "cargo:warning=Flojoy Backend 资源未找到或为空: {}",
            backend_dir.display()
        );
        println!("cargo:warning=请先运行 scripts/build-flojoy 脚本构建 Flojoy");
    }

    // 检查 Python 运行时
    check_python_runtime();
}

#[cfg(not(debug_assertions))]
fn check_python_runtime() {
    use std::path::Path;

    let binaries_dir = Path::new("binaries");

    // 获取当前目标平台
    let target = std::env::var("TARGET").unwrap_or_default();

    let python_dir = binaries_dir.join(format!("python-{}", target));
    if !python_dir.exists() {
        println!(
            "cargo:warning=Python 运行时未找到: {}",
            python_dir.display()
        );
        println!("cargo:warning=请先运行 scripts/setup-runtime 脚本下载 Python 运行时");
    }
}

#[cfg(not(debug_assertions))]
fn is_empty_dir(dir: &std::path::Path) -> bool {
    if !dir.is_dir() {
        return true;
    }

    match std::fs::read_dir(dir) {
        Ok(mut entries) => {
            // 检查是否只有 .gitkeep 文件
            entries.all(|entry| {
                entry
                    .map(|e| e.file_name() == ".gitkeep")
                    .unwrap_or(false)
            })
        }
        Err(_) => true,
    }
}
