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
  payload: unknown
  rawPayload: string
  receivedAt: number
}

export interface HaltHassMqttCommunication {
  direction: 'send' | 'receive'
  level: 'info' | 'warning' | 'error'
  message: string
  topic: string
  payload: string
  occurredAt: number
}

export type HaltHassMqttCommand =
  | 'Connect'
  | 'Disconnect'
  | 'ListTest'
  | 'LoadTest'
  | 'Run'
  | 'Stop'
  | 'Pause'
  | 'Continue'
  | 'RequestTestStatus'
  | 'RequestDetailStatus'

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
  const lastCommunication = ref<HaltHassMqttCommunication | null>(null)
  const error = ref('')
  let messageUnlisten: UnlistenFn | null = null
  let statusUnlisten: UnlistenFn | null = null
  let communicationUnlisten: UnlistenFn | null = null

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
    if (!communicationUnlisten) {
      communicationUnlisten = await listen<HaltHassMqttCommunication>(
        'halt-hass-mqtt-communication',
        (event) => {
          lastCommunication.value = event.payload
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
    command: HaltHassMqttCommand,
    argument?: string,
  ): Promise<void> {
    await invoke('publish_halt_hass_mqtt_command', {
      topicPrefix,
      command,
      argument,
    })
  }

  onUnmounted(() => {
    void disconnect()
    messageUnlisten?.()
    statusUnlisten?.()
    communicationUnlisten?.()
    messageUnlisten = null
    statusUnlisten = null
    communicationUnlisten = null
  })

  return {
    connectionState: readonly(connectionState),
    statusMessage: readonly(statusMessage),
    lastMessage: readonly(lastMessage),
    lastCommunication: readonly(lastCommunication),
    error: readonly(error),
    isConnected,
    isConnecting,
    connect,
    disconnect,
    publishCommand,
  }
}
