use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use ab_glyph::FontArc;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use image::codecs::jpeg::JpegEncoder;
use image::{Rgb, RgbImage};
use imageproc::drawing::{
    draw_filled_rect_mut, draw_hollow_rect_mut, draw_line_segment_mut, draw_text_mut, text_size,
};
use imageproc::rect::Rect;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

const HIGH_TEMP_PRESSURE_BUSINESS_REPORT_FILENAME: &str = "高温高压测试报告.pdf";

pub struct HighTempPressureOcrState {
    pub process: Arc<Mutex<Option<Child>>>,
}

#[derive(serde::Serialize)]
pub struct HighTempPressureOcrDevice {
    pub index: u32,
    pub name: String,
    pub available: bool,
}

impl Default for HighTempPressureOcrState {
    fn default() -> Self {
        Self {
            process: Arc::new(Mutex::new(None)),
        }
    }
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

fn ensure_exists(path: &str, label: &str) -> Result<(), String> {
    if path.trim().is_empty() {
        return Err(format!("{}不能为空", label));
    }
    if !Path::new(path).exists() {
        return Err(format!("{}不存在: {}", label, path));
    }
    Ok(())
}

fn ensure_ocr_dependencies(python_program: &str) -> Result<(), String> {
    let import_check = create_hidden_command(python_program)
        .args([
            "-c",
            "import cv2, numpy, onnxruntime, paddleocr, prometheus_client, pydantic, yaml",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("检查高温高压井 OCR 依赖失败: {}", e))?;

    if import_check.status.success() {
        return Ok(());
    }

    let detail = String::from_utf8_lossy(&import_check.stderr)
        .trim()
        .to_string();
    Err(format!(
        "当前 Python 缺少高温高压井 OCR 依赖，请使用项目内 .venv-ocr 环境，或按 OCR 服务 requirements.txt 安装依赖。Python: {}{}",
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
            "resources/high-temp-pressure/ocr-service/run_high_temp_pressure_ocr.py",
            BaseDirectory::Resource,
        )
        .map_err(|e| format!("解析高温高压井 OCR 脚本资源失败: {}", e))?;
    if bundled.exists() {
        return Ok(bundled);
    }

    let dev_fallback = std::env::current_dir()
        .map_err(|e| format!("获取当前工作目录失败: {}", e))?
        .join("src-tauri")
        .join("resources")
        .join("high-temp-pressure")
        .join("ocr-service")
        .join("run_high_temp_pressure_ocr.py");
    if dev_fallback.exists() {
        return Ok(dev_fallback);
    }

    Err(
        "未找到项目内高温高压井 OCR 脚本 resources/high-temp-pressure/ocr-service/run_high_temp_pressure_ocr.py"
            .to_string(),
    )
}

fn create_output_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let base_dir = app
        .path()
        .resolve("high-temp-pressure-captures", BaseDirectory::AppData)
        .map_err(|e| format!("解析高温高压井采集输出目录失败: {}", e))?;
    let output_dir = base_dir
        .join("high_temp_pressure_ocr")
        .join(timestamp.to_string());
    fs::create_dir_all(&output_dir).map_err(|e| format!("创建输出目录失败: {}", e))?;
    Ok(output_dir)
}

fn write_control_action(output_dir: &Path, action: &str) -> Result<(), String> {
    let control_path = output_dir.join("ocr_control.json");
    fs::write(
        &control_path,
        serde_json::to_string_pretty(&serde_json::json!({ "action": action }))
            .map_err(|e| format!("序列化 OCR 控制指令失败: {}", e))?,
    )
    .map_err(|e| format!("写入 OCR 控制指令失败: {}", e))
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
    if let Some(obj) = payload.as_object_mut() {
        obj.insert(
            key.to_string(),
            serde_json::Value::String(absolute.to_string_lossy().to_string()),
        );
    }
}

fn read_payload_files(output_dir: &Path) -> Result<serde_json::Value, String> {
    let json_path = output_dir.join("ocr_readings_0.5s.json");
    let summary_path = output_dir.join("experiment_summary.json");
    let csv_path = output_dir.join("ocr_readings.csv");

    let payload_text =
        fs::read_to_string(&json_path).map_err(|e| format!("读取采样JSON失败: {}", e))?;
    let summary_text =
        fs::read_to_string(&summary_path).map_err(|e| format!("读取实验汇总失败: {}", e))?;

    let payload: serde_json::Value =
        serde_json::from_str(&payload_text).map_err(|e| format!("解析采样JSON失败: {}", e))?;
    let summary: serde_json::Value =
        serde_json::from_str(&summary_text).map_err(|e| format!("解析实验汇总失败: {}", e))?;
    let latest_frame = output_dir.join("latest_frame.jpg");

    Ok(serde_json::json!({
        "output_dir": output_dir.to_string_lossy(),
        "json_path": json_path.to_string_lossy(),
        "summary_path": summary_path.to_string_lossy(),
        "csv_path": csv_path.to_string_lossy(),
        "latest_frame": if latest_frame.exists() { latest_frame.to_string_lossy().to_string() } else { String::new() },
        "summary": summary,
        "records": payload.get("records").cloned().unwrap_or(serde_json::Value::Array(vec![])),
    }))
}

fn read_progress_file(output_dir: &Path) -> Result<serde_json::Value, String> {
    let progress_path = output_dir.join("ocr_progress.json");
    if !progress_path.exists() {
        return Ok(serde_json::json!({
            "exists": false,
            "current": 0,
            "ready_pct": 0,
            "latest_frame": "",
            "complete": false,
        }));
    }

    let progress_text =
        fs::read_to_string(&progress_path).map_err(|e| format!("读取采集进度失败: {}", e))?;
    let mut progress: serde_json::Value =
        serde_json::from_str(&progress_text).map_err(|e| format!("解析采集进度失败: {}", e))?;
    absolutize_path_field(&mut progress, "latest_frame", output_dir);
    if let Some(obj) = progress.as_object_mut() {
        obj.insert("exists".to_string(), serde_json::Value::Bool(true));
    }
    Ok(progress)
}

fn read_journal_records(
    output_dir: &Path,
    after_index: usize,
    limit: usize,
) -> Result<serde_json::Value, String> {
    let journal_path = output_dir.join("ocr_records.ndjson");
    if !journal_path.exists() {
        return Ok(serde_json::json!({
            "records": [],
            "next_index": after_index,
            "has_more": false,
        }));
    }

    let file =
        fs::File::open(&journal_path).map_err(|e| format!("读取 OCR 增量记录失败: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut line = String::new();
    let mut record_index = 0usize;
    let mut records = Vec::new();

    loop {
        line.clear();
        let bytes = reader
            .read_line(&mut line)
            .map_err(|e| format!("读取 OCR 增量记录失败: {}", e))?;
        if bytes == 0 {
            break;
        }
        if !line.ends_with('\n') {
            break;
        }
        record_index += 1;
        if record_index <= after_index {
            continue;
        }
        if records.len() >= limit {
            break;
        }
        let record = serde_json::from_str::<serde_json::Value>(line.trim_end())
            .map_err(|e| format!("解析第 {} 条 OCR 增量记录失败: {}", record_index, e))?;
        records.push(record);
    }

    let next_index = after_index + records.len();
    let has_more = records.len() == limit;
    Ok(serde_json::json!({
        "records": records,
        "next_index": next_index,
        "has_more": has_more,
    }))
}

const REPORT_PAGE_WIDTH: u32 = 1240;
const REPORT_PAGE_HEIGHT: u32 = 1754;
const REPORT_MARGIN: i32 = 82;

fn load_report_font() -> Result<FontArc, String> {
    let candidates = if cfg!(target_os = "windows") {
        vec![
            PathBuf::from(r"C:\Windows\Fonts\simhei.ttf"),
            PathBuf::from(r"C:\Windows\Fonts\NotoSansSC-VF.ttf"),
            PathBuf::from(r"C:\Windows\Fonts\Deng.ttf"),
            PathBuf::from(r"C:\Windows\Fonts\msyh.ttc"),
        ]
    } else {
        vec![
            PathBuf::from("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
            PathBuf::from("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
            PathBuf::from("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        ]
    };

    for path in candidates {
        if !path.exists() {
            continue;
        }
        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        if let Ok(font) = FontArc::try_from_vec(bytes) {
            return Ok(font);
        }
    }

    Err("生成 PDF 失败: 未找到可用中文字体，请确认系统已安装 SimHei、Noto Sans SC 或 Microsoft YaHei 字体".to_string())
}

fn text_value(value: Option<&serde_json::Value>) -> String {
    match value {
        Some(serde_json::Value::String(text)) if !text.trim().is_empty() => text.to_string(),
        Some(serde_json::Value::Number(number)) => number.to_string(),
        Some(serde_json::Value::Bool(value)) => {
            if *value {
                "是".to_string()
            } else {
                "否".to_string()
            }
        }
        _ => "-".to_string(),
    }
}

fn wrap_report_text(font: &FontArc, text: &str, font_size: f32, max_width: u32) -> Vec<String> {
    let normalized = if text.trim().is_empty() { "-" } else { text };
    let mut lines = Vec::new();
    for raw_line in normalized.lines() {
        let mut current = String::new();
        for ch in raw_line.chars() {
            let next = format!("{}{}", current, ch);
            let (width, _) = text_size(font_size, font, &next);
            if width > max_width && !current.is_empty() {
                lines.push(current);
                current = ch.to_string();
            } else {
                current = next;
            }
        }
        if !current.is_empty() {
            lines.push(current);
        }
    }
    if lines.is_empty() {
        lines.push("-".to_string());
    }
    lines
}

fn draw_report_text(
    image: &mut RgbImage,
    font: &FontArc,
    text: &str,
    x: i32,
    y: i32,
    size: f32,
    color: Rgb<u8>,
) {
    draw_text_mut(image, color, x, y, size, font, text);
}

fn draw_centered_report_text(
    image: &mut RgbImage,
    font: &FontArc,
    text: &str,
    y: i32,
    size: f32,
    color: Rgb<u8>,
) {
    let (width, _) = text_size(size, font, text);
    let x = ((REPORT_PAGE_WIDTH as i32 - width as i32) / 2).max(0);
    draw_report_text(image, font, text, x, y, size, color);
}

fn draw_section_title(image: &mut RgbImage, font: &FontArc, title: &str, y: &mut i32) {
    let blue = Rgb([37, 99, 235]);
    draw_filled_rect_mut(image, Rect::at(REPORT_MARGIN, *y + 8).of_size(8, 24), blue);
    draw_report_text(
        image,
        font,
        title,
        REPORT_MARGIN + 18,
        *y,
        27.0,
        Rgb([17, 24, 39]),
    );
    *y += 48;
}

fn draw_key_value_table(
    image: &mut RgbImage,
    font: &FontArc,
    rows: &[(String, String)],
    y: &mut i32,
) {
    let x = REPORT_MARGIN;
    let width = REPORT_PAGE_WIDTH as i32 - REPORT_MARGIN * 2;
    let label_width = 230;
    let border = Rgb([148, 163, 184]);
    let label_bg = Rgb([239, 246, 255]);
    let text_color = Rgb([31, 41, 55]);
    let muted = Rgb([71, 85, 105]);

    for (label, value) in rows {
        let wrapped = wrap_report_text(font, value, 22.0, (width - label_width - 34) as u32);
        let row_height = (wrapped.len() as i32 * 30 + 22).max(58);
        draw_filled_rect_mut(
            image,
            Rect::at(x, *y).of_size(label_width as u32, row_height as u32),
            label_bg,
        );
        draw_hollow_rect_mut(
            image,
            Rect::at(x, *y).of_size(width as u32, row_height as u32),
            border,
        );
        draw_line_segment_mut(
            image,
            ((x + label_width) as f32, *y as f32),
            ((x + label_width) as f32, (*y + row_height) as f32),
            border,
        );
        draw_report_text(image, font, label, x + 18, *y + 15, 22.0, muted);
        for (index, line) in wrapped.iter().enumerate() {
            draw_report_text(
                image,
                font,
                line,
                x + label_width + 18,
                *y + 14 + index as i32 * 30,
                22.0,
                text_color,
            );
        }
        *y += row_height;
    }
    *y += 30;
}

fn draw_data_table(
    image: &mut RgbImage,
    font: &FontArc,
    headers: &[&str],
    rows: &[Vec<String>],
    column_widths: &[i32],
    y: &mut i32,
) {
    let x = REPORT_MARGIN;
    let border = Rgb([148, 163, 184]);
    let header_bg = Rgb([226, 232, 240]);
    let body_bg = Rgb([255, 255, 255]);
    let text_color = Rgb([31, 41, 55]);
    let muted = Rgb([71, 85, 105]);
    let table_width: i32 = column_widths.iter().sum();
    let header_height = 54;

    draw_filled_rect_mut(
        image,
        Rect::at(x, *y).of_size(table_width as u32, header_height as u32),
        header_bg,
    );
    draw_hollow_rect_mut(
        image,
        Rect::at(x, *y).of_size(table_width as u32, header_height as u32),
        border,
    );
    let mut current_x = x;
    for (index, header) in headers.iter().enumerate() {
        if index > 0 {
            draw_line_segment_mut(
                image,
                (current_x as f32, *y as f32),
                (current_x as f32, (*y + header_height) as f32),
                border,
            );
        }
        draw_report_text(image, font, header, current_x + 12, *y + 14, 21.0, muted);
        current_x += column_widths[index];
    }
    *y += header_height;

    if rows.is_empty() {
        draw_hollow_rect_mut(
            image,
            Rect::at(x, *y).of_size(table_width as u32, 60),
            border,
        );
        draw_report_text(image, font, "暂无数据", x + 18, *y + 16, 22.0, muted);
        *y += 90;
        return;
    }

    for row in rows {
        let row_height = 68;
        draw_filled_rect_mut(
            image,
            Rect::at(x, *y).of_size(table_width as u32, row_height as u32),
            body_bg,
        );
        draw_hollow_rect_mut(
            image,
            Rect::at(x, *y).of_size(table_width as u32, row_height as u32),
            border,
        );
        let mut current_x = x;
        for (index, width) in column_widths.iter().enumerate() {
            if index > 0 {
                draw_line_segment_mut(
                    image,
                    (current_x as f32, *y as f32),
                    (current_x as f32, (*y + row_height) as f32),
                    border,
                );
            }
            let value = row.get(index).map(String::as_str).unwrap_or("-");
            let lines = wrap_report_text(font, value, 20.0, (*width - 22).max(20) as u32);
            for (line_index, line) in lines.iter().take(2).enumerate() {
                draw_report_text(
                    image,
                    font,
                    line,
                    current_x + 11,
                    *y + 12 + line_index as i32 * 25,
                    20.0,
                    text_color,
                );
            }
            current_x += *width;
        }
        *y += row_height;
    }
    *y += 30;
}

fn measurement_value(record: &serde_json::Value, preferred_id: &str, fallback_id: &str) -> String {
    let measurements = record
        .get("measurements")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    for pattern in [preferred_id, fallback_id] {
        if pattern.is_empty() {
            continue;
        }
        if let Some(item) = measurements.iter().find(|measurement| {
            measurement
                .get("id")
                .and_then(|value| value.as_str())
                .map(|id| id.contains(pattern))
                .unwrap_or(false)
        }) {
            let raw = text_value(item.get("raw"));
            if raw != "-" {
                return raw;
            }
            return text_value(item.get("value"));
        }
    }
    "-".to_string()
}

fn write_image_pdf(report_path: &Path, jpeg_bytes: &[u8]) -> Result<(), String> {
    fn push_object(pdf: &mut Vec<u8>, offsets: &mut Vec<usize>, id: usize, body: &[u8]) {
        offsets[id] = pdf.len();
        pdf.extend_from_slice(format!("{} 0 obj\n", id).as_bytes());
        pdf.extend_from_slice(body);
        pdf.extend_from_slice(b"\nendobj\n");
    }

    let page_width = 595.28_f32;
    let page_height = 841.89_f32;
    let mut pdf = Vec::new();
    let mut offsets = vec![0usize; 6];
    pdf.extend_from_slice(b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

    push_object(
        &mut pdf,
        &mut offsets,
        1,
        b"<< /Type /Catalog /Pages 2 0 R >>",
    );
    push_object(
        &mut pdf,
        &mut offsets,
        2,
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    );
    let page = format!(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.2} {:.2}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
        page_width, page_height
    );
    push_object(&mut pdf, &mut offsets, 3, page.as_bytes());

    offsets[4] = pdf.len();
    pdf.extend_from_slice(b"4 0 obj\n");
    pdf.extend_from_slice(
        format!(
            "<< /Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {} >>\nstream\n",
            REPORT_PAGE_WIDTH,
            REPORT_PAGE_HEIGHT,
            jpeg_bytes.len()
        )
        .as_bytes(),
    );
    pdf.extend_from_slice(jpeg_bytes);
    pdf.extend_from_slice(b"\nendstream\nendobj\n");

    let content = format!(
        "q\n{:.2} 0 0 {:.2} 0 0 cm\n/Im0 Do\nQ\n",
        page_width, page_height
    );
    let content_object = format!(
        "<< /Length {} >>\nstream\n{}endstream",
        content.len(),
        content
    );
    push_object(&mut pdf, &mut offsets, 5, content_object.as_bytes());

    let xref_offset = pdf.len();
    pdf.extend_from_slice(b"xref\n0 6\n0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        pdf.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{}\n%%EOF\n",
            xref_offset
        )
        .as_bytes(),
    );

    fs::write(report_path, pdf).map_err(|e| format!("写入高温高压测试报告 PDF 失败: {}", e))
}

struct ReportRecordSummary {
    record_count: usize,
    detected_count: usize,
    first_time: String,
    last_time: String,
    latest: serde_json::Value,
    preview: Vec<serde_json::Value>,
}

fn load_report_record_summary(readings_json_path: &Path) -> Result<ReportRecordSummary, String> {
    let journal_path = readings_json_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("ocr_records.ndjson");
    if journal_path.exists() {
        let file =
            fs::File::open(&journal_path).map_err(|e| format!("读取 OCR 增量记录失败: {}", e))?;
        let mut record_count = 0usize;
        let mut detected_count = 0usize;
        let mut first_time = "-".to_string();
        let mut last_time = "-".to_string();
        let mut latest = serde_json::json!({});
        let mut preview = Vec::new();
        for line in BufReader::new(file).lines() {
            let line = line.map_err(|e| format!("读取 OCR 增量记录失败: {}", e))?;
            if line.trim().is_empty() {
                continue;
            }
            let record: serde_json::Value =
                serde_json::from_str(&line).map_err(|e| format!("解析 OCR 增量记录失败: {}", e))?;
            record_count += 1;
            if record
                .get("screen_detected")
                .and_then(|value| value.as_bool())
                .unwrap_or(false)
            {
                detected_count += 1;
            }
            let time = record
                .get("time_sec")
                .map(|value| value.to_string())
                .unwrap_or_else(|| "-".to_string());
            if record_count == 1 {
                first_time = time.clone();
            }
            last_time = time;
            if preview.len() < 5 {
                preview.push(record.clone());
            }
            latest = record;
        }
        return Ok(ReportRecordSummary {
            record_count,
            detected_count,
            first_time,
            last_time,
            latest,
            preview,
        });
    }

    let payload_text =
        fs::read_to_string(readings_json_path).map_err(|e| format!("读取采样JSON失败: {}", e))?;
    let payload: serde_json::Value =
        serde_json::from_str(&payload_text).map_err(|e| format!("解析采样JSON失败: {}", e))?;
    let records = payload
        .get("records")
        .and_then(|value| value.as_array())
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    Ok(ReportRecordSummary {
        record_count: records.len(),
        detected_count: records
            .iter()
            .filter(|record| {
                record
                    .get("screen_detected")
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false)
            })
            .count(),
        first_time: records
            .first()
            .and_then(|record| record.get("time_sec"))
            .map(|value| value.to_string())
            .unwrap_or_else(|| "-".to_string()),
        last_time: records
            .last()
            .and_then(|record| record.get("time_sec"))
            .map(|value| value.to_string())
            .unwrap_or_else(|| "-".to_string()),
        latest: records
            .last()
            .cloned()
            .unwrap_or_else(|| serde_json::json!({})),
        preview: records.iter().take(5).cloned().collect(),
    })
}

fn write_high_temp_pressure_pdf_report(
    readings_json_path: &Path,
    report_path: &Path,
) -> Result<(), String> {
    let records = load_report_record_summary(readings_json_path)?;
    let record_count = records.record_count;
    let detected_count = records.detected_count;
    let first_time = &records.first_time;
    let last_time = &records.last_time;
    let generated_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "-".to_string());

    let font = load_report_font()?;
    let mut page =
        RgbImage::from_pixel(REPORT_PAGE_WIDTH, REPORT_PAGE_HEIGHT, Rgb([255, 255, 255]));
    let mut y = 80;
    draw_centered_report_text(
        &mut page,
        &font,
        "高温高压测试报告",
        y,
        42.0,
        Rgb([15, 23, 42]),
    );
    y += 58;
    draw_centered_report_text(
        &mut page,
        &font,
        "COSL 数字化实验室测试台软件",
        y,
        23.0,
        Rgb([71, 85, 105]),
    );
    y += 72;
    draw_line_segment_mut(
        &mut page,
        (REPORT_MARGIN as f32, y as f32),
        ((REPORT_PAGE_WIDTH as i32 - REPORT_MARGIN) as f32, y as f32),
        Rgb([203, 213, 225]),
    );
    y += 34;

    draw_section_title(&mut page, &font, "基础信息", &mut y);
    let file_name = readings_json_path
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| readings_json_path.to_string_lossy().to_string());
    draw_key_value_table(
        &mut page,
        &font,
        &[
            (
                "报告类型".to_string(),
                "高温高压井 OCR 识别测试报告".to_string(),
            ),
            ("数据文件".to_string(), file_name),
            (
                "原始路径".to_string(),
                readings_json_path.to_string_lossy().to_string(),
            ),
            ("生成时间".to_string(), format!("{} 秒时间戳", generated_at)),
        ],
        &mut y,
    );

    draw_section_title(&mut page, &font, "采样摘要", &mut y);
    draw_key_value_table(
        &mut page,
        &font,
        &[
            ("采样记录数".to_string(), format!("{} 条", record_count)),
            ("识别成功数".to_string(), format!("{} 条", detected_count)),
            ("首条时间".to_string(), format!("{} s", first_time)),
            ("末条时间".to_string(), format!("{} s", last_time)),
        ],
        &mut y,
    );

    draw_section_title(&mut page, &font, "关键识别数据", &mut y);
    let latest_rows = records
        .latest
        .get("measurements")
        .and_then(|value| value.as_array())
        .map(|measurements| {
            measurements
                .iter()
                .take(4)
                .enumerate()
                .map(|(index, item)| {
                    vec![
                        (index + 1).to_string(),
                        text_value(item.get("part")),
                        text_value(item.get("data")),
                        text_value(item.get("raw")).replace('\n', " "),
                        text_value(item.get("confidence")),
                    ]
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    draw_data_table(
        &mut page,
        &font,
        &["序号", "部件", "数据项", "识别值", "置信度"],
        &latest_rows,
        &[80, 230, 350, 190, 150],
        &mut y,
    );

    draw_section_title(&mut page, &font, "采样记录预览", &mut y);
    let preview_rows = records
        .preview
        .iter()
        .take(5)
        .map(|record| {
            vec![
                text_value(record.get("time_sec")),
                text_value(record.get("screen_detected")),
                measurement_value(record, "upper_water_temp", "upper_inlet_oil_temp"),
                measurement_value(record, "lower_water_temp", "lower_inlet_oil_temp"),
                measurement_value(record, "vessel_250_pressure", "pressure"),
            ]
        })
        .collect::<Vec<_>>();
    draw_data_table(
        &mut page,
        &font,
        &["时间(s)", "识别", "上部水温", "下部水温", "容器压力"],
        &preview_rows,
        &[150, 150, 240, 240, 220],
        &mut y,
    );

    draw_section_title(&mut page, &font, "报告确认", &mut y);
    draw_key_value_table(
        &mut page,
        &font,
        &[
            ("总体结论".to_string(), "待人工复核".to_string()),
            (
                "附件说明".to_string(),
                "完整采样明细请查看同目录 ocr_readings_0.5s.json".to_string(),
            ),
        ],
        &mut y,
    );

    draw_report_text(
        &mut page,
        &font,
        "本报告由测试端根据 OCR 识别采样数据自动生成，样式参考管理端测试报告下载格式。",
        REPORT_MARGIN,
        REPORT_PAGE_HEIGHT as i32 - 72,
        19.0,
        Rgb([100, 116, 139]),
    );

    let mut jpeg_bytes = Vec::new();
    JpegEncoder::new_with_quality(&mut jpeg_bytes, 92)
        .encode_image(&page)
        .map_err(|e| format!("生成高温高压测试报告页面失败: {}", e))?;
    write_image_pdf(report_path, &jpeg_bytes)
}

fn copy_high_temp_pressure_report_output(source: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target).map_err(|e| format!("创建导出目录失败: {}", e))?;

    let json_source = source.join("ocr_readings_0.5s.json");
    if !json_source.exists() {
        return Err(format!("采样JSON不存在: {}", json_source.to_string_lossy()));
    }
    fs::copy(&json_source, target.join("ocr_readings_0.5s.json"))
        .map_err(|e| format!("复制采样JSON失败: {}", e))?;

    Ok(())
}

fn sanitize_folder_name(input: &str) -> String {
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut sanitized = input
        .chars()
        .map(|c| if invalid.contains(&c) { '_' } else { c })
        .collect::<String>();
    sanitized = sanitized.trim().trim_matches('.').to_string();
    if sanitized.is_empty() {
        "high_temp_pressure_capture".to_string()
    } else {
        sanitized
    }
}

#[tauri::command]
pub fn get_high_temp_pressure_ocr_devices() -> Result<Vec<HighTempPressureOcrDevice>, String> {
    let mut devices = nokhwa::query(nokhwa::utils::ApiBackend::Auto)
        .map_err(|error| format!("枚举 OCR 采集设备失败: {}", error))?
        .into_iter()
        .filter_map(|device| {
            let index = device.index().as_index().ok()?;
            Some(HighTempPressureOcrDevice {
                index,
                name: device.human_name(),
                available: true,
            })
        })
        .collect::<Vec<_>>();
    devices.sort_by_key(|device| device.index);
    Ok(devices)
}

#[tauri::command]
pub fn start_high_temp_pressure_ocr_stream(
    app: AppHandle,
    state: State<HighTempPressureOcrState>,
    python_path: Option<String>,
    device_index: i32,
    interval: f64,
) -> Result<serde_json::Value, String> {
    if device_index < 0 {
        return Err("采集卡设备索引无效".to_string());
    }
    let python_program = crate::ocr_runtime::resolve_ocr_python(&app, python_path)?;
    ensure_ocr_dependencies(&python_program)?;
    let script_path = resolve_script_path(&app)?;
    let output_dir = create_output_dir(&app)?;

    {
        let mut guard = state.process.lock().map_err(|e| e.to_string())?;
        if let Some(child) = guard.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    *guard = None;
                }
                Ok(None) => {
                    return Err("已有高温高压井 OCR 任务正在运行".to_string());
                }
                Err(e) => return Err(format!("检查高温高压井 OCR 进程状态失败: {}", e)),
            }
        }
    }

    let script_path_str = script_path.to_string_lossy().to_string();
    let output_dir_str = output_dir.to_string_lossy().to_string();
    let device_index_str = device_index.to_string();
    let interval_str = interval.to_string();
    let mut cmd = create_hidden_command(&python_program);
    cmd.args([
        script_path_str.as_str(),
        "--device-index",
        device_index_str.as_str(),
        "--output-dir",
        output_dir_str.as_str(),
        "--interval",
        interval_str.as_str(),
    ])
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动高温高压井 OCR 进程失败: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取高温高压井 OCR 进程标准输出".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取高温高压井 OCR 进程错误输出".to_string())?;

    {
        let mut guard = state.process.lock().map_err(|e| e.to_string())?;
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
    let output_dir_clone = output_dir.clone();

    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { continue };
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            match serde_json::from_str::<serde_json::Value>(trimmed) {
                Ok(mut payload) => {
                    absolutize_path_field(&mut payload, "preview_path", &output_dir_clone);
                    absolutize_path_field(&mut payload, "latest_frame", &output_dir_clone);
                    let _ = app_clone.emit("high-temp-pressure-ocr-stream", payload);
                }
                Err(_) => {
                    let _ = app_clone.emit(
                        "high-temp-pressure-ocr-stream",
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

        let wait_result = {
            let mut guard = process_handle.lock().ok();
            match guard.as_mut().and_then(|inner| inner.take()) {
                Some(mut child) => child.wait().ok(),
                None => None,
            }
        };

        if let Some(status) = wait_result {
            if !status.success() {
                let message = if stderr_text.is_empty() {
                    format!("高温高压井 OCR 进程退出失败，退出码: {:?}", status.code())
                } else {
                    stderr_text
                };
                let _ = app_clone.emit(
                    "high-temp-pressure-ocr-stream",
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
        "device_index": device_index,
    }))
}

#[tauri::command]
pub fn pause_high_temp_pressure_ocr_stream(
    state: State<HighTempPressureOcrState>,
    output_dir: String,
) -> Result<(), String> {
    ensure_exists(&output_dir, "采集输出目录")?;
    let mut guard = state.process.lock().map_err(|e| e.to_string())?;
    let child = guard
        .as_mut()
        .ok_or_else(|| "OCR 采集进程未运行".to_string())?;
    if child
        .try_wait()
        .map_err(|e| format!("检查 OCR 采集进程失败: {}", e))?
        .is_some()
    {
        return Err("OCR 采集进程已结束".to_string());
    }
    write_control_action(Path::new(&output_dir), "pause")
}

#[tauri::command]
pub fn resume_high_temp_pressure_ocr_stream(
    state: State<HighTempPressureOcrState>,
    output_dir: String,
) -> Result<(), String> {
    ensure_exists(&output_dir, "采集输出目录")?;
    let mut guard = state.process.lock().map_err(|e| e.to_string())?;
    let child = guard
        .as_mut()
        .ok_or_else(|| "OCR 采集进程未运行".to_string())?;
    if child
        .try_wait()
        .map_err(|e| format!("检查 OCR 采集进程失败: {}", e))?
        .is_some()
    {
        return Err("OCR 采集进程已结束".to_string());
    }
    write_control_action(Path::new(&output_dir), "resume")
}

#[tauri::command]
pub fn stop_high_temp_pressure_ocr_stream(
    state: State<HighTempPressureOcrState>,
    output_dir: Option<String>,
) -> Result<(), String> {
    if let Some(dir) = output_dir.as_ref() {
        let _ = write_control_action(Path::new(dir), "stop");
    }
    let mut guard = state.process.lock().map_err(|e| e.to_string())?;
    if let Some(child) = guard.as_mut() {
        for _ in 0..300 {
            if child
                .try_wait()
                .map_err(|e| format!("等待 OCR 采集进程退出失败: {}", e))?
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
pub fn get_high_temp_pressure_capture_status(
    output_dir: String,
) -> Result<serde_json::Value, String> {
    ensure_exists(&output_dir, "采集输出目录")?;
    read_progress_file(Path::new(&output_dir))
}

#[tauri::command]
pub fn get_high_temp_pressure_capture_records(
    output_dir: String,
    after_index: usize,
    limit: Option<usize>,
) -> Result<serde_json::Value, String> {
    ensure_exists(&output_dir, "采集输出目录")?;
    read_journal_records(
        Path::new(&output_dir),
        after_index,
        limit.unwrap_or(1000).clamp(1, 5000),
    )
}

#[tauri::command]
pub fn get_high_temp_pressure_capture_result(
    output_dir: String,
) -> Result<serde_json::Value, String> {
    ensure_exists(&output_dir, "采集输出目录")?;
    read_payload_files(Path::new(&output_dir))
}

#[tauri::command]
pub fn export_high_temp_pressure_capture_output(
    source_output_dir: String,
    target_dir: String,
    folder_name: Option<String>,
) -> Result<serde_json::Value, String> {
    ensure_exists(&source_output_dir, "采集输出目录")?;
    ensure_exists(&target_dir, "导出目标目录")?;
    let source = PathBuf::from(source_output_dir);
    let target_root = PathBuf::from(target_dir);
    let folder_name = sanitize_folder_name(
        folder_name
            .unwrap_or_else(|| "high_temp_pressure_capture".to_string())
            .as_str(),
    );
    let final_target = target_root.join(folder_name);

    if final_target.exists() {
        fs::remove_dir_all(&final_target).map_err(|e| format!("清理旧导出目录失败: {}", e))?;
    }

    copy_high_temp_pressure_report_output(&source, &final_target)?;

    Ok(serde_json::json!({
        "export_dir": final_target.to_string_lossy(),
        "source_dir": source.to_string_lossy(),
    }))
}

#[tauri::command]
pub fn read_high_temp_pressure_business_report(export_dir: String) -> Result<String, String> {
    let export_path = PathBuf::from(&export_dir);
    if !export_path.is_absolute() {
        return Err("OCR 识别结果目录必须是绝对路径".to_string());
    }
    if !export_path.is_dir() {
        return Err(format!("OCR 识别结果目录不存在: {}", export_dir));
    }

    let report_path = export_path.join(HIGH_TEMP_PRESSURE_BUSINESS_REPORT_FILENAME);
    if !report_path.is_file() {
        return Err(format!("业务报告不存在: {}", report_path.to_string_lossy()));
    }

    let bytes = fs::read(&report_path).map_err(|error| {
        format!(
            "读取业务报告失败 {}: {}",
            report_path.to_string_lossy(),
            error
        )
    })?;
    if bytes.is_empty() {
        return Err(format!("业务报告为空: {}", report_path.to_string_lossy()));
    }

    Ok(BASE64.encode(bytes))
}

#[tauri::command]
pub fn read_high_temp_pressure_curve_records(
    export_dir: String,
) -> Result<serde_json::Value, String> {
    let export_path = PathBuf::from(&export_dir);
    if !export_path.is_absolute() {
        return Err("OCR 识别结果目录必须是绝对路径".to_string());
    }
    if !export_path.is_dir() {
        return Err(format!("OCR 识别结果目录不存在: {}", export_dir));
    }

    let json_path = export_path.join("ocr_readings_0.5s.json");
    let payload_text = fs::read_to_string(&json_path).map_err(|error| {
        format!(
            "读取采样JSON失败 {}: {}",
            json_path.to_string_lossy(),
            error
        )
    })?;
    let payload: serde_json::Value = serde_json::from_str(&payload_text).map_err(|error| {
        format!(
            "解析采样JSON失败 {}: {}",
            json_path.to_string_lossy(),
            error
        )
    })?;
    let records = payload
        .get("records")
        .and_then(|value| value.as_array())
        .cloned()
        .or_else(|| payload.as_array().cloned())
        .ok_or_else(|| "采样JSON缺少 records 数组".to_string())?;
    let record_count = records.len();

    Ok(serde_json::json!({
        "records": records,
        "record_count": record_count,
        "source_path": json_path.to_string_lossy(),
    }))
}

#[tauri::command]
pub fn write_high_temp_pressure_curve_chart(
    export_dir: String,
    image_bytes: Vec<u8>,
    file_name: Option<String>,
) -> Result<serde_json::Value, String> {
    ensure_exists(&export_dir, "导出目录")?;
    let export_path = PathBuf::from(&export_dir);
    fs::create_dir_all(&export_path).map_err(|e| format!("创建导出目录失败: {}", e))?;

    let requested_name = file_name.unwrap_or_else(|| "高温高压测试结果曲线.png".to_string());
    let safe_name = PathBuf::from(&requested_name)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("高温高压测试结果曲线.png")
        .to_string();
    if !safe_name.to_ascii_lowercase().ends_with(".png") {
        return Err("曲线图片文件名必须使用 PNG 扩展名".to_string());
    }
    let image_path = export_path.join(safe_name);
    fs::write(&image_path, image_bytes)
        .map_err(|e| format!("写入温度/压力测试曲线图失败: {}", e))?;

    Ok(serde_json::json!({
        "image_path": image_path.to_string_lossy(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn incremental_journal_reader_returns_only_complete_records() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let output_dir = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("tmp")
            .join(format!("high-temp-pressure-journal-test-{}", suffix));
        fs::create_dir_all(&output_dir).unwrap();
        fs::write(
            output_dir.join("ocr_records.ndjson"),
            "{\"record_index\":1}\n{\"record_index\":2}\n{\"record_index\":3",
        )
        .unwrap();

        let result = read_journal_records(&output_dir, 0, 100).unwrap();
        let records = result["records"].as_array().unwrap();
        assert_eq!(records.len(), 2);
        assert_eq!(result["next_index"], 2);
        assert_eq!(records[0]["record_index"], 1);
        assert_eq!(records[1]["record_index"], 2);

        fs::write(
            output_dir.join("ocr_records.ndjson"),
            "{\"record_index\":1,\"time_sec\":0.0,\"screen_detected\":true,\"measurements\":[]}\n{\"record_index\":2,\"time_sec\":0.5,\"screen_detected\":false,\"measurements\":[]}\n",
        )
        .unwrap();
        let readings_path = output_dir.join("ocr_readings_0.5s.json");
        fs::write(&readings_path, "{}").unwrap();
        let summary = load_report_record_summary(&readings_path).unwrap();
        assert_eq!(summary.record_count, 2);
        assert_eq!(summary.detected_count, 1);
        assert_eq!(summary.first_time, "0.0");
        assert_eq!(summary.last_time, "0.5");
        assert_eq!(summary.preview.len(), 2);

        fs::remove_dir_all(output_dir).unwrap();
    }

    #[test]
    fn high_temp_pressure_pdf_report_is_written_as_pdf() {
        let output_dir = std::env::current_dir()
            .unwrap()
            .join("target")
            .join("tmp")
            .join("high-temp-pressure-report-test");
        fs::create_dir_all(&output_dir).unwrap();
        let json_path = output_dir.join("ocr_readings_0.5s.json");
        let pdf_path = output_dir.join("高温高压测试报告.pdf");
        fs::write(
            &json_path,
            r#"{
  "schema_version": 2,
  "record_count": 2,
  "records": [
    {
      "time_sec": 0.0,
      "frame_time_sec": 0.0,
      "screen_detected": true,
      "measurements": [
        {"id": "vessel_250_upper_water_temp", "part": "250试验容器", "data": "上部水温", "raw": "150", "value": 150, "confidence": 0.98},
        {"id": "vessel_250_lower_water_temp", "part": "250试验容器", "data": "下部水温", "raw": "149", "value": 149, "confidence": 0.97},
        {"id": "vessel_250_pressure", "part": "250试验容器", "data": "容器压力", "raw": "70", "value": 70, "confidence": 0.96}
      ]
    },
    {
      "time_sec": 0.5,
      "frame_time_sec": 0.5,
      "screen_detected": true,
      "measurements": [
        {"id": "vessel_250_upper_water_temp", "part": "250试验容器", "data": "上部水温", "raw": "151", "value": 151, "confidence": 0.98},
        {"id": "vessel_250_lower_water_temp", "part": "250试验容器", "data": "下部水温", "raw": "150", "value": 150, "confidence": 0.97},
        {"id": "vessel_250_pressure", "part": "250试验容器", "data": "容器压力", "raw": "70", "value": 70, "confidence": 0.96}
      ]
    }
  ]
}"#,
        )
        .unwrap();

        write_high_temp_pressure_pdf_report(&json_path, &pdf_path).unwrap();

        let bytes = fs::read(&pdf_path).unwrap();
        assert!(bytes.starts_with(b"%PDF-1.4"));
        assert!(bytes
            .windows(b"/Subtype /Image".len())
            .any(|window| window == b"/Subtype /Image"));
    }
}
