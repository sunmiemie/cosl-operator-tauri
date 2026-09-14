<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Icon } from '@iconify/vue'

import {
  getExecutionLogs,
  type FlojoyExecutionLogEntry,
} from '@/services/flojoy-api'

const props = defineProps<{
  jobsetId: string
  running: boolean
  flowLabel: string
  socketId: string
  liveEntries: FlojoyExecutionLogEntry[]
  persistent?: boolean
  layout?: 'inline' | 'rail'
  displayMode?: 'all' | 'cycle-key'
}>()

const INITIAL_LOAD_EVENTS = 100
const LOAD_MORE_EVENTS = 100
const MAX_CACHED_EVENTS = 1000
const panelExpandedStorageKey = 'halt-hass-flojoy-log-expanded'

const entries = ref<FlojoyExecutionLogEntry[]>([])
const logPath = ref('')
const persisted = ref(false)
const loading = ref(false)
const loadError = ref('')
const listRef = ref<HTMLElement | null>(null)
const expanded = ref(localStorage.getItem(panelExpandedStorageKey) !== 'false')
const activeFilter = ref<'messages' | 'all' | 'errors'>('messages')
const unseenCount = ref(0)
const canLoadEarlier = ref(true)
const historyBeforeEventId = ref<string | null>(null)
const historyBeforeTimestampMs = ref<number | null>(null)
const entryIds = new Set<string>()
let lastLiveEntryId = ''

const ROUTINE_CYCLE_FUNCTIONS = new Set([
  'HALT_HASS_DURATION_LOOP',
  'HALT_HASS_MQTT_CLIENT',
  'MEASURE_CURRENT_ITECH3123',
  'MEASURE_CURRENT_ITECH3123_48V',
  'MEASURE_VOLTAGE_ITECH3123',
  'MEASURE_VOLTAGE_ITECH3123_48V',
  'READ_COMM',
  'READ_MAST',
  'READ_PULSER_WAVEFORM',
  'READ_STATUS',
  'TIMER',
])
const KEY_LOG_PATTERN = /开始|完成|连接|断开|打开|关闭|上电|下电|启动|停止|退出|工艺|任务|零位|角度|超时|失败|异常/

function isCycleKeyEntry(entry: FlojoyExecutionLogEntry): boolean {
  if (entry.level === 'error' || entry.level === 'warning') return true
  if (ROUTINE_CYCLE_FUNCTIONS.has(entry.function)) return false
  if (KEY_LOG_PATTERN.test(entry.message)) return true
  return [
    'flow-start',
    'flow-finished',
    'test-start',
    'test-finished',
    'workbench-test-finished',
    'safe-exit',
  ].includes(entry.eventType)
}

const displayEntries = computed(() => (
  props.displayMode === 'cycle-key'
    ? entries.value.filter(isCycleKeyEntry)
    : entries.value
))

const errorCount = computed(() =>
  displayEntries.value.filter(entry => entry.level === 'error').length
)
const messageCount = computed(() =>
  props.displayMode === 'cycle-key'
    ? displayEntries.value.length
    : displayEntries.value.filter(entry => Boolean(entry.direction)).length
)
const visibleEntries = computed(() => {
  if (activeFilter.value === 'errors') {
    return displayEntries.value.filter(entry => entry.level === 'error')
  }
  if (activeFilter.value === 'messages') {
    return props.displayMode === 'cycle-key'
      ? displayEntries.value
      : displayEntries.value.filter(entry => Boolean(entry.direction))
  }
  return displayEntries.value
})
const persistenceText = computed(() => {
  if (loadError.value) return '日志读取失败'
  return persisted.value ? '已落盘' : '等待落盘'
})
const persistenceIcon = computed(() => {
  if (loadError.value) return 'mdi:alert-circle-outline'
  return persisted.value ? 'mdi:content-save-check-outline' : 'mdi:content-save-alert-outline'
})

function formatLogTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function directionText(entry: FlojoyExecutionLogEntry): string {
  if (entry.direction === 'send') return '发'
  if (entry.direction === 'receive') return '收'
  if (entry.level === 'error') return '错'
  return '运行'
}

function formatData(data: unknown): string {
  if (data === null || data === undefined) return ''
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

async function scrollToLatest(): Promise<void> {
  await nextTick()
  const element = listRef.value
  if (element) element.scrollTop = element.scrollHeight
}

function isNearBottom(): boolean {
  const element = listRef.value
  if (!element) return true
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 32
}

function mergeEntries(incoming: FlojoyExecutionLogEntry[]): number {
  const additions: FlojoyExecutionLogEntry[] = []
  incoming.forEach((entry) => {
    if (props.jobsetId && entry.jobsetId !== props.jobsetId) return
    if (entryIds.has(entry.id)) return
    entryIds.add(entry.id)
    additions.push(entry)
  })
  if (!additions.length) return 0

  const next = [...entries.value, ...additions]
    .sort((left, right) => left.timestampMs - right.timestampMs)
  if (next.length > MAX_CACHED_EVENTS) {
    const removed = next.splice(0, next.length - MAX_CACHED_EVENTS)
    removed.forEach(entry => entryIds.delete(entry.id))
  }
  entries.value = next
  return additions.length
}

async function loadLogs(
  preserveViewport = false,
  beforeEventId?: string,
  beforeTimestampMs?: number,
): Promise<void> {
  if (loading.value) return
  loading.value = true
  try {
    const element = listRef.value
    const previousScrollHeight = element?.scrollHeight ?? 0
    const previousScrollTop = element?.scrollTop ?? 0
    const limit = preserveViewport ? LOAD_MORE_EVENTS : INITIAL_LOAD_EVENTS
    const response = await getExecutionLogs(
      props.jobsetId,
      limit,
      beforeEventId,
      beforeTimestampMs,
    )
    const shouldFollow = isNearBottom()
    const added = mergeEntries(response.events)
    logPath.value = response.path
    persisted.value = response.persisted
    canLoadEarlier.value = response.hasMore ?? response.events.length >= limit
    historyBeforeEventId.value = response.nextBeforeEventId
      ?? response.events[0]?.id
      ?? null
    historyBeforeTimestampMs.value = response.nextBeforeTimestampMs
      ?? response.events[0]?.timestampMs
      ?? null
    loadError.value = ''
    if (preserveViewport && element) {
      await nextTick()
      element.scrollTop = previousScrollTop + element.scrollHeight - previousScrollHeight
    } else if (added && shouldFollow) {
      await scrollToLatest()
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '无法读取 Flojoy 日志'
  } finally {
    loading.value = false
  }
}

async function loadEarlier(): Promise<void> {
  if (loading.value || !canLoadEarlier.value) return
  if (historyBeforeEventId.value === null) return
  await loadLogs(
    true,
    historyBeforeEventId.value,
    historyBeforeTimestampMs.value ?? undefined,
  )
}

function toggleExpanded(): void {
  expanded.value = !expanded.value
  localStorage.setItem(panelExpandedStorageKey, String(expanded.value))
  if (expanded.value) {
    if (!entries.value.length) void loadLogs()
    void scrollToLatest()
  }
}

async function copyLogPath(): Promise<void> {
  if (!logPath.value) return
  try {
    await navigator.clipboard.writeText(logPath.value)
    ElMessage.success('日志文件路径已复制')
  } catch {
    ElMessage.error(`日志路径：${logPath.value}`)
  }
}

watch(() => props.jobsetId, () => {
  entries.value = []
  entryIds.clear()
  lastLiveEntryId = ''
  unseenCount.value = 0
  historyBeforeEventId.value = null
  historyBeforeTimestampMs.value = null
  canLoadEarlier.value = true
  void loadLogs()
})

watch(() => props.socketId, (value, previous) => {
  if (value && value !== previous) void loadLogs()
})

watch(
  () => props.liveEntries,
  async (liveEntries) => {
    const previousIndex = lastLiveEntryId
      ? liveEntries.findIndex(entry => entry.id === lastLiveEntryId)
      : -1
    const delta = previousIndex >= 0
      ? liveEntries.slice(previousIndex + 1)
      : liveEntries
    lastLiveEntryId = liveEntries[liveEntries.length - 1]?.id || lastLiveEntryId
    const shouldFollow = isNearBottom()
    const added = mergeEntries(delta)
    if (delta.some(entry => entry.persisted)) persisted.value = true
    if (!added) return
    if (shouldFollow) {
      unseenCount.value = 0
      await scrollToLatest()
    } else {
      unseenCount.value += added
    }
  },
  { immediate: true },
)

watch(() => props.running, (running) => {
  if (running && !expanded.value) {
    expanded.value = true
    localStorage.setItem(panelExpandedStorageKey, 'true')
  }
})

function handleListScroll(): void {
  if (isNearBottom()) unseenCount.value = 0
}

async function revealLatest(): Promise<void> {
  unseenCount.value = 0
  await scrollToLatest()
}

onMounted(() => void loadLogs())
</script>

<template>
  <aside
    v-if="persistent || expanded"
    class="execution-log-panel"
    :class="{ 'side-rail': layout === 'rail' }"
    aria-label="通信报文与执行日志"
  >
    <header class="log-header">
      <div class="log-title">
        <Icon icon="mdi:console-line" />
        <div>
          <strong>通信报文与执行日志</strong>
          <span>{{ flowLabel }} · {{ running ? '执行中' : '最近一次执行' }}</span>
        </div>
      </div>
      <div class="log-actions">
        <span
          class="persist-state"
          :class="{ error: Boolean(loadError), ready: persisted }"
          aria-live="polite"
        >
          <Icon :icon="persistenceIcon" />
          {{ persistenceText }}
        </span>
        <button
          v-if="!persistent"
          type="button"
          class="icon-button"
          :disabled="!logPath"
          title="复制日志文件路径"
          aria-label="复制日志文件路径"
          @click="copyLogPath"
        >
          <Icon icon="mdi:content-copy" />
        </button>
        <button
          type="button"
          class="icon-button"
          title="收起执行日志"
          aria-label="收起执行日志"
          @click="toggleExpanded"
        >
          <Icon icon="mdi:chevron-down" />
        </button>
      </div>
    </header>

    <p v-if="loadError" class="log-error" role="alert">
      <Icon icon="mdi:alert-circle-outline" />
      {{ loadError }}
    </p>

    <nav class="log-filters" aria-label="日志筛选">
      <button
        type="button"
        :class="{ active: activeFilter === 'messages' }"
        :aria-pressed="activeFilter === 'messages'"
        @click="activeFilter = 'messages'"
      >
        {{ displayMode === 'cycle-key' ? '关键日志' : '收发报文' }} {{ messageCount }}
      </button>
      <button
        v-if="displayMode !== 'cycle-key'"
        type="button"
        :class="{ active: activeFilter === 'all' }"
        :aria-pressed="activeFilter === 'all'"
        @click="activeFilter = 'all'"
      >
        全部 {{ entries.length }}
      </button>
      <button
        type="button"
        :class="{ active: activeFilter === 'errors' }"
        :aria-pressed="activeFilter === 'errors'"
        @click="activeFilter = 'errors'"
      >
        错误 {{ errorCount }}
      </button>
    </nav>

    <div ref="listRef" class="log-list" @scroll.passive="handleListScroll">
      <button
        v-if="canLoadEarlier"
        type="button"
        class="load-earlier-button"
        :disabled="loading"
        @click="loadEarlier"
      >
        <Icon :icon="loading ? 'mdi:loading' : 'mdi:history'" :class="{ spin: loading }" />
        {{ loading ? '正在补充历史…' : '加载更早 100 条' }}
      </button>
      <button v-if="unseenCount" type="button" class="new-log-button" aria-live="polite" @click="revealLatest">
        新增 {{ unseenCount }} 条日志，回到最新
      </button>
      <div v-if="visibleEntries.length === 0 && !loadError" class="log-empty">
        <Icon :icon="loading ? 'mdi:loading' : 'mdi:text-box-search-outline'" :class="{ spin: loading }" />
        {{ loading ? '正在读取执行日志…' : '当前筛选下暂无记录' }}
      </div>
      <article
        v-for="entry in visibleEntries"
        :key="entry.id"
        class="log-entry"
        :class="[entry.level, entry.direction]"
      >
        <div class="log-entry-line">
          <time>{{ formatLogTime(entry.timestamp) }}</time>
          <span class="direction-badge">{{ directionText(entry) }}</span>
          <span class="function-name">{{ entry.function || 'FLOJOY' }}</span>
          <span class="message">{{ entry.message }}</span>
        </div>
        <details v-if="entry.data !== null && entry.data !== undefined" class="log-detail">
          <summary>报文/参数</summary>
          <pre>{{ formatData(entry.data) }}</pre>
        </details>
      </article>
    </div>

    <footer class="log-footer">
      <span>显示 {{ visibleEntries.length }} / {{ displayEntries.length }} 条<span v-if="errorCount">，{{ errorCount }} 条错误</span></span>
      <span class="log-path" :title="logPath">{{ logPath || '等待日志文件' }}</span>
    </footer>
  </aside>

  <button
    v-else-if="!persistent"
    type="button"
    class="execution-log-trigger"
    aria-label="展开 Flojoy 执行日志"
    title="展开 Flojoy 执行日志"
    @click="toggleExpanded"
  >
    <Icon icon="mdi:console-line" />
    <span>报文日志</span>
    <b v-if="errorCount">{{ errorCount }}</b>
  </button>
</template>

<style scoped>
.execution-log-panel {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  height: 220px;
  min-height: 160px;
  max-height: 360px;
  flex-direction: column;
  overflow: hidden;
  resize: vertical;
  color: var(--color-text-primary, #1f2328);
  background: var(--color-bg-secondary, #f6f8fa);
  border: 1px solid var(--color-border, #e2e8f0);
  border-width: 1px 0 0;
  border-radius: 0;
  box-shadow: none;
}

.execution-log-panel.side-rail {
  width: 100%;
  height: 100%;
  min-height: 0;
  max-height: none;
  resize: none;
  border-width: 0 0 0 1px;
}

.log-header,
.log-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex: 0 0 auto;
  padding: 0.65rem 0.75rem;
  background: var(--color-bg-tertiary, #eef1f4);
}

.log-header {
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.log-title,
.log-actions,
.log-entry-line,
.persist-state {
  display: flex;
  align-items: center;
}

.log-title {
  gap: 0.55rem;
  min-width: 0;
}

.log-title > svg {
  flex: 0 0 auto;
  color: var(--color-primary, #0969da);
  font-size: 1.25rem;
}

.log-title strong,
.log-title span {
  display: block;
}

.log-title strong {
  font-size: 0.82rem;
}

.log-title span {
  margin-top: 0.08rem;
  color: var(--color-text-secondary, #656d76);
  font-size: 0.68rem;
}

.log-actions {
  gap: 0.35rem;
  flex: 0 0 auto;
}

.persist-state {
  gap: 0.25rem;
  color: var(--color-warning, #9a6700);
  font-size: 0.68rem;
}

.persist-state.ready {
  color: var(--color-success, #1a7f37);
}

.persist-state.error {
  color: var(--color-danger, #cf222e);
}

.icon-button {
  display: inline-flex;
  width: 1.8rem;
  height: 1.8rem;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--color-text-secondary, #656d76);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.35rem;
  cursor: pointer;
}

.icon-button:hover:not(:disabled),
.icon-button:focus-visible {
  color: var(--color-text-primary, #1f2328);
  background: var(--color-bg-hover, rgba(0, 0, 0, 0.04));
  border-color: var(--color-border, #e2e8f0);
}

.icon-button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.log-error {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  padding: 0.45rem 0.75rem;
  color: var(--color-danger, #cf222e);
  background: var(--color-danger-light, rgba(207, 34, 46, 0.1));
  font-size: 0.72rem;
}

.log-filters {
  display: flex;
  gap: 0.35rem;
  flex: 0 0 auto;
  padding: 0.4rem 0.75rem;
  background: var(--color-bg-secondary, #f6f8fa);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.log-filters button {
  min-height: 1.75rem;
  padding: 0.2rem 0.55rem;
  color: var(--color-text-secondary, #656d76);
  background: transparent;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 0.35rem;
  font-size: 0.68rem;
  cursor: pointer;
}

.log-filters button:hover,
.log-filters button:focus-visible {
  color: var(--color-primary, #0969da);
  border-color: var(--color-primary, #0969da);
}

.log-filters button.active {
  color: #fff;
  background: var(--color-primary, #0969da);
  border-color: var(--color-primary, #0969da);
  font-weight: 700;
}

.log-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.45rem 0;
  font-family: "Cascadia Mono", Consolas, monospace;
  color: var(--color-text-primary, #1f2328);
  background: var(--color-bg-primary, #fff);
  scrollbar-color: var(--color-scrollbar-hover, #cbd5e1) transparent;
}

.new-log-button {
  position: sticky;
  top: 0.4rem;
  z-index: 2;
  display: block;
  margin: 0 auto 0.35rem;
  padding: 0.25rem 0.65rem;
  color: #fff;
  background: var(--color-primary, #0969da);
  border: 0;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
}

.load-earlier-button {
  display: flex;
  min-height: 1.8rem;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  margin: 0.1rem auto 0.4rem;
  padding: 0.25rem 0.7rem;
  color: var(--color-primary, #0969da);
  border: 1px solid var(--color-primary, #0969da);
  border-radius: 999px;
  background: var(--color-primary-light, rgba(9, 105, 218, 0.1));
  font-size: 0.68rem;
  cursor: pointer;
}

.load-earlier-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.log-empty {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  color: var(--color-text-secondary, #656d76);
  font-size: 0.75rem;
}

.log-entry {
  padding: 0.32rem 0.75rem;
  border-left: 3px solid transparent;
  content-visibility: auto;
  contain-intrinsic-size: 42px;
}

.log-entry:hover {
  background: var(--color-bg-hover, rgba(0, 0, 0, 0.04));
}

.log-entry.error {
  background: var(--color-danger-light, rgba(207, 34, 46, 0.1));
  border-left-color: var(--color-danger, #cf222e);
}

.log-entry.send {
  border-left-color: var(--color-primary, #0969da);
}

.log-entry.receive {
  border-left-color: var(--color-success, #1a7f37);
}

.log-entry-line {
  gap: 0.45rem;
  min-width: 0;
  font-size: 0.7rem;
  line-height: 1.5;
}

.log-entry time {
  flex: 0 0 auto;
  color: var(--color-text-muted, #8c959f);
}

.direction-badge {
  flex: 0 0 auto;
  min-width: 2rem;
  padding: 0 0.25rem;
  color: var(--color-text-primary, #1f2328);
  background: var(--color-bg-tertiary, #eef1f4);
  border-radius: 0.2rem;
  text-align: center;
  font-weight: 700;
}

.send .direction-badge {
  color: #fff;
  background: var(--color-primary, #0969da);
}

.receive .direction-badge {
  color: #fff;
  background: var(--color-success, #1a7f37);
}

.error .direction-badge {
  color: #fff;
  background: var(--color-danger, #cf222e);
}

.function-name {
  flex: 0 0 auto;
  max-width: 8rem;
  overflow: hidden;
  color: var(--color-accent-purple, #8250df);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message {
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-primary, #1f2328);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-detail {
  margin: 0.2rem 0 0 6.3rem;
  color: var(--color-text-secondary, #656d76);
  font-size: 0.67rem;
}

.log-detail summary {
  width: max-content;
  cursor: pointer;
  user-select: none;
}

.log-detail pre {
  max-height: 10rem;
  margin: 0.25rem 0 0;
  overflow: auto;
  color: var(--color-primary, #0969da);
  white-space: pre-wrap;
  word-break: break-all;
}

.log-footer {
  padding-block: 0.45rem;
  color: var(--color-text-secondary, #656d76);
  border-top: 1px solid var(--color-border, #e2e8f0);
  font-size: 0.65rem;
}

.log-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.execution-log-trigger {
  position: relative;
  z-index: 1;
  display: inline-flex;
  width: 100%;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.6rem 0.8rem;
  color: var(--color-text-primary, #1f2328);
  background: var(--color-bg-secondary, #f6f8fa);
  border: 1px solid var(--color-border, #e2e8f0);
  border-width: 1px 0 0;
  border-radius: 0;
  box-shadow: none;
  cursor: pointer;
}

.execution-log-trigger b {
  min-width: 1.15rem;
  padding: 0.05rem 0.25rem;
  color: #fff;
  background: #dc2626;
  border-radius: 999px;
  font-size: 0.65rem;
}

.spin {
  animation: log-spin 1s linear infinite;
}

@keyframes log-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 720px) {
  .execution-log-panel:not(.side-rail) {
    width: 100%;
  }

  .persist-state {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
