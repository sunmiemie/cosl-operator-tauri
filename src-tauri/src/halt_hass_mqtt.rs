use parking_lot::Mutex;
use rumqttc::{AsyncClient, Event, MqttOptions, Packet, QoS};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

const MESSAGE_EVENT: &str = "halt-hass-mqtt-message";
const STATUS_EVENT: &str = "halt-hass-mqtt-status";
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

fn emit_status(app: &AppHandle, state: &'static str, message: impl Into<String>) {
    let _ = app.emit(
        STATUS_EVENT,
        HaltHassMqttStatus {
            state,
            message: message.into(),
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
        "Connect" | "Disconnect" | "Run" | "Stop" | "Pause" | "Continue" | "RequestTestStatus"
    )
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
        loop {
            match eventloop.poll().await {
                Ok(Event::Incoming(Packet::ConnAck(_))) => {
                    emit_status(&app_for_task, "connected", "工作台 MQTT 已连接");

                    // 连接完成后主动请求当前状态，避免必须等待工作台下一次周期上报。
                    let _ = task_client
                        .publish(
                            topic(&prefix_for_task, "App/Test/Command"),
                            QoS::AtLeastOnce,
                            false,
                            "RequestTestStatus",
                        )
                        .await;
                    let _ = task_client
                        .publish(
                            topic(&prefix_for_task, "THV/Test/Command"),
                            QoS::AtLeastOnce,
                            false,
                            "RequestDetailStatus",
                        )
                        .await;
                }
                Ok(Event::Incoming(Packet::Publish(message))) => {
                    let raw_payload = String::from_utf8_lossy(&message.payload).into_owned();
                    let payload = serde_json::from_str(&raw_payload)
                        .unwrap_or_else(|_| Value::String(raw_payload.clone()));
                    let _ = app_for_task.emit(
                        MESSAGE_EVENT,
                        HaltHassMqttMessage {
                            topic: message.topic,
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
) -> Result<(), String> {
    if !validate_command(&command) {
        return Err(format!("不支持的工作台命令: {command}"));
    }

    let client = state
        .client
        .lock()
        .clone()
        .ok_or_else(|| "工作台 MQTT 未连接".to_string())?;
    client
        .publish(
            topic(&normalized_prefix(&topic_prefix), "App/Test/Command"),
            QoS::AtLeastOnce,
            false,
            command,
        )
        .await
        .map_err(|error| format!("发送工作台命令失败: {error}"))
}

#[cfg(test)]
mod tests {
    use super::{normalized_prefix, topic, validate_command};

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
        assert!(!validate_command("DeleteTest"));
        assert!(!validate_command("arbitrary payload"));
    }
}
