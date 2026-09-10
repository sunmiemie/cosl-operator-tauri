//! WindowAgent 通用分片文件接收服务。

use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Path as AxumPath, State},
    http::{HeaderMap, StatusCode},
    routing::{delete, get, post, put},
    Json, Router,
};
use chrono::Local;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    ffi::OsStr,
    path::{Path, PathBuf},
    sync::Arc,
    time::{Duration as StdDuration, SystemTime},
};
use tauri::State as TauriState;
use tokio::{
    fs::{self, OpenOptions},
    io::{AsyncReadExt, AsyncWriteExt},
    sync::Mutex,
    task::JoinHandle,
};
use tokio_util::sync::CancellationToken;

const MAX_FILE_SIZE: u64 = 1_073_741_824;
const MAX_FILE_COUNT: usize = 10;
const CHUNK_SIZE: u64 = 10 * 1024 * 1024;
const STALE_TEMP_AGE: StdDuration = StdDuration::from_secs(24 * 60 * 60);
const FILE_RECEIVER_BIND_ADDRESS: &str = "0.0.0.0";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReceiverConfig {
    pub enabled: bool,
    pub port: u16,
    pub directory: String,
    pub token_hash: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReceiverStatus {
    running: bool,
    bind_address: String,
    port: u16,
    directory: String,
    error: Option<String>,
}

struct ReceiverRuntime {
    status: FileReceiverStatus,
    cancellation: Option<CancellationToken>,
    task: Option<JoinHandle<()>>,
}

pub struct FileReceiverState {
    runtime: Arc<Mutex<ReceiverRuntime>>,
}

impl Default for FileReceiverState {
    fn default() -> Self {
        Self {
            runtime: Arc::new(Mutex::new(ReceiverRuntime {
                status: FileReceiverStatus {
                    running: false,
                    bind_address: FILE_RECEIVER_BIND_ADDRESS.to_string(),
                    port: 17891,
                    directory: String::new(),
                    error: None,
                },
                cancellation: None,
                task: None,
            })),
        }
    }
}

impl FileReceiverState {
    pub fn shutdown_now(&self) {
        if let Ok(runtime) = self.runtime.try_lock() {
            if let Some(cancellation) = runtime.cancellation.as_ref() {
                cancellation.cancel();
            }
        }
    }
}

#[derive(Clone)]
struct HttpState {
    root: PathBuf,
    temp_root: PathBuf,
    token_hash: String,
    batches: Arc<Mutex<HashMap<String, UploadBatch>>>,
}

struct UploadBatch {
    date: String,
    directory: PathBuf,
    files: HashMap<String, UploadFile>,
}

struct UploadFile {
    client_file_id: String,
    name: String,
    size: u64,
    expected_offset: u64,
    completed: bool,
    part_path: PathBuf,
}

#[derive(Debug, Deserialize)]
struct CreateBatchRequest {
    files: Vec<CreateFileRequest>,
}

#[derive(Debug, Deserialize)]
struct CreateFileRequest {
    client_file_id: String,
    name: String,
    size: u64,
}

#[derive(Debug, Deserialize)]
struct CompleteFileRequest {
    sha256: String,
}

type ApiError = (StatusCode, Json<Value>);
type ApiResult = Result<Json<Value>, ApiError>;

fn api_error(status: StatusCode, code: &str, message: impl Into<String>) -> ApiError {
    (
        status,
        Json(json!({ "code": code, "message": message.into() })),
    )
}

fn random_hex(bytes: usize) -> String {
    let mut value = vec![0_u8; bytes];
    rand::rng().fill_bytes(&mut value);
    hex::encode(value)
}

fn token_digest(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn constant_time_eq(left: &str, right: &str) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.as_bytes()
        .iter()
        .zip(right.as_bytes())
        .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn authorize(headers: &HeaderMap, expected_hash: &str) -> Result<(), ApiError> {
    let token = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| api_error(StatusCode::UNAUTHORIZED, "unauthorized", "缺少上传令牌"))?;
    if !constant_time_eq(&token_digest(token), expected_hash) {
        return Err(api_error(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "上传令牌无效",
        ));
    }
    Ok(())
}

fn validate_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn validate_file_name(name: &str) -> Result<(), String> {
    if name.is_empty() || name.len() > 240 {
        return Err("文件名不能为空且长度不能超过 240 个字符".to_string());
    }
    if name.contains("..")
        || name.contains(['/', '\\'])
        || Path::new(name).is_absolute()
        || Path::new(name).file_name() != Some(OsStr::new(name))
        || name.chars().any(|ch| ch < ' ' || "<>:\"|?*".contains(ch))
        || name.ends_with(['.', ' '])
    {
        return Err("文件名包含非法路径或字符".to_string());
    }
    let stem = Path::new(name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or("")
        .to_ascii_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved.contains(&stem.as_str()) {
        return Err("文件名是 Windows 保留名称".to_string());
    }
    Ok(())
}

fn parse_content_range(value: &str) -> Result<(u64, u64, u64), String> {
    let value = value
        .strip_prefix("bytes ")
        .ok_or_else(|| "Content-Range 格式错误".to_string())?;
    let (range, total) = value
        .split_once('/')
        .ok_or_else(|| "Content-Range 格式错误".to_string())?;
    let (start, end) = range
        .split_once('-')
        .ok_or_else(|| "Content-Range 格式错误".to_string())?;
    let start = start
        .parse::<u64>()
        .map_err(|_| "分片起点无效".to_string())?;
    let end = end.parse::<u64>().map_err(|_| "分片终点无效".to_string())?;
    let total = total
        .parse::<u64>()
        .map_err(|_| "文件总大小无效".to_string())?;
    if end < start {
        return Err("分片范围无效".to_string());
    }
    Ok((start, end, total))
}

async fn health() -> Json<Value> {
    Json(json!({
        "service": "cosl-file-receiver",
        "version": 1,
        "maxFileSize": MAX_FILE_SIZE,
        "maxFileCount": MAX_FILE_COUNT,
        "chunkSize": CHUNK_SIZE
    }))
}

async fn create_batch(
    State(state): State<HttpState>,
    headers: HeaderMap,
    Json(request): Json<CreateBatchRequest>,
) -> ApiResult {
    authorize(&headers, &state.token_hash)?;
    if request.files.is_empty() || request.files.len() > MAX_FILE_COUNT {
        return Err(api_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "file_count_limit",
            format!("每批只能传输 1 至 {MAX_FILE_COUNT} 个文件"),
        ));
    }
    let mut client_ids = HashSet::new();
    for file in &request.files {
        if !validate_id(&file.client_file_id) || !client_ids.insert(file.client_file_id.clone()) {
            return Err(api_error(
                StatusCode::BAD_REQUEST,
                "invalid_file_id",
                "文件 ID 无效或重复",
            ));
        }
        validate_file_name(&file.name)
            .map_err(|message| api_error(StatusCode::BAD_REQUEST, "invalid_file_name", message))?;
        if file.size > MAX_FILE_SIZE {
            return Err(api_error(
                StatusCode::PAYLOAD_TOO_LARGE,
                "file_size_limit",
                format!("文件 {} 超过 1 GiB 限制", file.name),
            ));
        }
    }

    let batch_id = random_hex(16);
    let directory = state.temp_root.join(&batch_id);
    fs::create_dir_all(&directory).await.map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "create_temp_failed",
            error.to_string(),
        )
    })?;
    let mut files = HashMap::new();
    let mut response_files = Vec::with_capacity(request.files.len());
    for source in request.files {
        let file_id = random_hex(12);
        let part_path = directory.join(format!("{file_id}.part"));
        response_files.push(json!({
            "clientFileId": source.client_file_id,
            "fileId": file_id,
            "expectedOffset": 0
        }));
        files.insert(
            file_id,
            UploadFile {
                client_file_id: source.client_file_id,
                name: source.name,
                size: source.size,
                expected_offset: 0,
                completed: false,
                part_path,
            },
        );
    }
    let date = Local::now().format("%Y%m%d").to_string();
    state.batches.lock().await.insert(
        batch_id.clone(),
        UploadBatch {
            date: date.clone(),
            directory,
            files,
        },
    );
    Ok(Json(json!({
        "batchId": batch_id,
        "date": date,
        "chunkSize": CHUNK_SIZE,
        "files": response_files
    })))
}

async fn upload_chunk(
    State(state): State<HttpState>,
    AxumPath((batch_id, file_id)): AxumPath<(String, String)>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult {
    authorize(&headers, &state.token_hash)?;
    if body.is_empty() || body.len() as u64 > CHUNK_SIZE {
        return Err(api_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "chunk_size_limit",
            "分片不能为空且不得超过 10 MiB",
        ));
    }
    let range = headers
        .get("content-range")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| {
            api_error(
                StatusCode::BAD_REQUEST,
                "missing_range",
                "缺少 Content-Range",
            )
        })?;
    let (start, end, total) = parse_content_range(range)
        .map_err(|message| api_error(StatusCode::BAD_REQUEST, "invalid_range", message))?;

    let mut batches = state.batches.lock().await;
    let batch = batches
        .get_mut(&batch_id)
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "batch_not_found", "上传批次不存在"))?;
    let file = batch
        .files
        .get_mut(&file_id)
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "file_not_found", "上传文件不存在"))?;
    if total != file.size || end.saturating_sub(start).saturating_add(1) != body.len() as u64 {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "range_mismatch",
            "分片范围与文件大小不匹配",
        ));
    }
    if start != file.expected_offset {
        return Err((
            StatusCode::CONFLICT,
            Json(json!({
                "code": "offset_mismatch",
                "message": "分片偏移不匹配",
                "expectedOffset": file.expected_offset
            })),
        ));
    }
    if end >= file.size {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "range_mismatch",
            "分片超出文件范围",
        ));
    }
    let mut target = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&file.part_path)
        .await
        .map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "open_failed",
                error.to_string(),
            )
        })?;
    target.write_all(&body).await.map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "write_failed",
            error.to_string(),
        )
    })?;
    target.flush().await.map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "flush_failed",
            error.to_string(),
        )
    })?;
    file.expected_offset += body.len() as u64;
    Ok(Json(json!({ "expectedOffset": file.expected_offset })))
}

async fn hash_file(path: &Path) -> Result<String, std::io::Error> {
    let mut file = fs::File::open(path).await?;
    let mut digest = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let count = file.read(&mut buffer).await?;
        if count == 0 {
            break;
        }
        digest.update(&buffer[..count]);
    }
    Ok(hex::encode(digest.finalize()))
}

async fn complete_file(
    State(state): State<HttpState>,
    AxumPath((batch_id, file_id)): AxumPath<(String, String)>,
    headers: HeaderMap,
    Json(request): Json<CompleteFileRequest>,
) -> ApiResult {
    authorize(&headers, &state.token_hash)?;
    if request.sha256.len() != 64 || !request.sha256.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(api_error(
            StatusCode::BAD_REQUEST,
            "invalid_hash",
            "SHA-256 格式无效",
        ));
    }
    let (path, size) = {
        let batches = state.batches.lock().await;
        let batch = batches
            .get(&batch_id)
            .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "batch_not_found", "上传批次不存在"))?;
        let file = batch
            .files
            .get(&file_id)
            .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "file_not_found", "上传文件不存在"))?;
        if file.expected_offset != file.size {
            return Err(api_error(
                StatusCode::CONFLICT,
                "file_incomplete",
                "文件尚未上传完整",
            ));
        }
        (file.part_path.clone(), file.size)
    };
    if size == 0 && !path.exists() {
        fs::write(&path, []).await.map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "write_failed",
                error.to_string(),
            )
        })?;
    }
    let actual_size = fs::metadata(&path)
        .await
        .map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "metadata_failed",
                error.to_string(),
            )
        })?
        .len();
    let actual_hash = hash_file(&path).await.map_err(|error| {
        api_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "hash_failed",
            error.to_string(),
        )
    })?;
    if actual_size != size || !actual_hash.eq_ignore_ascii_case(&request.sha256) {
        let _ = fs::remove_file(&path).await;
        if let Some(file) = state
            .batches
            .lock()
            .await
            .get_mut(&batch_id)
            .and_then(|batch| batch.files.get_mut(&file_id))
        {
            file.expected_offset = 0;
            file.completed = false;
        }
        return Err(api_error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "integrity_mismatch",
            "文件大小或 SHA-256 校验失败",
        ));
    }
    if let Some(file) = state
        .batches
        .lock()
        .await
        .get_mut(&batch_id)
        .and_then(|batch| batch.files.get_mut(&file_id))
    {
        file.completed = true;
    }
    Ok(Json(json!({ "completed": true })))
}

fn unique_destination(directory: &Path, name: &str, reserved: &HashSet<PathBuf>) -> PathBuf {
    let original = directory.join(name);
    if !original.exists() && !reserved.contains(&original) {
        return original;
    }
    let path = Path::new(name);
    let stem = path.file_stem().and_then(OsStr::to_str).unwrap_or("file");
    let extension = path.extension().and_then(OsStr::to_str);
    for index in 1_u32.. {
        let candidate_name = match extension {
            Some(extension) => format!("{stem} ({index}).{extension}"),
            None => format!("{stem} ({index})"),
        };
        let candidate = directory.join(candidate_name);
        if !candidate.exists() && !reserved.contains(&candidate) {
            return candidate;
        }
    }
    unreachable!()
}

async fn complete_batch(
    State(state): State<HttpState>,
    AxumPath(batch_id): AxumPath<String>,
    headers: HeaderMap,
) -> ApiResult {
    authorize(&headers, &state.token_hash)?;
    let mut batches = state.batches.lock().await;
    let batch = batches
        .get(&batch_id)
        .ok_or_else(|| api_error(StatusCode::NOT_FOUND, "batch_not_found", "上传批次不存在"))?;
    if batch.files.values().any(|file| !file.completed) {
        return Err(api_error(
            StatusCode::CONFLICT,
            "batch_incomplete",
            "批次中仍有未完成文件",
        ));
    }
    let target_directory = state.root.join(&batch.date);
    fs::create_dir_all(&target_directory)
        .await
        .map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "create_target_failed",
                error.to_string(),
            )
        })?;
    let mut reserved = HashSet::new();
    let mut moves = Vec::with_capacity(batch.files.len());
    for file in batch.files.values() {
        let destination = unique_destination(&target_directory, &file.name, &reserved);
        reserved.insert(destination.clone());
        moves.push((
            file.part_path.clone(),
            destination,
            file.client_file_id.clone(),
        ));
    }
    let batch_directory = batch.directory.clone();
    let date = batch.date.clone();
    let mut completed = Vec::with_capacity(moves.len());
    for (source, destination, client_file_id) in moves {
        fs::rename(&source, &destination).await.map_err(|error| {
            api_error(
                StatusCode::INTERNAL_SERVER_ERROR,
                "commit_failed",
                error.to_string(),
            )
        })?;
        completed.push(json!({
            "clientFileId": client_file_id,
            "name": destination.file_name().and_then(OsStr::to_str).unwrap_or(""),
            "path": destination.to_string_lossy()
        }));
    }
    batches.remove(&batch_id);
    drop(batches);
    let _ = fs::remove_dir_all(batch_directory).await;
    Ok(Json(
        json!({ "completed": true, "date": date, "files": completed }),
    ))
}

async fn delete_batch(
    State(state): State<HttpState>,
    AxumPath(batch_id): AxumPath<String>,
    headers: HeaderMap,
) -> ApiResult {
    authorize(&headers, &state.token_hash)?;
    let batch = state.batches.lock().await.remove(&batch_id);
    if let Some(batch) = batch {
        let _ = fs::remove_dir_all(batch.directory).await;
    }
    Ok(Json(json!({ "deleted": true })))
}

async fn cleanup_stale_temp(root: &Path) {
    let Ok(mut entries) = fs::read_dir(root).await else {
        return;
    };
    let now = SystemTime::now();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let Ok(metadata) = entry.metadata().await else {
            continue;
        };
        if !metadata.is_dir() {
            continue;
        }
        let stale = metadata
            .modified()
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .map(|age| age >= STALE_TEMP_AGE)
            .unwrap_or(false);
        if stale {
            let _ = fs::remove_dir_all(entry.path()).await;
        }
    }
}

#[tauri::command]
pub fn generate_file_receiver_token() -> Value {
    let token = random_hex(32);
    json!({ "token": token, "tokenHash": token_digest(&token) })
}

#[tauri::command]
pub async fn get_file_receiver_status(
    state: TauriState<'_, FileReceiverState>,
) -> Result<FileReceiverStatus, String> {
    Ok(state.runtime.lock().await.status.clone())
}

#[tauri::command]
pub async fn configure_file_receiver(
    state: TauriState<'_, FileReceiverState>,
    config: FileReceiverConfig,
) -> Result<FileReceiverStatus, String> {
    let (old_cancellation, old_task) = {
        let mut runtime = state.runtime.lock().await;
        (runtime.cancellation.take(), runtime.task.take())
    };
    if let Some(cancellation) = old_cancellation {
        cancellation.cancel();
    }
    if let Some(task) = old_task {
        let _ = task.await;
    }

    let directory = config.directory.trim().to_string();
    if !config.enabled {
        let status = FileReceiverStatus {
            running: false,
            bind_address: FILE_RECEIVER_BIND_ADDRESS.to_string(),
            port: config.port,
            directory,
            error: None,
        };
        state.runtime.lock().await.status = status.clone();
        return Ok(status);
    }
    if directory.is_empty() {
        return Err("文件接收目录不能为空".to_string());
    }
    if config.token_hash.len() != 64
        || !config
            .token_hash
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("请先生成文件接收令牌".to_string());
    }
    let root = PathBuf::from(&directory);
    fs::create_dir_all(&root)
        .await
        .map_err(|error| format!("创建文件接收目录失败: {error}"))?;
    let probe = root.join(format!(".windowagent-write-test-{}", random_hex(4)));
    fs::write(&probe, [])
        .await
        .map_err(|error| format!("文件接收目录不可写: {error}"))?;
    let _ = fs::remove_file(probe).await;
    let temp_root = root.join(".windowagent-upload");
    fs::create_dir_all(&temp_root)
        .await
        .map_err(|error| format!("创建上传临时目录失败: {error}"))?;
    cleanup_stale_temp(&temp_root).await;

    let listener = tokio::net::TcpListener::bind((FILE_RECEIVER_BIND_ADDRESS, config.port))
        .await
        .map_err(|error| format!("文件接收服务端口绑定失败: {error}"))?;
    let local = listener
        .local_addr()
        .map_err(|error| format!("读取文件接收监听地址失败: {error}"))?;
    let cancellation = CancellationToken::new();
    let shutdown = cancellation.clone();
    let http_state = HttpState {
        root,
        temp_root,
        token_hash: config.token_hash.to_ascii_lowercase(),
        batches: Arc::new(Mutex::new(HashMap::new())),
    };
    let router = Router::new()
        .route("/api/v1/file-receiver/health", get(health))
        .route("/api/v1/upload-batches", post(create_batch))
        .route(
            "/api/v1/upload-batches/{batch_id}",
            delete(delete_batch).post(complete_batch),
        )
        .route(
            "/api/v1/upload-batches/{batch_id}/files/{file_id}",
            put(upload_chunk),
        )
        .route(
            "/api/v1/upload-batches/{batch_id}/files/{file_id}/complete",
            post(complete_file),
        )
        .layer(DefaultBodyLimit::max(CHUNK_SIZE as usize + 1024))
        .with_state(http_state);
    let task = tokio::spawn(async move {
        let _ = axum::serve(listener, router)
            .with_graceful_shutdown(shutdown.cancelled_owned())
            .await;
    });
    let status = FileReceiverStatus {
        running: true,
        bind_address: local.ip().to_string(),
        port: local.port(),
        directory,
        error: None,
    };
    let mut runtime = state.runtime.lock().await;
    runtime.status = status.clone();
    runtime.cancellation = Some(cancellation);
    runtime.task = Some(task);
    Ok(status)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn validates_file_names_and_ids() {
        assert!(validate_file_name("测试数据.dat").is_ok());
        assert!(validate_file_name("../secret.txt").is_err());
        assert!(validate_file_name("CON.txt").is_err());
        assert!(validate_id("file_01-A"));
        assert!(!validate_id("../file"));
    }

    #[tokio::test]
    async fn binds_to_all_ipv4_interfaces() {
        let listener = tokio::net::TcpListener::bind((FILE_RECEIVER_BIND_ADDRESS, 0))
            .await
            .unwrap();
        let local = listener.local_addr().unwrap();

        assert!(local.ip().is_unspecified());
        assert!(local.is_ipv4());
    }

    #[test]
    fn parses_ranges() {
        assert_eq!(parse_content_range("bytes 0-9/100").unwrap(), (0, 9, 100));
        assert!(parse_content_range("0-9/100").is_err());
    }

    #[test]
    fn token_hash_is_stable() {
        assert_eq!(token_digest("secret"), token_digest("secret"));
        assert_ne!(token_digest("secret"), token_digest("other"));
    }

    fn authorized_headers(token: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            axum::http::header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        headers
    }

    #[tokio::test]
    async fn receives_and_commits_a_chunked_file_to_the_server_date_directory() {
        let root = std::env::temp_dir().join(format!("cosl-file-receiver-test-{}", random_hex(8)));
        let temp_root = root.join(".windowagent-upload");
        fs::create_dir_all(&temp_root).await.unwrap();
        let token = "test-token";
        let state = HttpState {
            root: root.clone(),
            temp_root,
            token_hash: token_digest(token),
            batches: Arc::new(Mutex::new(HashMap::new())),
        };
        let payload = b"hello window agent";
        let created = create_batch(
            State(state.clone()),
            authorized_headers(token),
            Json(CreateBatchRequest {
                files: vec![CreateFileRequest {
                    client_file_id: "file-1".to_string(),
                    name: "测试数据.dat".to_string(),
                    size: payload.len() as u64,
                }],
            }),
        )
        .await
        .unwrap()
        .0;
        let batch_id = created["batchId"].as_str().unwrap().to_string();
        let file_id = created["files"][0]["fileId"].as_str().unwrap().to_string();
        let date = created["date"].as_str().unwrap().to_string();
        let mut chunk_headers = authorized_headers(token);
        chunk_headers.insert(
            "content-range",
            HeaderValue::from_str(&format!("bytes 0-{}/{}", payload.len() - 1, payload.len()))
                .unwrap(),
        );
        let _ = upload_chunk(
            State(state.clone()),
            AxumPath((batch_id.clone(), file_id.clone())),
            chunk_headers,
            Bytes::copy_from_slice(payload),
        )
        .await
        .unwrap();
        let _ = complete_file(
            State(state.clone()),
            AxumPath((batch_id.clone(), file_id)),
            authorized_headers(token),
            Json(CompleteFileRequest {
                sha256: hex::encode(Sha256::digest(payload)),
            }),
        )
        .await
        .unwrap();
        let _ = complete_batch(State(state), AxumPath(batch_id), authorized_headers(token))
            .await
            .unwrap();
        assert_eq!(
            fs::read(root.join(date).join("测试数据.dat"))
                .await
                .unwrap(),
            payload
        );
        fs::remove_dir_all(root).await.unwrap();
    }

    #[tokio::test]
    async fn rejects_more_than_ten_files_and_files_over_one_gibibyte() {
        let token = "test-token";
        let state = HttpState {
            root: PathBuf::from("unused"),
            temp_root: PathBuf::from("unused"),
            token_hash: token_digest(token),
            batches: Arc::new(Mutex::new(HashMap::new())),
        };
        let files = (0..11)
            .map(|index| CreateFileRequest {
                client_file_id: format!("file-{index}"),
                name: format!("file-{index}.dat"),
                size: 1,
            })
            .collect();
        let too_many = create_batch(
            State(state.clone()),
            authorized_headers(token),
            Json(CreateBatchRequest { files }),
        )
        .await
        .unwrap_err();
        assert_eq!(too_many.0, StatusCode::PAYLOAD_TOO_LARGE);

        let too_large = create_batch(
            State(state),
            authorized_headers(token),
            Json(CreateBatchRequest {
                files: vec![CreateFileRequest {
                    client_file_id: "file-1".to_string(),
                    name: "large.dat".to_string(),
                    size: MAX_FILE_SIZE + 1,
                }],
            }),
        )
        .await
        .unwrap_err();
        assert_eq!(too_large.0, StatusCode::PAYLOAD_TOO_LARGE);
    }
}
