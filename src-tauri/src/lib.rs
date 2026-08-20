// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod cache;
mod camera;
mod flojoy;
mod halt_hass_mqtt;
mod high_temp_pressure_ocr;
mod ocr;
mod scanner;
mod vibration_ocr;
mod simulated_well_upload;

use tauri::{Manager, RunEvent};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// 打开开发者工具
#[tauri::command]
fn open_devtools(webview: tauri::Webview) {
    webview.open_devtools();
}

/// 停止 Flojoy 后端（内部使用）
fn cleanup_flojoy_backend(state: &flojoy::FlojoyBackendState) {
    if let Ok(mut process_guard) = state.process.lock() {
        if let Some(ref mut child) = *process_guard {
            println!("[Flojoy] 应用退出，正在停止后端进程...");

            #[cfg(target_os = "windows")]
            {
                use std::process::Command;
                let pid = child.id();
                // 使用 taskkill 强制终止进程树
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/F", "/T"])
                    .output();
            }

            #[cfg(not(target_os = "windows"))]
            {
                let _ = child.kill();
            }

            let _ = child.wait();
            *process_guard = None;
            println!("[Flojoy] 后端进程已停止");
        }
    }
}

fn cleanup_high_temp_pressure_ocr(state: &high_temp_pressure_ocr::HighTempPressureOcrState) {
    if let Ok(mut process_guard) = state.process.lock() {
        if let Some(ref mut child) = *process_guard {
            #[cfg(target_os = "windows")]
            {
                use std::process::Command;
                let _ = Command::new("taskkill")
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

fn cleanup_vibration_ocr(state: &vibration_ocr::VibrationOcrState) {
    if let Ok(mut process_guard) = state.process.lock() {
        if let Some(ref mut child) = *process_guard {
            #[cfg(target_os = "windows")]
            {
                use std::process::Command;
                let _ = Command::new("taskkill")
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        // 注册 Flojoy 后端状态管理
        .manage(flojoy::FlojoyBackendState::default())
        // 注册 OCR 状态管理
        .manage(ocr::OcrState::default())
        // 注册高温高压井 OCR 识别状态管理
        .manage(high_temp_pressure_ocr::HighTempPressureOcrState::default())
        // 注册振动台采集卡实时 OCR 状态管理
        .manage(vibration_ocr::VibrationOcrState::default())
        // 注册 HALT-HASS 工作台 MQTT 状态管理
        .manage(halt_hass_mqtt::HaltHassMqttState::default())
        .manage(simulated_well_upload::SimulatedWellUploadState::default())
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
            // HALT-HASS 工作台 MQTT
            halt_hass_mqtt::start_halt_hass_mqtt,
            halt_hass_mqtt::stop_halt_hass_mqtt,
            halt_hass_mqtt::publish_halt_hass_mqtt_command,
            // OCR 图像识别
            ocr::init_ocr,
            ocr::is_ocr_initialized,
            ocr::set_ocr_regions,
            ocr::get_ocr_regions,
            ocr::add_ocr_region,
            ocr::remove_ocr_region,
            ocr::clear_ocr_regions,
            ocr::ocr_recognize,
            ocr::ocr_recognize_regions,
            ocr::start_ocr_stream,
            ocr::stop_ocr_stream,
            ocr::is_ocr_streaming,
            ocr::release_ocr,
            vibration_ocr::get_vibration_ocr_devices,
            vibration_ocr::start_vibration_ocr_stream,
            vibration_ocr::pause_vibration_ocr_stream,
            vibration_ocr::resume_vibration_ocr_stream,
            vibration_ocr::stop_vibration_ocr_stream,
            vibration_ocr::get_vibration_capture_status,
            vibration_ocr::get_vibration_capture_result,
            vibration_ocr::export_vibration_capture_output,
            high_temp_pressure_ocr::get_high_temp_pressure_ocr_devices,
            high_temp_pressure_ocr::start_high_temp_pressure_ocr_stream,
            high_temp_pressure_ocr::pause_high_temp_pressure_ocr_stream,
            high_temp_pressure_ocr::resume_high_temp_pressure_ocr_stream,
            high_temp_pressure_ocr::stop_high_temp_pressure_ocr_stream,
            high_temp_pressure_ocr::get_high_temp_pressure_capture_status,
            high_temp_pressure_ocr::get_high_temp_pressure_capture_records,
            high_temp_pressure_ocr::get_high_temp_pressure_capture_result,
            high_temp_pressure_ocr::export_high_temp_pressure_capture_output,
            high_temp_pressure_ocr::read_high_temp_pressure_business_report,
            high_temp_pressure_ocr::read_high_temp_pressure_curve_records,
            high_temp_pressure_ocr::write_high_temp_pressure_curve_chart,
            simulated_well_upload::get_simulated_well_upload_files,
            simulated_well_upload::upload_simulated_well_file_chunk,
            simulated_well_upload::cancel_simulated_well_upload,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // 运行应用并处理退出事件
    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            // 应用退出时，停止 Flojoy 后端
            if let Some(state) = app_handle.try_state::<flojoy::FlojoyBackendState>() {
                cleanup_flojoy_backend(state.inner());
            }
            if let Some(state) =
                app_handle.try_state::<high_temp_pressure_ocr::HighTempPressureOcrState>()
            {
                cleanup_high_temp_pressure_ocr(state.inner());
            }
            if let Some(state) = app_handle.try_state::<vibration_ocr::VibrationOcrState>() {
                cleanup_vibration_ocr(state.inner());
            }
            if let Some(state) = app_handle.try_state::<halt_hass_mqtt::HaltHassMqttState>() {
                state.shutdown_now();
            }
        }
    });
}
