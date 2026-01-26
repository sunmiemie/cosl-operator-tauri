// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod camera;
mod scanner;
mod cache;
mod flojoy;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// 打开开发者工具
#[tauri::command]
fn open_devtools(webview: tauri::Webview) {
    webview.open_devtools();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // 注册 Flojoy 后端状态管理
        .manage(flojoy::FlojoyBackendState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_devtools,
            // 摄像头相关
            camera::get_camera_list,
            camera::open_camera,
            camera::release_camera,
            camera::capture_frame,
            camera::start_video_stream,
            camera::stop_video_stream,
            camera::restart_all_cameras,
            camera::concat_images,
            camera::crop_image,
            // 扫码枪相关
            scanner::check_scanner,
            scanner::get_scanner_info,
            scanner::start_scanner,
            scanner::stop_scanner,
            scanner::is_scanner_running,
            // 缓存管理
            cache::cache_exists,
            cache::read_cache,
            cache::write_cache,
            cache::delete_cache,
            cache::clear_cache,
            cache::get_cache_size,
            cache::get_all_cache_sizes,
            cache::clear_all_cache,
            cache::list_cache_ids,
            // Flojoy 后端管理（Python 源码运行）
            flojoy::configure_python,
            flojoy::check_python_version,
            flojoy::check_poetry_installed,
            flojoy::install_poetry,
            flojoy::install_dependencies,
            flojoy::get_flojoy_config,
            flojoy::start_flojoy_backend,
            flojoy::stop_flojoy_backend,
            flojoy::is_flojoy_backend_running,
            flojoy::get_flojoy_backend_pid,
            flojoy::set_flojoy_backend_port,
            flojoy::init_flojoy_backend_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
