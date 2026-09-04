//! 模拟井监控 WebSocket 服务与采集会话。

use chrono::{Local, TimeZone};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::Write,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager, State};
use tokio::{
    sync::{mpsc, oneshot, Mutex},
    time::{timeout, Duration},
};
use tokio_tungstenite::{connect_async, tungstenite::Message};
use tokio_util::sync::CancellationToken;

const STATUS_EVENT: &str = "simulated-well-ws-status";
const SNAPSHOT_EVENT: &str = "simulated-well-monitor-snapshot";
const ERROR_EVENT: &str = "simulated-well-monitor-error";
static SESSION_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MetricStatus {
    Fresh,
    Stale,
    Unavailable,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum MonitorMessageType {
    SimulatedWindow,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EdibDevice {
    pub device: String,
    pub connected: Option<i8>,
    pub status: MetricStatus,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EdibSnapshot {
    pub status: MetricStatus,
    pub devices: Vec<EdibDevice>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServiceSnapshot {
    pub device: Option<String>,
    pub cdepth_m: Option<f64>,
    pub cdepth_status: MetricStatus,
    pub speed_m_per_min: Option<f64>,
    pub speed_status: MetricStatus,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MonitorMessage {
    #[serde(rename = "type")]
    pub message_type: MonitorMessageType,
    pub machine_id: String,
    pub timestamp_ms: i64,
    pub edib: EdibSnapshot,
    pub service: ServiceSnapshot,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "lowercase")]
enum AgentControlMessage {
    Start { session_id: String, work_no: String },
    Stop { session_id: String, work_no: String },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DepthPoint {
    timestamp_ms: i64,
    value: Option<f64>,
    status: MetricStatus,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommunicationDeviceState {
    device: String,
    connected: Option<i8>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CommunicationEvent {
    timestamp_ms: i64,
    depth: f64,
    device: String,
    connected: Option<i8>,
    depth_carried: bool,
    device_states: Vec<CommunicationDeviceState>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorWsStatus {
    status: String,
    connected: bool,
    target_url: Option<String>,
    machine_id: Option<String>,
    last_message_at: Option<i64>,
    session_id: Option<String>,
    work_no: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSnapshot {
    session_id: String,
    work_no: String,
    sample_count: u64,
    last_message_at: Option<i64>,
    latest: Option<MonitorMessage>,
    points: Vec<DepthPoint>,
    communication_events: Vec<CommunicationEvent>,
    schema_warning: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSessionInfo {
    session_id: String,
    work_no: String,
    csv_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorCsvFile {
    session_id: String,
    path: String,
    name: String,
    size: u64,
    sample_count: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorErrorEvent {
    message: String,
}

#[derive(Debug, Clone)]
struct DeviceColumn {
    source_name: String,
    header: String,
}

struct MonitorSession {
    id: String,
    work_no: String,
    csv_path: PathBuf,
    device_columns: Option<Vec<DeviceColumn>>,
    buffered: Vec<MonitorMessage>,
    writer: Option<csv::Writer<File>>,
    sample_count: u64,
    last_received_at: Option<i64>,
    latest: Option<MonitorMessage>,
    points: Vec<DepthPoint>,
    communication_events: Vec<CommunicationEvent>,
    device_states: HashMap<String, Option<i8>>,
    pending_unavailable: HashSet<String>,
    last_valid_depth: Option<f64>,
    last_curve_depth: Option<f64>,
    schema_warning: Option<String>,
}

impl MonitorSession {
    fn snapshot(&self) -> MonitorSnapshot {
        MonitorSnapshot {
            session_id: self.id.clone(),
            work_no: self.work_no.clone(),
            sample_count: self.sample_count,
            last_message_at: self.last_received_at,
            latest: self.latest.clone(),
            points: self.points.clone(),
            communication_events: self.communication_events.clone(),
            schema_warning: self.schema_warning.clone(),
        }
    }

    fn track_communication_events(
        &mut self,
        message: &MonitorMessage,
        columns: &[DeviceColumn],
        include_devices: bool,
    ) {
        let current_states: Vec<CommunicationDeviceState> = columns
            .iter()
            .map(|column| CommunicationDeviceState {
                device: column.source_name.clone(),
                connected: connected_for_column(message, column, include_devices),
            })
            .collect();
        let current_depth = message.service.cdepth_m.filter(|value| value.is_finite());
        if let Some(depth) = current_depth {
            self.last_valid_depth = Some(depth);
        }
        let Some(depth) = current_depth.or(self.last_valid_depth) else {
            for state in &current_states {
                let connected = state.connected;
                let previous = self.device_states.insert(state.device.clone(), connected);
                let became_unavailable =
                    connected.is_none() && previous.map(|value| value.is_some()).unwrap_or(true);
                if became_unavailable {
                    self.pending_unavailable.insert(state.device.clone());
                } else if connected.is_some() {
                    self.pending_unavailable.remove(&state.device);
                }
            }
            return;
        };
        let depth_carried = current_depth.is_none();

        for state in &current_states {
            let connected = state.connected;
            let pending_unavailable =
                connected.is_none() && self.pending_unavailable.remove(&state.device);
            match self.device_states.get(&state.device) {
                None => {
                    self.device_states.insert(state.device.clone(), connected);
                    if connected.is_none() || pending_unavailable {
                        self.communication_events.push(CommunicationEvent {
                            timestamp_ms: message.timestamp_ms,
                            depth,
                            device: state.device.clone(),
                            connected,
                            depth_carried,
                            device_states: current_states.clone(),
                        });
                    }
                }
                Some(previous) if *previous != connected => {
                    self.device_states.insert(state.device.clone(), connected);
                    self.communication_events.push(CommunicationEvent {
                        timestamp_ms: message.timestamp_ms,
                        depth,
                        device: state.device.clone(),
                        connected,
                        depth_carried,
                        device_states: current_states.clone(),
                    });
                }
                Some(_) if pending_unavailable => {
                    self.communication_events.push(CommunicationEvent {
                        timestamp_ms: message.timestamp_ms,
                        depth,
                        device: state.device.clone(),
                        connected,
                        depth_carried,
                        device_states: current_states.clone(),
                    });
                }
                Some(_) => {}
            }
            if connected.is_some() {
                self.pending_unavailable.remove(&state.device);
            }
        }
    }

    fn ensure_writer(&mut self, devices: &[EdibDevice]) -> Result<(), String> {
        if self.writer.is_some() || devices.is_empty() {
            return Ok(());
        }
        let columns = build_device_columns(devices);
        let mut writer = create_csv_writer(&self.csv_path, &columns)?;
        let buffered = std::mem::take(&mut self.buffered);
        for message in buffered {
            self.track_communication_events(&message, &columns, false);
            let record = csv_record(&message, &columns, false);
            writer
                .write_record(record)
                .map_err(|error| format!("补写监控 CSV 失败: {error}"))?;
        }
        writer
            .flush()
            .map_err(|error| format!("刷新监控 CSV 失败: {error}"))?;
        self.device_columns = Some(columns);
        self.writer = Some(writer);
        Ok(())
    }

    fn append(&mut self, message: MonitorMessage, received_at: i64) -> Result<(), String> {
        self.sample_count += 1;
        self.last_received_at = Some(received_at);
        let current_depth = message.service.cdepth_m.filter(|value| value.is_finite());
        if let Some(depth) = current_depth {
            self.last_curve_depth = Some(depth);
        }
        self.points.push(DepthPoint {
            timestamp_ms: message.timestamp_ms,
            value: current_depth.or(self.last_curve_depth),
            status: message.service.cdepth_status.clone(),
        });

        self.ensure_writer(&message.edib.devices)?;
        if let Some(columns) = self.device_columns.clone() {
            let incoming: Vec<&str> = message
                .edib
                .devices
                .iter()
                .map(|item| item.device.as_str())
                .collect();
            let expected: Vec<&str> = columns
                .iter()
                .map(|item| item.source_name.as_str())
                .collect();
            if !incoming.is_empty() && incoming != expected {
                self.schema_warning = Some("EDIB 设备列表与会话初始列表不一致".to_string());
            }
            self.track_communication_events(&message, &columns, true);
            let writer = self
                .writer
                .as_mut()
                .expect("设备列锁定后 CSV Writer 必须存在");
            writer
                .write_record(csv_record(&message, &columns, true))
                .map_err(|error| format!("写入监控 CSV 失败: {error}"))?;
            writer
                .flush()
                .map_err(|error| format!("刷新监控 CSV 失败: {error}"))?;
        } else {
            self.buffered.push(message.clone());
        }
        self.latest = Some(message);
        Ok(())
    }

    fn finish(&mut self) -> Result<(), String> {
        if self.writer.is_none() {
            let columns = Vec::new();
            let mut writer = create_csv_writer(&self.csv_path, &columns)?;
            for message in self.buffered.drain(..) {
                writer
                    .write_record(csv_record(&message, &columns, false))
                    .map_err(|error| format!("写入监控 CSV 失败: {error}"))?;
            }
            writer
                .flush()
                .map_err(|error| format!("刷新监控 CSV 失败: {error}"))?;
            self.writer = Some(writer);
        }
        if let Some(mut writer) = self.writer.take() {
            writer
                .flush()
                .map_err(|error| format!("关闭监控 CSV 失败: {error}"))?;
        }
        Ok(())
    }
}

struct MonitorInner {
    server_status: String,
    client_connected: bool,
    connection_id: u64,
    outbound: Option<mpsc::UnboundedSender<OutboundCommand>>,
    target_url: Option<String>,
    machine_id: Option<String>,
    last_message_at: Option<i64>,
    error: Option<String>,
    active_session: Option<MonitorSession>,
    completed: HashMap<String, MonitorCsvFile>,
}

enum OutboundCommand {
    Text(String, oneshot::Sender<Result<(), String>>),
    Close(oneshot::Sender<()>),
}

#[derive(Clone)]
pub struct SimulatedWellMonitorState {
    inner: Arc<Mutex<MonitorInner>>,
    shutdown: CancellationToken,
}

impl Default for SimulatedWellMonitorState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(MonitorInner {
                server_status: "disconnected".to_string(),
                client_connected: false,
                connection_id: 0,
                outbound: None,
                target_url: None,
                machine_id: None,
                last_message_at: None,
                error: None,
                active_session: None,
                completed: HashMap::new(),
            })),
            shutdown: CancellationToken::new(),
        }
    }
}

impl SimulatedWellMonitorState {
    pub fn shutdown_now(&self) {
        self.shutdown.cancel();
        // 应用退出事件是同步回调；若当前没有并发写入，立即刷新并释放 CSV 句柄。
        // 若正在处理最后一条消息，进程退出时 Writer 的 Drop 仍会关闭底层文件。
        if let Ok(mut inner) = self.inner.try_lock() {
            if let Some(session) = inner.active_session.as_mut() {
                let _ = session.finish();
            }
        }
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn safe_segment(value: &str) -> String {
    let normalized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                ch
            } else {
                '_'
            }
        })
        .collect();
    let trimmed = normalized.trim_matches(['.', '_']);
    if trimmed.is_empty() {
        "work".to_string()
    } else {
        trimmed.to_string()
    }
}

fn build_device_columns(devices: &[EdibDevice]) -> Vec<DeviceColumn> {
    let mut used = HashSet::new();
    devices
        .iter()
        .enumerate()
        .map(|(index, device)| {
            let base = if device.device.trim().is_empty() {
                format!("device_{}", index + 1)
            } else {
                device.device.trim().to_string()
            };
            let mut header = base.clone();
            let mut suffix = 2;
            while !used.insert(header.clone()) {
                header = format!("{base}_{suffix}");
                suffix += 1;
            }
            DeviceColumn {
                source_name: device.device.clone(),
                header,
            }
        })
        .collect()
}

fn format_timestamp(timestamp_ms: i64) -> String {
    Local
        .timestamp_millis_opt(timestamp_ms)
        .single()
        .map(|value| value.format("%Y-%m-%d %H:%M:%S%.3f").to_string())
        .unwrap_or_else(|| timestamp_ms.to_string())
}

fn number_cell(value: Option<f64>) -> String {
    value.map(|number| number.to_string()).unwrap_or_default()
}

fn csv_record(
    message: &MonitorMessage,
    columns: &[DeviceColumn],
    include_devices: bool,
) -> Vec<String> {
    let mut record = vec![
        format_timestamp(message.timestamp_ms),
        number_cell(message.service.cdepth_m),
        number_cell(message.service.speed_m_per_min),
    ];
    for column in columns {
        let value = if include_devices {
            message
                .edib
                .devices
                .iter()
                .find(|item| item.device == column.source_name)
                .and_then(|item| item.connected)
                .map(|item| item.to_string())
                .unwrap_or_default()
        } else {
            String::new()
        };
        record.push(value);
    }
    record
}

fn connected_for_column(
    message: &MonitorMessage,
    column: &DeviceColumn,
    include_devices: bool,
) -> Option<i8> {
    if !include_devices {
        return None;
    }
    message
        .edib
        .devices
        .iter()
        .find(|item| item.device == column.source_name)
        .and_then(|item| item.connected)
}

fn create_csv_writer(path: &Path, columns: &[DeviceColumn]) -> Result<csv::Writer<File>, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建监控数据目录失败: {error}"))?;
    }
    let mut file = File::create(path).map_err(|error| format!("创建监控 CSV 失败: {error}"))?;
    file.write_all(&[0xEF, 0xBB, 0xBF])
        .map_err(|error| format!("写入监控 CSV 编码标记失败: {error}"))?;
    let mut writer = csv::WriterBuilder::new()
        .has_headers(false)
        .from_writer(file);
    let mut header = vec![
        "time".to_string(),
        "cdepth_m".to_string(),
        "speed_m_per_min".to_string(),
    ];
    header.extend(columns.iter().map(|column| column.header.clone()));
    writer
        .write_record(header)
        .map_err(|error| format!("写入监控 CSV 表头失败: {error}"))?;
    writer
        .flush()
        .map_err(|error| format!("刷新监控 CSV 表头失败: {error}"))?;
    Ok(writer)
}

fn validate_message(message: &MonitorMessage) -> Result<(), String> {
    if message.machine_id.trim().is_empty() {
        return Err("machine_id 不能为空".to_string());
    }
    if message.timestamp_ms <= 0 {
        return Err("timestamp_ms 必须为正整数".to_string());
    }
    for device in &message.edib.devices {
        if device.device.trim().is_empty() {
            return Err("edib.devices.device 不能为空".to_string());
        }
        if !matches!(device.connected, None | Some(0) | Some(1)) {
            return Err(format!(
                "设备 {} 的 connected 只能为 0、1 或 null",
                device.device
            ));
        }
    }
    Ok(())
}

async fn status_snapshot(state: &SimulatedWellMonitorState) -> MonitorWsStatus {
    let inner = state.inner.lock().await;
    let (session_id, work_no) = inner
        .active_session
        .as_ref()
        .map(|session| (Some(session.id.clone()), Some(session.work_no.clone())))
        .unwrap_or((None, None));
    MonitorWsStatus {
        status: inner.server_status.clone(),
        connected: inner.client_connected,
        target_url: inner.target_url.clone(),
        machine_id: inner.machine_id.clone(),
        last_message_at: inner.last_message_at,
        session_id,
        work_no,
        error: inner.error.clone(),
    }
}

async fn emit_status(app: &AppHandle, state: &SimulatedWellMonitorState) {
    let _ = app.emit(STATUS_EVENT, status_snapshot(state).await);
}

async fn report_protocol_error(app: &AppHandle, message: String) {
    let _ = app.emit(ERROR_EVENT, MonitorErrorEvent { message });
}

fn serialize_control_message(message: &AgentControlMessage) -> Result<String, String> {
    serde_json::to_string(message)
        .map_err(|error| format!("序列化 WindowAgent 控制消息失败: {error}"))
}

async fn send_control_message(
    sender: &mpsc::UnboundedSender<OutboundCommand>,
    message: &AgentControlMessage,
) -> Result<(), String> {
    let text = serialize_control_message(message)?;
    let (ack_tx, ack_rx) = oneshot::channel();
    sender
        .send(OutboundCommand::Text(text, ack_tx))
        .map_err(|_| "WindowAgent WebSocket 发送通道已关闭".to_string())?;
    timeout(Duration::from_secs(2), ack_rx)
        .await
        .map_err(|_| "发送 WindowAgent 控制消息超时".to_string())?
        .map_err(|_| "WindowAgent WebSocket 发送任务已关闭".to_string())?
}

async fn process_text(app: &AppHandle, state: &SimulatedWellMonitorState, text: &str) {
    let message: MonitorMessage = match serde_json::from_str(text) {
        Ok(value) => value,
        Err(error) => {
            report_protocol_error(app, format!("监控消息 JSON 无效: {error}")).await;
            return;
        }
    };
    if let Err(error) = validate_message(&message) {
        report_protocol_error(app, error).await;
        return;
    }

    let received_at = now_millis();
    let mut snapshot = None;
    let mut append_error = None;
    {
        let mut inner = state.inner.lock().await;
        inner.machine_id = Some(message.machine_id.clone());
        inner.last_message_at = Some(received_at);
        if let Some(session) = inner.active_session.as_mut() {
            if let Err(error) = session.append(message, received_at) {
                append_error = Some(error);
            } else {
                snapshot = Some(session.snapshot());
            }
        }
    }
    if let Some(error) = append_error {
        report_protocol_error(app, error).await;
    }
    if let Some(snapshot) = snapshot {
        let _ = app.emit(SNAPSHOT_EVENT, snapshot);
    } else {
        emit_status(app, state).await;
    }
}

async fn run_client(
    app: AppHandle,
    state: SimulatedWellMonitorState,
    connection_id: u64,
    mut websocket: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    mut outbound_rx: mpsc::UnboundedReceiver<OutboundCommand>,
) {
    let mut connection_error = None;
    loop {
        tokio::select! {
            _ = state.shutdown.cancelled() => {
                let _ = websocket.close(None).await;
                break;
            }
            outgoing = outbound_rx.recv() => match outgoing {
                Some(OutboundCommand::Text(text, ack)) => {
                    match websocket.send(Message::Text(text.into())).await {
                        Ok(()) => { let _ = ack.send(Ok(())); }
                        Err(error) => {
                            let message = format!("发送 WindowAgent 消息失败: {error}");
                            let _ = ack.send(Err(message.clone()));
                            connection_error = Some(message);
                            break;
                        }
                    }
                }
                Some(OutboundCommand::Close(ack)) => {
                    let _ = websocket.close(None).await;
                    let _ = ack.send(());
                    break;
                }
                None => break,
            },
            incoming = websocket.next() => match incoming {
                Some(Ok(Message::Text(text))) => process_text(&app, &state, text.as_str()).await,
                Some(Ok(Message::Ping(payload))) => {
                    if let Err(error) = websocket.send(Message::Pong(payload)).await {
                        connection_error = Some(format!("回复 WindowAgent Ping 失败: {error}"));
                        break;
                    }
                }
                Some(Ok(Message::Close(_))) | None => break,
                Some(Ok(Message::Binary(_))) => {
                    report_protocol_error(&app, "仅支持 UTF-8 JSON 文本消息".to_string()).await;
                }
                Some(Ok(_)) => {}
                Some(Err(error)) => {
                    connection_error = Some(format!("WebSocket 连接异常: {error}"));
                    break;
                }
            }
        }
    }

    let mut should_emit = false;
    {
        let mut inner = state.inner.lock().await;
        if inner.connection_id == connection_id {
            inner.client_connected = false;
            inner.outbound = None;
            inner.server_status = if connection_error.is_some() {
                "error"
            } else {
                "disconnected"
            }
            .to_string();
            inner.error = connection_error.clone();
            should_emit = true;
        }
    }
    if let Some(error) = connection_error {
        report_protocol_error(&app, error).await;
    }
    if should_emit {
        emit_status(&app, &state).await;
    }
}

#[tauri::command]
pub async fn connect_simulated_well_monitor(
    app: AppHandle,
    state: State<'_, SimulatedWellMonitorState>,
    target_url: String,
) -> Result<MonitorWsStatus, String> {
    let target_url = target_url.trim().to_string();
    if !target_url.starts_with("ws://") || target_url.contains(['\r', '\n']) {
        return Err("地址必须是有效的 ws:// URL".to_string());
    }
    let (connection_id, start_message) = {
        let mut inner = state.inner.lock().await;
        if matches!(inner.server_status.as_str(), "connecting" | "connected") {
            drop(inner);
            return Ok(status_snapshot(state.inner()).await);
        }
        let session = inner
            .active_session
            .as_ref()
            .ok_or_else(|| "当前没有采集会话".to_string())?;
        let start = AgentControlMessage::Start {
            session_id: session.id.clone(),
            work_no: session.work_no.clone(),
        };
        inner.connection_id = inner.connection_id.wrapping_add(1);
        inner.server_status = "connecting".to_string();
        inner.target_url = Some(target_url.clone());
        inner.error = None;
        (inner.connection_id, start)
    };
    emit_status(&app, state.inner()).await;

    let connected = timeout(Duration::from_secs(5), connect_async(target_url.as_str())).await;
    let (mut websocket, _) = match connected {
        Ok(Ok(value)) => value,
        Ok(Err(error)) => {
            let message = format!("连接失败: {error}");
            let mut inner = state.inner.lock().await;
            if inner.connection_id == connection_id {
                inner.server_status = "error".to_string();
                inner.error = Some(message.clone());
            }
            drop(inner);
            emit_status(&app, state.inner()).await;
            return Err(message);
        }
        Err(_) => {
            let message = "连接超时".to_string();
            let mut inner = state.inner.lock().await;
            if inner.connection_id == connection_id {
                inner.server_status = "error".to_string();
                inner.error = Some(message.clone());
            }
            drop(inner);
            emit_status(&app, state.inner()).await;
            return Err(message);
        }
    };

    let start_text = serialize_control_message(&start_message)?;
    if let Err(error) = websocket.send(Message::Text(start_text.into())).await {
        let message = format!("发送 start 消息失败: {error}");
        let mut inner = state.inner.lock().await;
        if inner.connection_id == connection_id {
            inner.server_status = "error".to_string();
            inner.error = Some(message.clone());
        }
        drop(inner);
        let _ = websocket.close(None).await;
        emit_status(&app, state.inner()).await;
        return Err(message);
    }
    let (outbound_tx, outbound_rx) = mpsc::unbounded_channel();
    {
        let mut inner = state.inner.lock().await;
        if inner.connection_id != connection_id || inner.active_session.is_none() {
            drop(inner);
            let _ = websocket.close(None).await;
            return Err("采集会话已结束".to_string());
        }
        inner.client_connected = true;
        inner.outbound = Some(outbound_tx);
        inner.server_status = "connected".to_string();
        inner.error = None;
    }
    emit_status(&app, state.inner()).await;
    tauri::async_runtime::spawn(run_client(
        app,
        state.inner().clone(),
        connection_id,
        websocket,
        outbound_rx,
    ));
    Ok(status_snapshot(state.inner()).await)
}

#[tauri::command]
pub async fn get_simulated_well_ws_status(
    state: State<'_, SimulatedWellMonitorState>,
) -> Result<MonitorWsStatus, String> {
    Ok(status_snapshot(state.inner()).await)
}

#[tauri::command]
pub async fn start_simulated_well_monitor_session(
    app: AppHandle,
    state: State<'_, SimulatedWellMonitorState>,
    work_no: String,
) -> Result<MonitorSessionInfo, String> {
    let work_no = work_no.trim().to_string();
    if work_no.is_empty() {
        return Err("下井作业号不能为空".to_string());
    }
    let mut inner = state.inner.lock().await;
    if inner.active_session.is_some() {
        return Err("已有模拟井监控采集会话正在进行".to_string());
    }
    let session_id = format!(
        "{}-{}",
        now_millis(),
        SESSION_COUNTER.fetch_add(1, Ordering::Relaxed)
    );
    let base = app
        .path()
        .resolve("simulated-well-monitor", BaseDirectory::AppData)
        .map_err(|error| format!("解析监控数据目录失败: {error}"))?;
    let csv_path = base
        .join(safe_segment(&work_no))
        .join(&session_id)
        .join("monitor.csv");
    inner.active_session = Some(MonitorSession {
        id: session_id.clone(),
        work_no: work_no.clone(),
        csv_path: csv_path.clone(),
        device_columns: None,
        buffered: Vec::new(),
        writer: None,
        sample_count: 0,
        last_received_at: None,
        latest: None,
        points: Vec::new(),
        communication_events: Vec::new(),
        device_states: HashMap::new(),
        pending_unavailable: HashSet::new(),
        last_valid_depth: None,
        last_curve_depth: None,
        schema_warning: None,
    });
    inner.server_status = "disconnected".to_string();
    inner.last_message_at = None;
    inner.error = None;
    drop(inner);
    emit_status(&app, state.inner()).await;
    Ok(MonitorSessionInfo {
        session_id,
        work_no,
        csv_path: csv_path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub async fn get_simulated_well_monitor_snapshot(
    state: State<'_, SimulatedWellMonitorState>,
    session_id: String,
) -> Result<MonitorSnapshot, String> {
    let inner = state.inner.lock().await;
    let session = inner
        .active_session
        .as_ref()
        .ok_or_else(|| "当前没有采集会话".to_string())?;
    if session.id != session_id {
        return Err("采集会话不匹配".to_string());
    }
    Ok(session.snapshot())
}

#[tauri::command]
pub async fn stop_simulated_well_monitor_session(
    app: AppHandle,
    state: State<'_, SimulatedWellMonitorState>,
    session_id: String,
) -> Result<MonitorCsvFile, String> {
    let (mut session, outbound) = {
        let mut inner = state.inner.lock().await;
        let session = inner
            .active_session
            .take()
            .ok_or_else(|| "当前没有采集会话".to_string())?;
        if session.id != session_id {
            inner.active_session = Some(session);
            return Err("采集会话不匹配".to_string());
        }
        (session, inner.outbound.clone())
    };
    let control_message = AgentControlMessage::Stop {
        session_id: session.id.clone(),
        work_no: session.work_no.clone(),
    };
    if let Some(sender) = outbound.as_ref() {
        if let Err(error) = send_control_message(sender, &control_message).await {
            report_protocol_error(&app, error).await;
        }
        let (ack_tx, ack_rx) = oneshot::channel();
        if sender.send(OutboundCommand::Close(ack_tx)).is_ok() {
            let _ = timeout(Duration::from_secs(2), ack_rx).await;
        }
    }
    if let Err(error) = session.finish() {
        let mut inner = state.inner.lock().await;
        inner.active_session = Some(session);
        return Err(error);
    }
    let metadata = fs::metadata(&session.csv_path)
        .map_err(|error| format!("读取监控 CSV 信息失败: {error}"))?;
    let file = MonitorCsvFile {
        session_id: session.id.clone(),
        path: session.csv_path.to_string_lossy().to_string(),
        name: session
            .csv_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("monitor.csv")
            .to_string(),
        size: metadata.len(),
        sample_count: session.sample_count,
    };
    let mut inner = state.inner.lock().await;
    inner.completed.insert(session.id, file.clone());
    inner.connection_id = inner.connection_id.wrapping_add(1);
    inner.client_connected = false;
    inner.outbound = None;
    inner.server_status = "disconnected".to_string();
    inner.error = None;
    drop(inner);
    emit_status(&app, state.inner()).await;
    Ok(file)
}

#[tauri::command]
pub async fn get_simulated_well_monitor_file(
    state: State<'_, SimulatedWellMonitorState>,
    session_id: String,
) -> Result<MonitorCsvFile, String> {
    let inner = state.inner.lock().await;
    let file = inner
        .completed
        .get(&session_id)
        .cloned()
        .ok_or_else(|| "未找到已完成的监控 CSV".to_string())?;
    if !Path::new(&file.path).is_file() {
        return Err("监控 CSV 已不存在".to_string());
    }
    Ok(file)
}

fn remove_empty_directory(path: Option<&Path>) {
    let Some(path) = path else {
        return;
    };
    let is_empty = fs::read_dir(path)
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(false);
    if is_empty {
        let _ = fs::remove_dir(path);
    }
}

fn delete_monitor_csv_file(file: &MonitorCsvFile) -> Result<(), String> {
    let path = Path::new(&file.path);
    if !path.is_file() {
        return Err("监控 CSV 已不存在".to_string());
    }
    fs::remove_file(path).map_err(|error| format!("删除监控 CSV 失败: {error}"))?;

    let session_directory = path.parent();
    let work_directory = session_directory.and_then(Path::parent);
    remove_empty_directory(session_directory);
    remove_empty_directory(work_directory);
    Ok(())
}

#[tauri::command]
pub async fn delete_simulated_well_monitor_file(
    state: State<'_, SimulatedWellMonitorState>,
    session_id: String,
) -> Result<bool, String> {
    // 仅使用采集状态中登记的路径，禁止前端传入任意本地文件路径。
    let file = {
        let inner = state.inner.lock().await;
        inner
            .completed
            .get(&session_id)
            .cloned()
            .ok_or_else(|| "未找到已完成的监控 CSV".to_string())?
    };

    delete_monitor_csv_file(&file)?;

    let mut inner = state.inner.lock().await;
    if inner
        .completed
        .get(&session_id)
        .map(|current| current.path == file.path)
        .unwrap_or(false)
    {
        inner.completed.remove(&session_id);
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_message() -> MonitorMessage {
        serde_json::from_str(
            r#"{
              "type":"simulated-window",
              "machine_id":"WIN-PC-001",
              "timestamp_ms":1788192000123,
              "edib":{"status":"fresh","devices":[
                {"device":"RTT61X M2","connected":1,"status":"fresh"},
                {"device":"DST61X M2","connected":0,"status":"fresh"},
                {"device":"ORT71X M2","connected":null,"status":"unavailable"}
              ]},
              "service":{"device":"3ds2","cdepth_m":1523.46,"cdepth_status":"fresh","speed_m_per_min":12.5,"speed_status":"fresh"}
            }"#,
        )
        .unwrap()
    }

    #[test]
    fn parses_final_protocol_and_validates_connected_values() {
        let message = sample_message();
        assert_eq!(message.edib.devices.len(), 3);
        assert!(validate_message(&message).is_ok());
        let mut invalid = message.clone();
        invalid.edib.devices[0].connected = Some(2);
        assert!(validate_message(&invalid).is_err());
    }

    #[test]
    fn window_message_requires_the_exact_type() {
        let value = serde_json::to_value(sample_message()).unwrap();
        let mut missing = value.clone();
        missing.as_object_mut().unwrap().remove("type");
        assert!(serde_json::from_value::<MonitorMessage>(missing).is_err());

        let mut invalid = value;
        invalid["type"] = serde_json::Value::String("window".to_string());
        assert!(serde_json::from_value::<MonitorMessage>(invalid).is_err());
    }

    #[test]
    fn control_messages_use_the_public_wire_shape() {
        let start = AgentControlMessage::Start {
            session_id: "session-1".to_string(),
            work_no: "WORK-1".to_string(),
        };
        let stop = AgentControlMessage::Stop {
            session_id: "session-1".to_string(),
            work_no: "WORK-1".to_string(),
        };
        assert_eq!(
            serialize_control_message(&start).unwrap(),
            r#"{"type":"start","session_id":"session-1","work_no":"WORK-1"}"#
        );
        assert_eq!(
            serialize_control_message(&stop).unwrap(),
            r#"{"type":"stop","session_id":"session-1","work_no":"WORK-1"}"#
        );
    }

    #[test]
    fn csv_record_uses_locked_device_columns() {
        let message = sample_message();
        let columns = build_device_columns(&message.edib.devices);
        let record = csv_record(&message, &columns, true);
        assert_eq!(&record[1..3], &["1523.46", "12.5"]);
        assert_eq!(&record[3..], &["1", "0", ""]);
    }

    #[test]
    fn unavailable_service_values_stay_empty() {
        let mut message = sample_message();
        message.service.cdepth_m = None;
        message.service.speed_m_per_min = None;
        let record = csv_record(&message, &[], false);
        assert_eq!(&record[1..], &["", ""]);
    }

    fn event_test_session() -> MonitorSession {
        MonitorSession {
            id: "event-test".to_string(),
            work_no: "TEST-EVENT".to_string(),
            csv_path: std::env::temp_dir().join("unused-monitor-event-test.csv"),
            device_columns: None,
            buffered: Vec::new(),
            writer: None,
            sample_count: 0,
            last_received_at: None,
            latest: None,
            points: Vec::new(),
            communication_events: Vec::new(),
            device_states: HashMap::new(),
            pending_unavailable: HashSet::new(),
            last_valid_depth: None,
            last_curve_depth: None,
            schema_warning: None,
        }
    }

    #[test]
    fn communication_events_record_transitions_and_carry_depth() {
        let first = sample_message();
        let columns = build_device_columns(&first.edib.devices);
        let mut session = event_test_session();
        session.track_communication_events(&first, &columns, true);

        assert_eq!(session.communication_events.len(), 1);
        assert_eq!(session.communication_events[0].device, "ORT71X M2");
        assert_eq!(session.communication_events[0].connected, None);
        assert_eq!(
            session.communication_events[0].device_states,
            vec![
                CommunicationDeviceState {
                    device: "RTT61X M2".to_string(),
                    connected: Some(1),
                },
                CommunicationDeviceState {
                    device: "DST61X M2".to_string(),
                    connected: Some(0),
                },
                CommunicationDeviceState {
                    device: "ORT71X M2".to_string(),
                    connected: None,
                },
            ]
        );

        let mut changed = first.clone();
        changed.timestamp_ms += 1_000;
        changed.edib.devices[0].connected = Some(0);
        changed.edib.devices[1].connected = Some(1);
        session.track_communication_events(&changed, &columns, true);
        assert_eq!(session.communication_events.len(), 3);
        assert_eq!(session.communication_events[1].connected, Some(0));
        assert_eq!(session.communication_events[2].connected, Some(1));
        assert_eq!(
            session.communication_events[1].device_states,
            session.communication_events[2].device_states
        );
        assert_eq!(
            session.communication_events[1].device_states[0].connected,
            Some(0)
        );
        assert_eq!(
            session.communication_events[1].device_states[1].connected,
            Some(1)
        );

        let mut recovered = changed.clone();
        recovered.timestamp_ms += 1_000;
        recovered.service.cdepth_m = None;
        recovered.edib.devices[2].connected = Some(1);
        session.track_communication_events(&recovered, &columns, true);
        session.track_communication_events(&recovered, &columns, true);

        assert_eq!(session.communication_events.len(), 4);
        let event = session.communication_events.last().unwrap();
        assert_eq!(event.device, "ORT71X M2");
        assert_eq!(event.connected, Some(1));
        assert_eq!(event.depth, 1523.46);
        assert!(event.depth_carried);
        assert_eq!(event.device_states[2].connected, Some(1));
    }

    #[test]
    fn unavailable_event_waits_for_the_next_valid_depth() {
        let mut message = sample_message();
        message.service.cdepth_m = None;
        message.edib.devices[0].connected = None;
        let columns = build_device_columns(&message.edib.devices);
        let mut session = event_test_session();
        session.track_communication_events(&message, &columns, true);
        assert!(session.communication_events.is_empty());

        let mut with_depth = message.clone();
        with_depth.timestamp_ms += 1_000;
        with_depth.service.cdepth_m = Some(88.5);
        session.track_communication_events(&with_depth, &columns, true);

        assert_eq!(session.communication_events.len(), 2);
        let event = session
            .communication_events
            .iter()
            .find(|event| event.device == "RTT61X M2")
            .unwrap();
        assert_eq!(event.connected, None);
        assert_eq!(event.depth, 88.5);
        assert_eq!(event.timestamp_ms, with_depth.timestamp_ms);
        assert!(!event.depth_carried);
    }

    #[test]
    fn csv_locks_header_and_backfills_earlier_samples() {
        let directory = std::env::temp_dir().join(format!(
            "cosl-monitor-test-{}-{}",
            std::process::id(),
            SESSION_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let csv_path = directory.join("monitor.csv");
        let mut session = MonitorSession {
            id: "test-session".to_string(),
            work_no: "TEST-001".to_string(),
            csv_path: csv_path.clone(),
            device_columns: None,
            buffered: Vec::new(),
            writer: None,
            sample_count: 0,
            last_received_at: None,
            latest: None,
            points: Vec::new(),
            communication_events: Vec::new(),
            device_states: HashMap::new(),
            pending_unavailable: HashSet::new(),
            last_valid_depth: None,
            last_curve_depth: None,
            schema_warning: None,
        };

        let mut before_lock = sample_message();
        before_lock.edib.devices.clear();
        session.append(before_lock, now_millis()).unwrap();
        session.append(sample_message(), now_millis()).unwrap();
        let mut missing_depth = sample_message();
        missing_depth.timestamp_ms += 1_000;
        missing_depth.service.cdepth_m = None;
        session.append(missing_depth, now_millis()).unwrap();
        session.finish().unwrap();

        assert_eq!(session.points.len(), 3);
        assert_eq!(session.points[2].value, Some(1523.46));
        assert_eq!(session.points[2].status, MetricStatus::Fresh);

        let bytes = fs::read(&csv_path).unwrap();
        assert!(bytes.starts_with(&[0xef, 0xbb, 0xbf]));
        let content = String::from_utf8(bytes[3..].to_vec()).unwrap();
        let rows: Vec<&str> = content.lines().collect();
        assert_eq!(rows.len(), 4);
        assert_eq!(
            rows[0],
            "time,cdepth_m,speed_m_per_min,RTT61X M2,DST61X M2,ORT71X M2"
        );
        assert!(rows[1].ends_with(",,,"));
        assert!(rows[2].ends_with(",1,0,"));
        assert_eq!(rows[3].split(',').nth(1), Some(""));
        assert_eq!(session.communication_events.len(), 5);

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn deletes_registered_monitor_csv_and_empty_directories() {
        let root = std::env::temp_dir().join(format!(
            "cosl-monitor-cleanup-test-{}-{}",
            std::process::id(),
            SESSION_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let work_directory = root.join("WORK-001");
        let session_directory = work_directory.join("session-001");
        let csv_path = session_directory.join("monitor.csv");
        fs::create_dir_all(&session_directory).unwrap();
        fs::write(&csv_path, b"time,cdepth_m\n").unwrap();
        let file = MonitorCsvFile {
            session_id: "session-001".to_string(),
            path: csv_path.to_string_lossy().to_string(),
            name: "monitor.csv".to_string(),
            size: fs::metadata(&csv_path).unwrap().len(),
            sample_count: 1,
        };

        delete_monitor_csv_file(&file).unwrap();

        assert!(!csv_path.exists());
        assert!(!session_directory.exists());
        assert!(!work_directory.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn missing_monitor_csv_returns_error_without_removing_directories() {
        let root = std::env::temp_dir().join(format!(
            "cosl-monitor-cleanup-missing-test-{}-{}",
            std::process::id(),
            SESSION_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let session_directory = root.join("WORK-001").join("session-001");
        fs::create_dir_all(&session_directory).unwrap();
        let file = MonitorCsvFile {
            session_id: "session-001".to_string(),
            path: session_directory
                .join("monitor.csv")
                .to_string_lossy()
                .to_string(),
            name: "monitor.csv".to_string(),
            size: 0,
            sample_count: 0,
        };

        assert_eq!(
            delete_monitor_csv_file(&file).unwrap_err(),
            "监控 CSV 已不存在"
        );
        assert!(session_directory.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
