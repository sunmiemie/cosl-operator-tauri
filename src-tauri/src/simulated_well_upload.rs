//! 模拟井报告大文件分块上传。

use serde::{Deserialize, Serialize};
use std::{collections::HashMap, path::PathBuf, sync::Arc, time::Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

pub struct SimulatedWellUploadState {
    cancellations: Arc<Mutex<HashMap<String, CancellationToken>>>,
    client: reqwest::Client,
}

impl Default for SimulatedWellUploadState {
    fn default() -> Self {
        Self {
            cancellations: Arc::new(Mutex::new(HashMap::new())),
            client: reqwest::Client::builder()
                // 模拟井后端通常运行在本机或内网。reqwest 默认自动读取系统代理，
                // 某些代理会拦截大文件 PUT 并返回空的 502，导致请求无法到达 Django。
                .no_proxy()
                // Django 开发服务及现场网关均以 HTTP/1.1 提供该上传接口。
                .http1_only()
                .connect_timeout(std::time::Duration::from_secs(30))
                .build()
                .expect("failed to build simulated well upload client"),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalUploadFile {
    path: String,
    name: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadChunkRequest {
    upload_id: String,
    url: String,
    path: String,
    start: u64,
    length: u64,
    total_file_size: u64,
    file_name: String,
    uploaded_before: u64,
    total_upload_size: u64,
    headers: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadChunkResponse {
    status: u16,
    body: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadProgress {
    upload_id: String,
    file_name: String,
    file_uploaded: u64,
    file_total: u64,
    uploaded: u64,
    total: u64,
    bytes_per_second: f64,
}

#[tauri::command]
pub async fn get_simulated_well_upload_files(paths: Vec<String>) -> Result<Vec<LocalUploadFile>, String> {
    let mut result = Vec::with_capacity(paths.len());
    for raw in paths {
        let path = PathBuf::from(&raw);
        let metadata = tokio::fs::metadata(&path)
            .await
            .map_err(|error| format!("无法读取文件 {}: {error}", path.display()))?;
        if !metadata.is_file() {
            return Err(format!("{} 不是可上传的文件", path.display()));
        }
        let name = path.file_name().and_then(|value| value.to_str())
            .ok_or_else(|| format!("文件名无效: {}", path.display()))?.to_string();
        result.push(LocalUploadFile { path: raw, name, size: metadata.len() });
    }
    Ok(result)
}

#[tauri::command]
pub async fn upload_simulated_well_file_chunk(
    app: AppHandle,
    state: State<'_, SimulatedWellUploadState>,
    request: UploadChunkRequest,
) -> Result<UploadChunkResponse, String> {
    if request.length == 0 || request.start.saturating_add(request.length) > request.total_file_size {
        return Err("上传分块范围无效".into());
    }
    let mut file = tokio::fs::File::open(&request.path).await
        .map_err(|error| format!("无法打开文件 {}: {error}", request.file_name))?;
    let actual_size = file.metadata().await.map_err(|error| error.to_string())?.len();
    if actual_size != request.total_file_size {
        return Err(format!("文件 {} 在上传前发生了变化，请重新选择", request.file_name));
    }
    file.seek(std::io::SeekFrom::Start(request.start)).await
        .map_err(|error| format!("无法定位文件分块: {error}"))?;

    let token = CancellationToken::new();
    state.cancellations.lock().await.insert(request.upload_id.clone(), token.clone());
    let started = Instant::now();
    // reqwest 无法从 ReaderStream 推导请求体的精确长度。即使手动设置
    // Content-Length，部分 HTTP 服务链路仍会将它作为 chunked body 处理并在
    // 请求进入 Django 前终止。分块大小由服务端在上传会话初始化时下发（默认 10 MiB），
    // 读取为定长字节体后再发送，可以让 reqwest 生成明确的 Content-Length，
    // 同时不会把整个原始文件载入内存。
    let chunk_length = usize::try_from(request.length)
        .map_err(|_| "上传分块过大，无法读取到内存".to_string())?;
    let mut chunk = vec![0_u8; chunk_length];
    file.read_exact(&mut chunk).await
        .map_err(|error| format!("读取文件分块失败: {error}"))?;
    let end = request.start + request.length - 1;
    let mut outgoing = state.client.put(&request.url)
        .header(reqwest::header::CONTENT_TYPE, "application/octet-stream")
        .header(reqwest::header::CONTENT_LENGTH, request.length)
        .header("Content-Range", format!("bytes {}-{}/{}", request.start, end, request.total_file_size))
        .body(chunk);
    for (name, value) in &request.headers { outgoing = outgoing.header(name, value); }

    let response = tokio::select! {
        _ = token.cancelled() => Err("上传已取消".to_string()),
        result = outgoing.send() => result.map_err(|error| format!("上传请求失败: {error}")),
    };
    state.cancellations.lock().await.remove(&request.upload_id);
    let response = response?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|error| format!("读取上传响应失败: {error}"))?;
    let elapsed = started.elapsed().as_secs_f64().max(0.001);
    let _ = app.emit("simulated-well-upload-progress", UploadProgress {
        upload_id: request.upload_id,
        file_name: request.file_name,
        file_uploaded: request.start + request.length,
        file_total: request.total_file_size,
        uploaded: request.uploaded_before + request.length,
        total: request.total_upload_size,
        bytes_per_second: request.length as f64 / elapsed,
    });
    Ok(UploadChunkResponse { status, body })
}

#[tauri::command]
pub async fn cancel_simulated_well_upload(upload_id: String, state: State<'_, SimulatedWellUploadState>) -> Result<bool, String> {
    if let Some(token) = state.cancellations.lock().await.get(&upload_id) {
        token.cancel();
        return Ok(true);
    }
    Ok(false)
}
