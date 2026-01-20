// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod camera;
mod scanner;
mod cache;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
