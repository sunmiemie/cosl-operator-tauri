//! 摄像头控制模块 - 跨平台支持 (Windows/Linux/macOS)
//! 使用 nokhwa 库实现摄像头访问

use base64::Engine;
use image::ImageFormat;
use nokhwa::{
    pixel_format::RgbFormat,
    utils::{CameraIndex, RequestedFormat, RequestedFormatType},
    Camera,
};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// 摄像头设备信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraInfo {
    pub index: u32,
    pub name: String,
    pub available: bool,
}

/// 全局摄像头状态
struct CameraState {
    camera: Option<Camera>,
    current_index: Option<u32>,
}

impl Default for CameraState {
    fn default() -> Self {
        Self {
            camera: None,
            current_index: None,
        }
    }
}

lazy_static::lazy_static! {
    static ref CAMERA_STATE: Arc<Mutex<CameraState>> = Arc::new(Mutex::new(CameraState::default()));
    static ref STREAM_RUNNING: AtomicBool = AtomicBool::new(false);
}

/// 获取可用摄像头列表
#[tauri::command]
pub fn get_camera_list() -> Vec<CameraInfo> {
    let mut cameras = Vec::new();

    // 尝试枚举前 10 个摄像头索引
    for i in 0..10 {
        let requested = RequestedFormat::new::<RgbFormat>(RequestedFormatType::AbsoluteHighestFrameRate);
        match Camera::new(CameraIndex::Index(i), requested) {
            Ok(cam) => {
                cameras.push(CameraInfo {
                    index: i,
                    name: format!("摄像头 {}", i),
                    available: true,
                });
                // 不需要保持打开状态，drop 会自动释放
                drop(cam);
            }
            Err(_) => {
                // 如果已经找到了一些摄像头但这个失败了，可能后面还有
                // 继续尝试直到连续失败3次
                if cameras.len() > 0 && i > cameras.last().unwrap().index + 3 {
                    break;
                }
            }
        }
    }

    cameras
}

/// 打开指定摄像头
#[tauri::command]
pub fn open_camera(index: u32) -> Result<bool, String> {
    let mut state = CAMERA_STATE.lock();

    // 如果已经打开了摄像头，先关闭
    if let Some(mut cam) = state.camera.take() {
        let _ = cam.stop_stream();
    }

    // 创建摄像头请求格式
    let requested = RequestedFormat::new::<RgbFormat>(RequestedFormatType::AbsoluteHighestFrameRate);

    // 打开摄像头
    match Camera::new(CameraIndex::Index(index), requested) {
        Ok(cam) => {
            state.camera = Some(cam);
            state.current_index = Some(index);
            Ok(true)
        }
        Err(e) => Err(format!("打开摄像头失败: {}", e)),
    }
}

/// 释放摄像头
#[tauri::command]
pub fn release_camera() -> Result<(), String> {
    // 停止视频流
    STREAM_RUNNING.store(false, Ordering::SeqCst);

    let mut state = CAMERA_STATE.lock();
    if let Some(mut cam) = state.camera.take() {
        let _ = cam.stop_stream();
    }
    state.current_index = None;

    Ok(())
}

/// 将图像缓冲区转换为 base64 JPEG
fn buffer_to_base64_jpeg(buffer: &nokhwa::Buffer) -> Result<String, String> {
    // 解码为 RGB 图像
    let image = buffer
        .decode_image::<RgbFormat>()
        .map_err(|e| format!("解码图像失败: {}", e))?;

    // 编码为 JPEG
    let mut jpeg_data = Cursor::new(Vec::new());
    image
        .write_to(&mut jpeg_data, ImageFormat::Jpeg)
        .map_err(|e| format!("编码 JPEG 失败: {}", e))?;

    // 转换为 base64
    let base64_str = base64::engine::general_purpose::STANDARD.encode(jpeg_data.into_inner());

    Ok(format!("data:image/jpeg;base64,{}", base64_str))
}

/// 捕获当前帧并返回 base64 编码的图片
#[tauri::command]
pub fn capture_frame() -> Result<String, String> {
    let mut state = CAMERA_STATE.lock();

    let camera = state.camera.as_mut().ok_or("摄像头未打开")?;

    // 打开摄像头流（如果尚未打开）
    if !camera.is_stream_open() {
        camera
            .open_stream()
            .map_err(|e| format!("打开摄像头流失败: {}", e))?;
    }

    // 捕获一帧
    let frame = camera.frame().map_err(|e| format!("捕获帧失败: {}", e))?;

    buffer_to_base64_jpeg(&frame)
}

/// 启动视频流，通过 Tauri 事件推送帧到前端
#[tauri::command]
pub fn start_video_stream(app: AppHandle, index: u32) -> Result<(), String> {
    // 如果已经在运行，先停止
    STREAM_RUNNING.store(false, Ordering::SeqCst);
    std::thread::sleep(std::time::Duration::from_millis(100));

    // 打开摄像头
    open_camera(index)?;

    // 打开流
    {
        let mut state = CAMERA_STATE.lock();
        if let Some(ref mut camera) = state.camera {
            camera
                .open_stream()
                .map_err(|e| format!("打开摄像头流失败: {}", e))?;
        }
    }

    // 设置运行标志
    STREAM_RUNNING.store(true, Ordering::SeqCst);

    // 在新线程中运行视频流
    std::thread::spawn(move || {
        while STREAM_RUNNING.load(Ordering::SeqCst) {
            let frame_data = {
                let mut state = CAMERA_STATE.lock();

                if let Some(ref mut camera) = state.camera {
                    match camera.frame() {
                        Ok(frame) => buffer_to_base64_jpeg(&frame).ok(),
                        Err(e) => {
                            eprintln!("捕获帧失败: {}", e);
                            None
                        }
                    }
                } else {
                    None
                }
            };

            // 发送帧到前端
            if let Some(data) = frame_data {
                if let Err(e) = app.emit("camera-frame", serde_json::json!({ "frame": data })) {
                    eprintln!("发送帧事件失败: {}", e);
                    break;
                }
            }

            // 控制帧率（约 30fps）
            std::thread::sleep(std::time::Duration::from_millis(33));
        }
    });

    Ok(())
}

/// 停止视频流
#[tauri::command]
pub fn stop_video_stream() -> Result<(), String> {
    STREAM_RUNNING.store(false, Ordering::SeqCst);
    Ok(())
}

/// 重启所有摄像头驱动（重新初始化）
#[tauri::command]
pub fn restart_all_cameras() -> Result<bool, String> {
    // 首先释放当前摄像头
    release_camera()?;

    // 短暂等待
    std::thread::sleep(std::time::Duration::from_millis(500));

    // 测试摄像头是否可用
    let cameras = get_camera_list();

    Ok(!cameras.is_empty())
}

/// 将多张 base64 图片横向拼接
#[tauri::command]
pub fn concat_images(images: Vec<String>) -> Result<String, String> {
    if images.is_empty() {
        return Err("没有图片可拼接".to_string());
    }

    // 解码所有图片
    let mut decoded_images: Vec<image::DynamicImage> = Vec::new();

    for (i, img_data) in images.iter().enumerate() {
        // 移除 data URL 前缀
        let base64_data = img_data
            .strip_prefix("data:image/png;base64,")
            .or_else(|| img_data.strip_prefix("data:image/jpeg;base64,"))
            .or_else(|| img_data.strip_prefix("data:image/webp;base64,"))
            .unwrap_or(img_data);

        // 解码 base64
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .map_err(|e| format!("解码图片 {} base64 失败: {}", i, e))?;

        // 加载图片
        let img = image::load_from_memory(&bytes)
            .map_err(|e| format!("加载图片 {} 失败: {}", i, e))?;

        decoded_images.push(img);
    }

    // 计算拼接后的尺寸
    let total_width: u32 = decoded_images.iter().map(|img| img.width()).sum();
    let max_height: u32 = decoded_images.iter().map(|img| img.height()).max().unwrap_or(0);

    // 创建新的画布
    let mut canvas = image::RgbaImage::new(total_width, max_height);

    // 将每张图片复制到画布上
    let mut x_offset: u32 = 0;
    for img in &decoded_images {
        let rgba_img = img.to_rgba8();
        for (x, y, pixel) in rgba_img.enumerate_pixels() {
            if x_offset + x < total_width && y < max_height {
                canvas.put_pixel(x_offset + x, y, *pixel);
            }
        }
        x_offset += img.width();
    }

    // 编码为 PNG
    let mut png_data = Cursor::new(Vec::new());
    canvas
        .write_to(&mut png_data, ImageFormat::Png)
        .map_err(|e| format!("编码 PNG 失败: {}", e))?;

    // 转换为 base64
    let base64_str = base64::engine::general_purpose::STANDARD.encode(png_data.into_inner());

    Ok(format!("data:image/png;base64,{}", base64_str))
}

/// 裁剪图片的指定区域
#[tauri::command]
pub fn crop_image(image_data: String, x: u32, y: u32, width: u32, height: u32) -> Result<String, String> {
    // 移除 data URL 前缀
    let base64_data = image_data
        .strip_prefix("data:image/png;base64,")
        .or_else(|| image_data.strip_prefix("data:image/jpeg;base64,"))
        .or_else(|| image_data.strip_prefix("data:image/webp;base64,"))
        .unwrap_or(&image_data);

    // 解码 base64
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(base64_data)
        .map_err(|e| format!("解码 base64 失败: {}", e))?;

    // 加载图片
    let img = image::load_from_memory(&bytes)
        .map_err(|e| format!("加载图片失败: {}", e))?;

    // 验证裁剪区域
    if x + width > img.width() || y + height > img.height() {
        return Err("裁剪区域超出图片范围".to_string());
    }

    // 裁剪图片
    let cropped = img.crop_imm(x, y, width, height);

    // 编码为 PNG
    let mut png_data = Cursor::new(Vec::new());
    cropped
        .write_to(&mut png_data, ImageFormat::Png)
        .map_err(|e| format!("编码 PNG 失败: {}", e))?;

    // 转换为 base64
    let base64_str = base64::engine::general_purpose::STANDARD.encode(png_data.into_inner());

    Ok(format!("data:image/png;base64,{}", base64_str))
}
