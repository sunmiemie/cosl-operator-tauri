/**
 * OCR 图像识别模块
 *
 * 使用 PaddleOCR ONNX 模型实现中英文文本识别
 * 支持 ROI 区域识别，适用于采集卡场景
 */
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use image::{DynamicImage, GenericImageView};
use ndarray::{Array3, Array4, ArrayView3, Axis};
use ort::session::{builder::GraphOptimizationLevel, Session, SessionOutputs};
use ort::value::Tensor;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use tauri::{AppHandle, Manager, Runtime};

// ==================== 数据结构定义 ====================

/// ROI 区域配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrRegion {
    /// 区域唯一标识
    pub id: String,
    /// 左上角 X 坐标
    pub x: u32,
    /// 左上角 Y 坐标
    pub y: u32,
    /// 宽度
    pub width: u32,
    /// 高度
    pub height: u32,
    /// 区域标签（用于标识用途）
    pub label: Option<String>,
}

/// 文本框（检测结果）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextBox {
    /// 识别的文本
    pub text: String,
    /// 置信度 0-1
    pub confidence: f32,
    /// 四个角点坐标 [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    pub points: [[f32; 2]; 4],
}

/// 单个 ROI 区域识别结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OcrRegionResult {
    /// 区域 ID
    pub id: String,
    /// 合并后的识别文本
    pub text: String,
    /// 平均置信度 0-1
    pub confidence: f32,
    /// 该区域内检测到的所有文本框
    pub boxes: Vec<TextBox>,
}

/// OCR 识别结果（整帧）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OcrFrameResult {
    /// 帧时间戳（毫秒）
    pub timestamp: u64,
    /// 各区域识别结果
    pub regions: Vec<OcrRegionResult>,
    /// 处理耗时（毫秒）
    pub process_time_ms: u32,
}

/// OCR 字符字典
pub struct OcrDictionary {
    chars: Vec<char>,
    #[allow(dead_code)]
    char_to_idx: HashMap<char, usize>,
}

impl OcrDictionary {
    /// 创建空字典（后续从文件加载）
    fn new() -> Self {
        Self {
            chars: Vec::new(),
            char_to_idx: HashMap::new(),
        }
    }

    /// 从文件加载字典
    fn load_from_file(path: &std::path::Path) -> Result<Self, String> {
        let content =
            std::fs::read_to_string(path).map_err(|e| format!("读取字典文件失败: {}", e))?;

        // 每行一个字符
        let chars: Vec<char> = content
            .lines()
            .filter_map(|line| line.chars().next())
            .collect();

        if chars.is_empty() {
            return Err("字典文件为空".to_string());
        }

        let char_to_idx: HashMap<char, usize> =
            chars.iter().enumerate().map(|(i, &c)| (c, i)).collect();

        println!("[OCR] 已加载字典，共 {} 个字符", chars.len());

        Ok(Self { chars, char_to_idx })
    }

    fn decode(&self, indices: &[usize]) -> String {
        indices
            .iter()
            .filter_map(|&idx| self.chars.get(idx).copied())
            .collect()
    }

    fn is_loaded(&self) -> bool {
        !self.chars.is_empty()
    }
}

/// OCR 状态（全局单例）
pub struct OcrState {
    /// 检测模型会话
    pub det_session: Mutex<Option<Session>>,
    /// 识别模型会话
    pub rec_session: Mutex<Option<Session>>,
    /// 是否正在运行连续识别
    pub is_streaming: AtomicBool,
    /// 当前配置的 ROI 区域
    pub regions: Mutex<Vec<OcrRegion>>,
    /// 字符字典
    pub dictionary: Mutex<OcrDictionary>,
    /// 模型目录路径
    pub models_dir: Mutex<Option<PathBuf>>,
}

impl Default for OcrState {
    fn default() -> Self {
        Self {
            det_session: Mutex::new(None),
            rec_session: Mutex::new(None),
            is_streaming: AtomicBool::new(false),
            regions: Mutex::new(Vec::new()),
            dictionary: Mutex::new(OcrDictionary::new()),
            models_dir: Mutex::new(None),
        }
    }
}

// ==================== 图像预处理 ====================

/// 将图像调整到检测模型输入尺寸
fn preprocess_for_detection(img: &DynamicImage) -> Array4<f32> {
    // PaddleOCR 检测模型期望的输入尺寸（通常是 640x640 或动态尺寸）
    let target_size = 640;

    // 保持宽高比缩放
    let (w, h) = img.dimensions();
    let scale = target_size as f32 / w.max(h) as f32;
    let new_w = (w as f32 * scale) as u32;
    let new_h = (h as f32 * scale) as u32;

    let resized = img.resize_exact(new_w, new_h, image::imageops::FilterType::Lanczos3);
    let rgb = resized.to_rgb8();

    // 创建填充后的图像（居中填充）
    let mut padded: Array3<f32> = Array3::zeros((3, target_size as usize, target_size as usize));
    let offset_x = (target_size - new_w) / 2;
    let offset_y = (target_size - new_h) / 2;

    // 归一化并填充
    for y in 0..new_h as usize {
        for x in 0..new_w as usize {
            let pixel = rgb.get_pixel(x as u32, y as u32);
            // 归一化到 [-1, 1] 范围（PaddleOCR 标准化）
            padded[[0, offset_y as usize + y, offset_x as usize + x]] =
                (pixel[0] as f32 / 255.0 - 0.485) / 0.229;
            padded[[1, offset_y as usize + y, offset_x as usize + x]] =
                (pixel[1] as f32 / 255.0 - 0.456) / 0.224;
            padded[[2, offset_y as usize + y, offset_x as usize + x]] =
                (pixel[2] as f32 / 255.0 - 0.406) / 0.225;
        }
    }

    // 添加 batch 维度
    padded.insert_axis(Axis(0))
}

/// 将文本框区域预处理为识别模型输入
fn preprocess_for_recognition(img: &DynamicImage) -> Array4<f32> {
    // PaddleOCR 识别模型期望的输入尺寸 (高度固定为 48，宽度动态)
    let target_h = 48;
    let (w, h) = img.dimensions();

    // 计算等比例缩放后的宽度
    let ratio = target_h as f32 / h as f32;
    let target_w = ((w as f32 * ratio) as u32).max(48).min(320);

    let resized = img.resize_exact(target_w, target_h, image::imageops::FilterType::Lanczos3);
    let gray = resized.to_luma8();

    // 创建输入张量 (1, 1, H, W) - 灰度图
    let mut tensor: Array4<f32> = Array4::zeros((1, 1, target_h as usize, target_w as usize));

    for y in 0..target_h as usize {
        for x in 0..target_w as usize {
            let pixel = gray.get_pixel(x as u32, y as u32);
            // 归一化到 [-1, 1]
            tensor[[0, 0, y, x]] = (pixel[0] as f32 / 255.0 - 0.5) / 0.5;
        }
    }

    tensor
}

/// 从检测模型输出中提取文本框
fn extract_text_boxes(
    output: &ArrayView3<f32>,
    original_size: (u32, u32),
    det_size: u32,
    threshold: f32,
) -> Vec<[[f32; 2]; 4]> {
    let mut boxes = Vec::new();

    // 检测模型输出是一个概率图，需要通过阈值化和轮廓提取获取文本框
    // 这里使用简化的连通域分析

    let (orig_w, orig_h) = original_size;
    let scale_x = orig_w as f32 / det_size as f32;
    let scale_y = orig_h as f32 / det_size as f32;

    // 二值化
    let h = output.shape()[1];
    let w = output.shape()[2];

    let mut binary: Vec<Vec<bool>> = vec![vec![false; w]; h];
    for y in 0..h {
        for x in 0..w {
            binary[y][x] = output[[0, y, x]] > threshold;
        }
    }

    // 简化的文本行检测：找到水平方向的连续区域
    let mut visited: Vec<Vec<bool>> = vec![vec![false; w]; h];

    for y in 0..h {
        let mut x = 0;
        while x < w {
            if binary[y][x] && !visited[y][x] {
                // 找到一个文本像素，扩展为矩形框
                let mut min_x = x;
                let mut max_x = x;
                let mut min_y = y;
                let mut max_y = y;

                // 简单的区域生长
                let mut stack = vec![(y, x)];
                while let Some((cy, cx)) = stack.pop() {
                    if cy >= h || cx >= w || visited[cy][cx] || !binary[cy][cx] {
                        continue;
                    }
                    visited[cy][cx] = true;
                    min_x = min_x.min(cx);
                    max_x = max_x.max(cx);
                    min_y = min_y.min(cy);
                    max_y = max_y.max(cy);

                    // 8邻域扩展
                    if cy > 0 {
                        stack.push((cy - 1, cx));
                    }
                    if cy < h - 1 {
                        stack.push((cy + 1, cx));
                    }
                    if cx > 0 {
                        stack.push((cy, cx - 1));
                    }
                    if cx < w - 1 {
                        stack.push((cy, cx + 1));
                    }
                }

                // 过滤太小的区域
                let box_w = max_x - min_x;
                let box_h = max_y - min_y;
                if box_w > 5 && box_h > 3 {
                    // 转换回原始图像坐标
                    let x1 = min_x as f32 * scale_x;
                    let y1 = min_y as f32 * scale_y;
                    let x2 = (max_x + 1) as f32 * scale_x;
                    let y2 = (max_y + 1) as f32 * scale_y;

                    boxes.push([
                        [x1, y1], // 左上
                        [x2, y1], // 右上
                        [x2, y2], // 右下
                        [x1, y2], // 左下
                    ]);
                }
            }
            x += 1;
        }
    }

    boxes
}

/// 根据文本框裁剪图像
fn crop_text_region(img: &DynamicImage, points: &[[f32; 2]; 4]) -> DynamicImage {
    let x1 = points[0][0].min(points[3][0]).max(0.0) as u32;
    let y1 = points[0][1].min(points[1][1]).max(0.0) as u32;
    let x2 = points[1][0].max(points[2][0]) as u32;
    let y2 = points[2][1].max(points[3][1]) as u32;

    let (img_w, img_h) = img.dimensions();
    let x2 = x2.min(img_w);
    let y2 = y2.min(img_h);

    if x2 <= x1 || y2 <= y1 {
        return img.clone();
    }

    img.crop_imm(x1, y1, x2 - x1, y2 - y1)
}

/// CTC 解码：从模型输出获取文本
fn ctc_decode(output: &ArrayView3<f32>, dictionary: &OcrDictionary) -> (String, f32) {
    let seq_len = output.shape()[1];
    let vocab_size = output.shape()[2];

    let mut indices: Vec<usize> = Vec::new();
    let mut confidences: Vec<f32> = Vec::new();
    let mut prev_idx: Option<usize> = None;

    for t in 0..seq_len {
        // 找到概率最大的字符
        let mut max_prob: f32 = f32::NEG_INFINITY;
        let mut max_idx: usize = 0;

        for v in 0..vocab_size {
            let prob = output[[0, t, v]];
            if prob > max_prob {
                max_prob = prob;
                max_idx = v;
            }
        }

        // 跳过空白符（通常是索引 0）和重复字符
        if max_idx != 0 && Some(max_idx) != prev_idx {
            indices.push(max_idx - 1); // 减 1 因为 0 是空白符
            confidences.push(max_prob.exp()); // 假设输出是 log softmax
        }
        prev_idx = Some(max_idx);
    }

    let text = dictionary.decode(&indices);
    let avg_conf = if confidences.is_empty() {
        0.0
    } else {
        confidences.iter().sum::<f32>() / confidences.len() as f32
    };

    (text, avg_conf.min(1.0).max(0.0))
}

// ==================== Tauri 命令 ====================

/// 初始化 OCR 模型
#[tauri::command]
pub async fn init_ocr<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    let state = app.state::<OcrState>();

    // 获取模型目录
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?;

    let models_dir = resource_path.join("resources").join("models");

    println!("[OCR] 模型目录: {:?}", models_dir);

    // 检查模型文件是否存在
    let det_model_path = models_dir.join("det.onnx");
    let rec_model_path = models_dir.join("rec.onnx");
    let dict_path = models_dir.join("dict.txt");

    if !det_model_path.exists() {
        return Err(format!("检测模型不存在: {:?}", det_model_path));
    }

    if !rec_model_path.exists() {
        return Err(format!("识别模型不存在: {:?}", rec_model_path));
    }

    if !dict_path.exists() {
        return Err(format!("字典文件不存在: {:?}", dict_path));
    }

    // 加载字典
    println!("[OCR] 正在加载字典...");
    let dictionary = OcrDictionary::load_from_file(&dict_path)?;

    // 初始化 ONNX Runtime
    println!("[OCR] 正在加载检测模型...");
    let det_session = Session::builder()
        .map_err(|e| format!("创建 Session builder 失败: {}", e))?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|e| format!("设置优化级别失败: {}", e))?
        .with_intra_threads(4)
        .map_err(|e| format!("设置线程数失败: {}", e))?
        .commit_from_file(&det_model_path)
        .map_err(|e| format!("加载检测模型失败: {}", e))?;

    println!("[OCR] 正在加载识别模型...");
    let rec_session = Session::builder()
        .map_err(|e| format!("创建 Session builder 失败: {}", e))?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|e| format!("设置优化级别失败: {}", e))?
        .with_intra_threads(4)
        .map_err(|e| format!("设置线程数失败: {}", e))?
        .commit_from_file(&rec_model_path)
        .map_err(|e| format!("加载识别模型失败: {}", e))?;

    // 保存到状态
    {
        let mut det = state.det_session.lock();
        *det = Some(det_session);
    }
    {
        let mut rec = state.rec_session.lock();
        *rec = Some(rec_session);
    }
    {
        let mut dict = state.dictionary.lock();
        *dict = dictionary;
    }
    {
        let mut dir = state.models_dir.lock();
        *dir = Some(models_dir);
    }

    println!("[OCR] 模型加载完成");
    Ok(true)
}

/// 检查 OCR 是否已初始化
#[tauri::command]
pub fn is_ocr_initialized<R: Runtime>(app: AppHandle<R>) -> bool {
    let state = app.state::<OcrState>();
    let det = state.det_session.lock();
    let rec = state.rec_session.lock();
    let dict = state.dictionary.lock();
    det.is_some() && rec.is_some() && dict.is_loaded()
}

/// 配置 ROI 区域
#[tauri::command]
pub fn set_ocr_regions<R: Runtime>(
    app: AppHandle<R>,
    regions: Vec<OcrRegion>,
) -> Result<(), String> {
    let state = app.state::<OcrState>();
    let mut current = state.regions.lock();
    *current = regions;
    println!("[OCR] ROI 区域已配置: {} 个", current.len());
    Ok(())
}

/// 获取当前 ROI 配置
#[tauri::command]
pub fn get_ocr_regions<R: Runtime>(app: AppHandle<R>) -> Vec<OcrRegion> {
    let state = app.state::<OcrState>();
    let regions = state.regions.lock();
    regions.clone()
}

/// 添加单个 ROI 区域
#[tauri::command]
pub fn add_ocr_region<R: Runtime>(app: AppHandle<R>, region: OcrRegion) -> Result<(), String> {
    let state = app.state::<OcrState>();
    let mut regions = state.regions.lock();

    // 检查 ID 是否重复
    if regions.iter().any(|r| r.id == region.id) {
        return Err(format!("区域 ID '{}' 已存在", region.id));
    }

    regions.push(region);
    Ok(())
}

/// 移除 ROI 区域
#[tauri::command]
pub fn remove_ocr_region<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let state = app.state::<OcrState>();
    let mut regions = state.regions.lock();
    let original_len = regions.len();
    regions.retain(|r| r.id != id);

    if regions.len() == original_len {
        return Err(format!("未找到区域 ID '{}'", id));
    }

    Ok(())
}

/// 清空所有 ROI 区域
#[tauri::command]
pub fn clear_ocr_regions<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let state = app.state::<OcrState>();
    let mut regions = state.regions.lock();
    regions.clear();
    Ok(())
}

/// 单帧识别（传入 base64 图片）
#[tauri::command]
pub async fn ocr_recognize<R: Runtime>(
    app: AppHandle<R>,
    image_data: String,
) -> Result<OcrFrameResult, String> {
    let start = Instant::now();
    let state = app.state::<OcrState>();

    // 检查模型是否已加载
    {
        let det = state.det_session.lock();
        let rec = state.rec_session.lock();
        if det.is_none() || rec.is_none() {
            return Err("OCR 模型未初始化，请先调用 init_ocr".to_string());
        }
    }

    // 解码 base64 图片
    let image_bytes = decode_base64_image(&image_data)?;
    let img = image::load_from_memory(&image_bytes).map_err(|e| format!("解析图片失败: {}", e))?;

    // 获取配置的 ROI 区域
    let regions = state.regions.lock().clone();

    // 如果没有配置 ROI，识别整张图
    let regions_to_process = if regions.is_empty() {
        let (w, h) = img.dimensions();
        vec![OcrRegion {
            id: "full".to_string(),
            x: 0,
            y: 0,
            width: w,
            height: h,
            label: Some("全图".to_string()),
        }]
    } else {
        regions
    };

    // 处理每个区域
    let mut results = Vec::new();
    for region in regions_to_process {
        let result = recognize_region(&state, &img, &region)?;
        results.push(result);
    }

    let process_time = start.elapsed().as_millis() as u32;

    Ok(OcrFrameResult {
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        regions: results,
        process_time_ms: process_time,
    })
}

/// 识别指定 ROI 区域
#[tauri::command]
pub async fn ocr_recognize_regions<R: Runtime>(
    app: AppHandle<R>,
    image_data: String,
    regions: Vec<OcrRegion>,
) -> Result<OcrFrameResult, String> {
    let start = Instant::now();
    let state = app.state::<OcrState>();

    // 检查模型是否已加载
    {
        let det = state.det_session.lock();
        let rec = state.rec_session.lock();
        if det.is_none() || rec.is_none() {
            return Err("OCR 模型未初始化，请先调用 init_ocr".to_string());
        }
    }

    // 解码 base64 图片
    let image_bytes = decode_base64_image(&image_data)?;
    let img = image::load_from_memory(&image_bytes).map_err(|e| format!("解析图片失败: {}", e))?;

    // 处理每个区域
    let mut results = Vec::new();
    for region in regions {
        let result = recognize_region(&state, &img, &region)?;
        results.push(result);
    }

    let process_time = start.elapsed().as_millis() as u32;

    Ok(OcrFrameResult {
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        regions: results,
        process_time_ms: process_time,
    })
}

/// 启动连续识别流
#[tauri::command]
pub fn start_ocr_stream<R: Runtime>(
    app: AppHandle<R>,
    interval_ms: Option<u32>,
) -> Result<(), String> {
    let state = app.state::<OcrState>();

    // 检查是否已在运行
    if state.is_streaming.load(Ordering::SeqCst) {
        return Err("OCR 流已在运行中".to_string());
    }

    // 检查模型是否已加载
    {
        let det = state.det_session.lock();
        let rec = state.rec_session.lock();
        if det.is_none() || rec.is_none() {
            return Err("OCR 模型未初始化，请先调用 init_ocr".to_string());
        }
    }

    state.is_streaming.store(true, Ordering::SeqCst);
    let interval = interval_ms.unwrap_or(33); // 默认 30fps

    println!("[OCR] 启动连续识别流，间隔: {}ms", interval);

    // 注意：实际的连续识别需要配合摄像头帧事件
    // 这里只是设置标志位，具体的帧处理在 camera-frame 事件监听器中完成

    Ok(())
}

/// 停止连续识别流
#[tauri::command]
pub fn stop_ocr_stream<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let state = app.state::<OcrState>();
    state.is_streaming.store(false, Ordering::SeqCst);
    println!("[OCR] 停止连续识别流");
    Ok(())
}

/// 检查是否正在进行连续识别
#[tauri::command]
pub fn is_ocr_streaming<R: Runtime>(app: AppHandle<R>) -> bool {
    let state = app.state::<OcrState>();
    state.is_streaming.load(Ordering::SeqCst)
}

/// 释放 OCR 资源
#[tauri::command]
pub fn release_ocr<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let state = app.state::<OcrState>();

    // 停止流
    state.is_streaming.store(false, Ordering::SeqCst);

    // 释放模型
    {
        let mut det = state.det_session.lock();
        *det = None;
    }
    {
        let mut rec = state.rec_session.lock();
        *rec = None;
    }
    {
        let mut regions = state.regions.lock();
        regions.clear();
    }

    println!("[OCR] 资源已释放");
    Ok(())
}

// ==================== 辅助函数 ====================

/// 解码 base64 图片数据
fn decode_base64_image(data: &str) -> Result<Vec<u8>, String> {
    // 移除可能的 data URL 前缀
    let base64_data = if data.contains(',') {
        data.split(',').nth(1).unwrap_or(data)
    } else {
        data
    };

    BASE64
        .decode(base64_data)
        .map_err(|e| format!("Base64 解码失败: {}", e))
}

/// 识别单个区域
fn recognize_region(
    state: &OcrState,
    img: &DynamicImage,
    region: &OcrRegion,
) -> Result<OcrRegionResult, String> {
    // 裁剪 ROI 区域
    let (img_w, img_h) = img.dimensions();
    let x = region.x.min(img_w);
    let y = region.y.min(img_h);
    let w = region.width.min(img_w - x);
    let h = region.height.min(img_h - y);

    if w == 0 || h == 0 {
        return Ok(OcrRegionResult {
            id: region.id.clone(),
            text: String::new(),
            confidence: 0.0,
            boxes: Vec::new(),
        });
    }

    let roi_img = img.crop_imm(x, y, w, h);

    // 文本检测
    let det_input = preprocess_for_detection(&roi_img);
    let text_boxes = {
        let mut det = state.det_session.lock();
        let session = det.as_mut().ok_or("检测模型未加载")?;

        // 创建输入张量 - ort 2.0 需要使用 (shape, data) 元组
        let shape = det_input.shape();
        let data: Vec<f32> = det_input.iter().cloned().collect();
        let input_tensor = Tensor::from_array(([shape[0], shape[1], shape[2], shape[3]], data))
            .map_err(|e| format!("创建检测输入张量失败: {}", e))?;

        let outputs: SessionOutputs = session
            .run(ort::inputs!["x" => input_tensor])
            .map_err(|e| format!("检测推理失败: {}", e))?;

        // 获取输出（假设输出名为 "sigmoid_0.tmp_0" 或类似）
        let output_names: Vec<_> = outputs.iter().map(|(name, _)| name.to_string()).collect();
        let first_output_name = output_names.first().ok_or("检测模型无输出")?;

        let output_tensor = outputs
            .get(first_output_name.as_str())
            .ok_or("获取检测输出失败")?;

        let (output_shape, output_data) = output_tensor
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("提取检测输出失败: {}", e))?;

        // try_extract_tensor 返回 (&Shape, &[f32])
        let output_shape_vec: Vec<usize> = output_shape.iter().map(|&x| x as usize).collect();

        // 确保形状正确 (1, 1, H, W) -> 取 (1, H, W)
        if output_shape_vec.len() == 4 {
            let h = output_shape_vec[2];
            let w = output_shape_vec[3];
            let output_array = ndarray::ArrayView3::from_shape((1, h, w), output_data)
                .map_err(|e| format!("重塑检测输出失败: {}", e))?;
            extract_text_boxes(&output_array, (roi_img.width(), roi_img.height()), 640, 0.3)
        } else if output_shape_vec.len() == 3 {
            let c = output_shape_vec[0];
            let h = output_shape_vec[1];
            let w = output_shape_vec[2];
            let output_array = ndarray::ArrayView3::from_shape((c, h, w), output_data)
                .map_err(|e| format!("重塑检测输出失败: {}", e))?;
            extract_text_boxes(&output_array, (roi_img.width(), roi_img.height()), 640, 0.3)
        } else {
            Vec::new()
        }
    };

    // 对每个文本框进行识别
    let mut boxes: Vec<TextBox> = Vec::new();
    let mut all_texts: Vec<String> = Vec::new();
    let mut total_confidence: f32 = 0.0;

    for points in text_boxes {
        // 裁剪文本区域
        let text_img = crop_text_region(&roi_img, &points);

        if text_img.width() < 5 || text_img.height() < 5 {
            continue;
        }

        // 文本识别
        let rec_input = preprocess_for_recognition(&text_img);
        let (text, confidence) = {
            let mut rec = state.rec_session.lock();
            let session = rec.as_mut().ok_or("识别模型未加载")?;

            // 创建输入张量
            let shape = rec_input.shape();
            let data: Vec<f32> = rec_input.iter().cloned().collect();
            let input_tensor = Tensor::from_array(([shape[0], shape[1], shape[2], shape[3]], data))
                .map_err(|e| format!("创建识别输入张量失败: {}", e))?;

            let outputs: SessionOutputs = session
                .run(ort::inputs!["x" => input_tensor])
                .map_err(|e| format!("识别推理失败: {}", e))?;

            let output_names: Vec<_> = outputs.iter().map(|(name, _)| name.to_string()).collect();
            let first_output_name = output_names.first().ok_or("识别模型无输出")?;

            let output_tensor = outputs
                .get(first_output_name.as_str())
                .ok_or("获取识别输出失败")?;

            let (output_shape, output_data) = output_tensor
                .try_extract_tensor::<f32>()
                .map_err(|e| format!("提取识别输出失败: {}", e))?;

            let output_shape_vec: Vec<usize> = output_shape.iter().map(|&x| x as usize).collect();

            // 输出形状应为 (1, seq_len, vocab_size)
            if output_shape_vec.len() >= 2 {
                let seq_len = output_shape_vec[output_shape_vec.len() - 2];
                let vocab_size = output_shape_vec[output_shape_vec.len() - 1];
                let output_array =
                    ndarray::ArrayView3::from_shape((1, seq_len, vocab_size), output_data)
                        .map_err(|e| format!("重塑识别输出失败: {}", e))?;
                let dict = state.dictionary.lock();
                ctc_decode(&output_array, &dict)
            } else {
                (String::new(), 0.0)
            }
        };

        if !text.is_empty() {
            // 将坐标转换回原图坐标
            let adjusted_points = [
                [points[0][0] + x as f32, points[0][1] + y as f32],
                [points[1][0] + x as f32, points[1][1] + y as f32],
                [points[2][0] + x as f32, points[2][1] + y as f32],
                [points[3][0] + x as f32, points[3][1] + y as f32],
            ];

            boxes.push(TextBox {
                text: text.clone(),
                confidence,
                points: adjusted_points,
            });

            all_texts.push(text);
            total_confidence += confidence;
        }
    }

    let avg_confidence = if boxes.is_empty() {
        0.0
    } else {
        total_confidence / boxes.len() as f32
    };

    Ok(OcrRegionResult {
        id: region.id.clone(),
        text: all_texts.join(" "),
        confidence: avg_confidence,
        boxes,
    })
}
