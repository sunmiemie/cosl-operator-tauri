import { computed, onUnmounted, readonly, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export interface HaltHassMqttConfig {
  broker: string
  port: number
  topicPrefix: string
  username?: string
  password?: string
}

export interface HaltHassMqttMessage {
  topic: string
  payload: Record<string, unknown> | string | number | boolean | null
  rawPayload: string
  receivedAt: number
}

export type HaltHassMqttConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'

interface HaltHassMqttStatus {
  state: HaltHassMqttConnectionState
  message: string
}

export function useHaltHassMqtt() {
  const connectionState = ref<HaltHassMqttConnectionState>('disconnected')
  const statusMessage = ref('工作台 MQTT 未连接')
  const lastMessage = ref<HaltHassMqttMessage | null>(null)
  const error = ref('')
  let messageUnlisten: UnlistenFn | null = null
  let statusUnlisten: UnlistenFn | null = null

  const isConnected = computed(() => connectionState.value === 'connected')
  const isConnecting = computed(() => connectionState.value === 'connecting')

  async function ensureListeners(): Promise<void> {
    if (!messageUnlisten) {
      messageUnlisten = await listen<HaltHassMqttMessage>(
        'halt-hass-mqtt-message',
        (event) => {
          lastMessage.value = event.payload
        },
      )
    }
    if (!statusUnlisten) {
      statusUnlisten = await listen<HaltHassMqttStatus>(
        'halt-hass-mqtt-status',
        (event) => {
          connectionState.value = event.payload.state
          statusMessage.value = event.payload.message
          error.value = event.payload.state === 'error'
            ? event.payload.message
            : ''
        },
      )
    }
  }

  async function connect(config: HaltHassMqttConfig): Promise<boolean> {
    try {
      await ensureListeners()
      error.value = ''
      connectionState.value = 'connecting'
      statusMessage.value = `正在连接 ${config.broker}:${config.port}`
      await invoke('start_halt_hass_mqtt', { config })
      return true
    } catch (connectError) {
      const message = String(connectError)
      connectionState.value = 'error'
      statusMessage.value = message
      error.value = message
      return false
    }
  }

  async function disconnect(): Promise<void> {
    try {
      await invoke('stop_halt_hass_mqtt')
    } catch (disconnectError) {
      error.value = String(disconnectError)
    } finally {
      connectionState.value = 'disconnected'
      statusMessage.value = '工作台 MQTT 已断开'
    }
  }

  async function publishCommand(
    topicPrefix: string,
    command: 'Connect' | 'Disconnect' | 'Run' | 'Stop' | 'Pause' | 'Continue' | 'RequestTestStatus',
  ): Promise<void> {
    await invoke('publish_halt_hass_mqtt_command', {
      topicPrefix,
      command,
    })
  }

  onUnmounted(() => {
    void disconnect()
    messageUnlisten?.()
    statusUnlisten?.()
    messageUnlisten = null
    statusUnlisten = null
  })

  return {
    connectionState: readonly(connectionState),
    statusMessage: readonly(statusMessage),
    lastMessage: readonly(lastMessage),
    error: readonly(error),
    isConnected,
    isConnecting,
    connect,
    disconnect,
    publishCommand,
  }
}
