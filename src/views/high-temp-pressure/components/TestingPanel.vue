<script setup lang="ts">
import type { ScheduledSelection } from '../types'

defineProps<{
  t1: number[]
  t2: number[]
  p: number[]
  testRunning: boolean
  csvCount: number
  currentSelected: ScheduledSelection | null
}>()

const emit = defineEmits<{
  pause: []
  resume: []
  'open-stop-modal': []
  'open-end-modal': []
}>()
</script>

<template>
  <div class="panel">
    <div class="ocr-bar">
      <div class="ocr-mini on">
        <div class="ocr-mini-title">🔴 上罐 · 250L容器（当前识别）</div>
        <div class="ocr-mini-row"><span class="ocr-mini-label">上部水温</span><span class="ocr-val temp">{{ t1[t1.length - 1]?.toFixed(1) || '--.-' }} °C</span></div>
        <div class="ocr-mini-row"><span class="ocr-mini-label">下部水温</span><span class="ocr-val temp">{{ t2[t2.length - 1]?.toFixed(2) || '--.-' }} °C</span></div>
        <div class="ocr-mini-row"><span class="ocr-mini-label">容器压力</span><span class="ocr-val press">{{ p[p.length - 1]?.toFixed(3) || '--.--' }} MPa</span></div>
      </div>
      <div class="ocr-mini">
        <div class="ocr-mini-title">⚡ 系统状态</div>
        <div class="ocr-mini-row"><span class="ocr-mini-label">测试状态</span><span class="badge" :class="testRunning ? 'badge-green' : ''">{{ testRunning ? '● 测试中' : '● 已暂停' }}</span></div>
        <div class="ocr-mini-row"><span class="ocr-mini-label">已采集</span><span style="font-family:'JetBrains Mono'">{{ csvCount }} 条</span></div>
      </div>
    </div>

    <div class="testing-grid">
      <div class="card chart-fill">
        <div class="card-header">
          <div class="card-title">📈 实时监控曲线</div>
        </div>
        <div class="card-body">
          <div id="htp-chart" class="chart-container"></div>
        </div>
      </div>
      <div class="right-col">
        <div class="card">
          <div class="card-header">
            <div class="card-title">📊 实时参数</div>
            <span style="font-size:11px;color:var(--color-text-secondary)">测试中</span>
          </div>
          <div class="card-body" style="padding:10px 14px">
            <div class="realtime-stats">
              <div class="rt-stat"><div class="rt-stat-label">上部水温</div><div class="rt-stat-val temp">{{ t1[t1.length - 1]?.toFixed(1) || '--.-' }}°C</div></div>
              <div class="rt-stat"><div class="rt-stat-label">下部水温</div><div class="rt-stat-val temp">{{ t2[t2.length - 1]?.toFixed(1) || '--.-' }}°C</div></div>
              <div class="rt-stat" style="grid-column:span 2"><div class="rt-stat-label">容器压力</div><div class="rt-stat-val press">{{ p[p.length - 1]?.toFixed(2) || '--.--' }} MPa</div></div>
            </div>
            <div class="divider"></div>
            <div style="display:flex;justify-content:space-between">
              <div><div class="info-key">已采集数据</div><div class="info-val">{{ csvCount }} 条</div></div>
              <div><div class="info-key">采集状态</div><div class="info-val" style="color:var(--green-bright)">正常</div></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title">📋 当前工单</div></div>
          <div class="card-body" style="padding:10px 14px">
            <div class="info-grid" style="grid-template-columns:1fr 1fr;gap:8px" v-if="currentSelected">
              <div class="info-item"><div class="info-key">工单编号</div><div class="info-val" style="font-size:12px">{{ currentSelected.order.no }}</div></div>
              <div class="info-item"><div class="info-key">器皿类型</div><div class="info-val">{{ currentSelected.order.vesselType }}</div></div>
              <div class="info-item"><div class="info-key">目标温度</div><div class="info-val" style="color:var(--red-bright)">{{ currentSelected.order.targetTemp }}</div></div>
              <div class="info-item"><div class="info-key">目标压力</div><div class="info-val" style="color:var(--cyan)">{{ currentSelected.order.targetPressure }}</div></div>
              <div class="info-item"><div class="info-key">保温保压</div><div class="info-val">{{ currentSelected.order.keepCondition }}</div></div>
              <div class="info-item"><div class="info-key">仪器</div><div class="info-val">{{ (currentSelected.order.items || []).map(i => i.sn).join(' / ') }}</div></div>
            </div>
            <div v-else class="text-muted">未选择排程仪器</div>
          </div>
        </div>
      </div>
    </div>

    <div class="test-controls">
      <button class="test-btn pause" v-if="testRunning" @click="emit('pause')">⏸ 测试暂停</button>
      <button class="test-btn pause" v-else @click="emit('resume')">▶ 继续测试</button>
      <button class="test-btn stop" @click="emit('open-stop-modal')">⏹ 测试中止</button>
      <button class="test-btn end" @click="emit('open-end-modal')">✅ 测试结束</button>
    </div>
  </div>
</template>

<style scoped src="./high-temp-pressure.shared.css"></style>
