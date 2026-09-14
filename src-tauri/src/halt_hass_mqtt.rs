use parking_lot::Mutex;
use rumqttc::{AsyncClient, Event, MqttOptions, Packet, QoS};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

const MESSAGE_EVENT: &str = "halt-hass-mqtt-message";
const STATUS_EVENT: &str = "halt-hass-mqtt-status";
const COMMUNICATION_EVENT: &str = "halt-hass-mqtt-communication";
const SUBSCRIPTION_SUFFIXES: [&str; 5] = [
    "App/System/Status",
    "App/Test/Status",
    "App/Test/List",
    "THV/Test/VibStatus",
    "THV/Test/THStatus",
];

pub struct HaltHassMqttState {
    client: Mutex<Option<AsyncClient>>,
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl Default for HaltHassMqttState {
    fn default() -> Self {
        Self {
            client: Mutex::new(None),
            task: Mutex::new(None),
        }
    }
}

impl HaltHassMqttState {
    async fn stop(&self) {
        let client = self.client.lock().take();
        let task = self.task.lock().take();

        if let Some(client) = client {
            let _ = client.disconnect().await;
        }
        if let Some(task) = task {
            task.abort();
        }
    }

    pub fn shutdown_now(&self) {
        self.client.lock().take();
        if let Some(task) = self.task.lock().take() {
            task.abort();
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HaltHassMqttConfig {
    broker: String,
    port: u16,
    topic_prefix: String,
    username: Option<String>,
    password: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HaltHassMqttStatus {
    state: &'static str,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HaltHassMqttMessage {
    topic: String,
    payload: Value,
    raw_payload: String,
    received_at: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct HaltHassMqttCommunication {
    direction: &'static str,
    level: &'static str,
    message: String,
    topic: String,
    payload: String,
    occurred_at: u64,
}

fn emit_status(app: &AppHandle, state: &'static str, message: impl Into<String>) {
    let _ = app.emit(
        STATUS_EVENT,
        HaltHassMqttStatus {
            state,
            message: message.into(),
        },
    );
}

fn emit_communication(
    app: &AppHandle,
    direction: &'static str,
    level: &'static str,
    message: impl Into<String>,
    topic: impl Into<String>,
    payload: impl Into<String>,
) {
    let _ = app.emit(
        COMMUNICATION_EVENT,
        HaltHassMqttCommunication {
            direction,
            level,
            message: message.into(),
            topic: topic.into(),
            payload: payload.into(),
            occurred_at: now_millis(),
        },
    );
}

fn normalized_prefix(value: &str) -> String {
    value.trim().trim_matches('/').to_string()
}

fn topic(prefix: &str, suffix: &str) -> String {
    if prefix.is_empty() {
        suffix.to_string()
    } else {
        format!("{prefix}/{suffix}")
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn validate_command(command: &str) -> bool {
    matches!(
        command,
        "Connect"
            | "Disconnect"
            | "ListTest"
            | "LoadTest"
            | "Run"
            | "Stop"
            | "Pause"
            | "Continue"
            | "RequestTestStatus"
            | "RequestDetailStatus"
    )
}

fn command_topic_suffix(command: &str) -> &'static str {
    if command == "RequestDetailStatus" {
        "THV/Test/Command"
    } else {
        "App/Test/Command"
    }
}

fn command_payload(command: &str, argument: Option<&str>) -> Result<String, String> {
    if command != "LoadTest" {
        return Ok(command.to_string());
    }

    let test_name = argument.unwrap_or_default().trim();
    if test_name.is_empty() {
        return Err("LoadTest 必须指定测试曲线名称".to_string());
    }
    if test_name.contains(';') || test_name.contains(['\r', '\n']) {
        return Err("测试曲线名称包含非法字符".to_string());
    }
    Ok(format!("LoadTest;{test_name}"))
}

fn test_status(payload: &Value) -> Option<&str> {
    payload
        .as_object()
        .and_then(|value| value.get("Status"))
        .and_then(Value::as_str)
}

/// 连接 HALT-HASS 工作台 MQTT。账号信息只用于当前连接，不持久化也不写日志。
#[tauri::command]
pub async fn start_halt_hass_mqtt(
    app: AppHandle,
    state: State<'_, HaltHassMqttState>,
    config: HaltHassMqttConfig,
) -> Result<(), String> {
    let broker = config.broker.trim().to_string();
    if broker.is_empty() {
        return Err("MQTT Broker 地址不能为空".to_string());
    }
    if config.port == 0 {
        return Err("MQTT 端口无效".to_string());
    }

    state.stop().await;

    let prefix = normalized_prefix(&config.topic_prefix);
    let client_id = format!("cosl-operator-{}-{}", std::process::id(), now_millis());
    let mut options = MqttOptions::new(client_id, broker.clone(), config.port);
    options.set_keep_alive(Duration::from_secs(15));
    options.set_clean_session(true);

    if let Some(username) = config.username.filter(|value| !value.is_empty()) {
        options.set_credentials(username, config.password.unwrap_or_default());
    }

    let (client, mut eventloop) = AsyncClient::new(options, 32);
    for suffix in SUBSCRIPTION_SUFFIXES {
        client
            .subscribe(topic(&prefix, suffix), QoS::AtLeastOnce)
            .await
            .map_err(|error| format!("订阅 MQTT Topic 失败: {error}"))?;
    }

    *state.client.lock() = Some(client.clone());
    emit_status(
        &app,
        "connecting",
        format!("正在连接 {broker}:{}", config.port),
    );

    let app_for_task = app.clone();
    let prefix_for_task = prefix.clone();
    let task_client = client.clone();
    let task = tauri::async_runtime::spawn(async move {
        let mut detail_requested_for_running = false;
        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Packet::ConnAck(_))) => {
                    emit_status(&app_for_task, "connected", "工作台 MQTT 已连接");

                    // 连接完成后主动请求当前状态，避免必须等待工作台下一次周期上报。
                    let command_topic = topic(&prefix_for_task, "App/Test/Command");
                    emit_communication(
                        &app_for_task,
                        "send",
                        "info",
                        "MQTT 连接完成，发送状态查询",
                        command_topic.clone(),
                        "RequestTestStatus",
                    );
                    if let Err(error) = task_client
                        .publish(
                            command_topic.clone(),
                            QoS::AtLeastOnce,
                            false,
                            "RequestTestStatus",
                        )
                        .await
                    {
                        emit_communication(
                            &app_for_task,
                            "receive",
                            "error",
                            format!("MQTT 状态查询发送失败: {error}"),
                            command_topic,
                            "RequestTestStatus",
                        );
                    }
                }
                Ok(Event::Incoming(Packet::Publish(message))) => {
                    let message_topic = message.topic.clone();
                    let raw_payload = String::from_utf8_lossy(&message.payload).into_owned();
                    let payload = serde_json::from_str(&raw_payload)
                        .unwrap_or_else(|_| Value::String(raw_payload.clone()));

                    if message_topic.ends_with("/App/Test/Status") {
                        let running = test_status(&payload)
                            .is_some_and(|status| status.eq_ignore_ascii_case("Running"));
                        if running && !detail_requested_for_running {
                            let detail_topic = topic(&prefix_for_task, "THV/Test/Command");
                            emit_communication(
                                &app_for_task,
                                "send",
                                "info",
                                "工作台已 Running，发送温度/振动明细查询",
                                detail_topic.clone(),
                                "RequestDetailStatus",
                            );
                            match task_client
                                .publish(
                                    detail_topic.clone(),
                                    QoS::AtLeastOnce,
                                    false,
                                    "RequestDetailStatus",
                                )
                                .await
                            {
                                Ok(_) => {
                                    detail_requested_for_running = true;
                                    emit_status(
                                        &app_for_task,
                                        "connected",
                                        "工作台已运行，正在读取温度和振动",
                                    );
                                }
                                Err(error) => {
                                    emit_status(
                                        &app_for_task,
                                        "error",
                                        format!("请求温度和振动数据失败: {error}"),
                                    );
                                    emit_communication(
                                        &app_for_task,
                                        "receive",
                                        "error",
                                        format!("请求温度和振动数据失败: {error}"),
                                        detail_topic,
                                        "RequestDetailStatus",
                                    );
                                }
                            }
                        } else if !running {
                            detail_requested_for_running = false;
                        }
                    }

                    let _ = app_for_task.emit(
                        MESSAGE_EVENT,
                        HaltHassMqttMessage {
                            topic: message_topic,
                            payload,
                            raw_payload,
                            received_at: now_millis(),
                        },
                    );
                }
                Ok(_) => {}
                Err(error) => {
                    emit_status(
                        &app_for_task,
                        "error",
                        format!("工作台 MQTT 连接中断: {error}"),
                    );
                    emit_communication(
                        &app_for_task,
                        "receive",
                        "error",
                        format!("工作台 MQTT 连接中断: {error}"),
                        "",
                        "",
                    );
                    break;
                }
            }
        }
    });
    *state.task.lock() = Some(task);

    Ok(())
}

#[tauri::command]
pub async fn stop_halt_hass_mqtt(
    app: AppHandle,
    state: State<'_, HaltHassMqttState>,
) -> Result<(), String> {
    state.stop().await;
    emit_status(&app, "disconnected", "工作台 MQTT 已断开");
    Ok(())
}

#[tauri::command]
pub async fn publish_halt_hass_mqtt_command(
    state: State<'_, HaltHassMqttState>,
    topic_prefix: String,
    command: String,
    argument: Option<String>,
) -> Result<(), String> {
    if !validate_command(&command) {
        return Err(format!("不支持的工作台命令: {command}"));
    }

    let payload = command_payload(&command, argument.as_deref())?;
    let client = state
        .client
        .lock()
        .clone()
        .ok_or_else(|| "工作台 MQTT 未连接".to_string())?;
    client
        .publish(
            topic(
                &normalized_prefix(&topic_prefix),
                command_topic_suffix(&command),
            ),
            QoS::AtLeastOnce,
            false,
            payload,
        )
        .await
        .map_err(|error| format!("发送工作台命令失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{command_payload, command_topic_suffix, normalized_prefix, test_status, topic, validate_command};
    use serde_json::json;

    #[test]
    fn normalizes_edm_topic_prefix() {
        let prefix = normalized_prefix(" /EDM/ ");
        assert_eq!(prefix, "EDM");
        assert_eq!(topic(&prefix, "THV/Test/THStatus"), "EDM/THV/Test/THStatus");
    }

    #[test]
    fn only_allows_known_workbench_commands() {
        assert!(validate_command("Pause"));
        assert!(validate_command("Continue"));
        assert!(validate_command("ListTest"));
        assert!(validate_command("LoadTest"));
        assert!(validate_command("RequestDetailStatus"));
        assert!(!validate_command("DeleteTest"));
        assert!(!validate_command("arbitrary payload"));
    }

    #[test]
    fn builds_load_test_payload() {
        assert_eq!(command_payload("LoadTest", Some("mydemo2")).unwrap(), "LoadTest;mydemo2");
        assert!(command_payload("LoadTest", None).is_err());
        assert_eq!(command_payload("ListTest", None).unwrap(), "ListTest");
    }

    #[test]
    fn routes_detail_status_request_to_thv_topic() {
        assert_eq!(
            command_topic_suffix("RequestDetailStatus"),
            "THV/Test/Command"
        );
        assert_eq!(command_topic_suffix("Run"), "App/Test/Command");
    }

    #[test]
    fn reads_workbench_test_status() {
        assert_eq!(test_status(&json!({"Status": "Running"})), Some("Running"));
        assert_eq!(test_status(&json!({"status": "Running"})), None);
    }
}
