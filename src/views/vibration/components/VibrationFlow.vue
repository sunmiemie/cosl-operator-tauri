<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { DevCheckItem, ReportFile, ShutdownCheckItem, Stage, WorkOrder } from '../types'

defineProps<{
  stage: Stage
  stepList: ReadonlyArray<{ id: Stage; label: string }>
  devCheckItems: DevCheckItem[]
  devCheckDoneCount: number
  devCheckProgressPct: number
  devCheckAllAnswered: boolean
  devCheckInvalidNoRemark: boolean
  currentWorkOrder: WorkOrder | null
  calStep: 'amp' | 'dur'
  liveLevel: string
  liveFreq: string
  vibDataCount: number
  formattedDuration: string
  isRunning: boolean
  liveFileName: string
  liveAx: string
  liveAy: string
  liveAz: string
  testMode: 'formal' | 'pre'
  reportProgress: number
  reportFiles: ReportFile[]
  fileGenRunning: boolean
  allFilesDone: boolean
  shutdownChecks: ShutdownCheckItem[]
}>()

const emit = defineEmits<{
  'back-to-dashboard': []
  'set-dev-check-answer': [id: number, answer: 'yes' | 'no']
  'submit-dev-check': []
  'reset-dev-check': []
  'go-prev-stage': []
  'go-next-stage': []
  'set-cal-step': [step: 'amp' | 'dur']
  'pause-vib-test': []
  'resume-vib-test': []
  'open-abort-warning': []
  'end-vib-test': []
  'convert-to-formal': []
  'set-stage-testing': []
  'set-stage-shutdown': []
  'start-file-gen': []
  'toggle-shutdown-check': [id: number]
  'finish-shutdown': []
}>()
</script>

<template>
  <div>
    <div class="stepbar">
      <span
        v-for="s in stepList"
        :key="s.id"
        class="step-chip"
        :class="{ active: stage === s.id }"
      >
        {{ s.label }}
      </span>
    </div>

    <div class="flow-container">
      <div v-if="stage === 'devcheck'" class="panel-card">
        <div class="modal-overlay open">
          <div class="startup-check-modal">
            <h2 class="modal-title">开机检查</h2>
            <div class="check-list-container">
              <div class="check-list">
                <label v-for="item in devCheckItems" :key="item.id" class="check-item" :class="{ 'is-checked': item.answer === 'yes' }">
                  <div class="checkbox-wrapper">
                    <input type="checkbox" :checked="item.answer === 'yes'" @change="emit('set-dev-check-answer', item.id, ($event.target as HTMLInputElement).checked ? 'yes' : 'no')" />
                    <div class="custom-checkbox"></div>
                  </div>
                  <span class="check-text">{{ item.text }}</span>
                </label>
              </div>
            </div>
            <div class="modal-actions">
              <button class="cancel-btn" @click="emit('back-to-dashboard')">取消</button>
              <button class="next-btn" @click="emit('submit-dev-check')">下一步</button>
            </div>
          </div>
        </div>
        <div class="panel-header">
          <span class="panel-title">设备运转前检查（{{ devCheckDoneCount }} / {{ devCheckItems.length }}）</span>
          <span class="badge">{{ devCheckProgressPct }}%</span>
        </div>

        <div class="progress-wrap">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${devCheckProgressPct}%` }"></div>
          </div>
          <div class="progress-tip">检查完成进度: {{ devCheckDoneCount }}/{{ devCheckItems.length }}</div>
        </div>

        <div class="check-list">
          <div
            v-for="item in devCheckItems"
            :key="item.id"
            class="check-item"
            :class="{ ok: item.answer === 'yes', bad: item.answer === 'no' }"
          >
            <div class="check-row">
              <div class="check-num">{{ item.id }}</div>
              <div class="check-text">{{ item.text }}</div>
              <div class="check-actions">
                <button class="mini-btn" :class="{ active: item.answer === 'yes' }" @click="emit('set-dev-check-answer', item.id, 'yes')">是</button>
                <button class="mini-btn danger" :class="{ active: item.answer === 'no' }" @click="emit('set-dev-check-answer', item.id, 'no')">否</button>
              </div>
            </div>
            <div v-if="item.answer === 'no'" class="remark">
              <input v-model="item.remark" class="remark-input" type="text" placeholder="请填写备注（必填）" />
            </div>
          </div>
        </div>

        <div class="panel-footer">
          <button class="btn btn-secondary" @click="emit('reset-dev-check')">重置</button>
          <button class="btn btn-primary" :disabled="!devCheckAllAnswered || devCheckInvalidNoRemark" @click="emit('submit-dev-check')">
            确认完成检查，进入下一步
          </button>
        </div>
      </div>

      <div v-else-if="stage === 'start'" class="modal-overlay">
        <div class="startup-check-modal">
          <h2 class="modal-title">重要安全提示</h2>
          <div class="content-pad two-col-modal">
            <div class="left-col">
              <div class="alert warning">
                <Icon icon="mdi:alert" class="alert-icon" />
                <div class="alert-text">
                  <div class="alert-title">启动前确认</div>
                  <ul class="alert-list">
                    <li>请确认已完成设备运转前检查</li>
                    <li>确认试件安装牢固，工具已清理</li>
                    <li>确认工作区域无人员</li>
                    <li>确认振动传感器安装牢固</li>
                    <li>启动后请勿随意中断测试程序</li>
                  </ul>
                </div>
              </div>
            </div>
            <div class="right-col">
              <div class="card-block">
                <div class="block-title">当前工单详情</div>
                <div class="kv">
                  <div class="k">工单号</div><div class="v">{{ currentWorkOrder?.id }}</div>
                  <div class="k">设备名称</div><div class="v">{{ currentWorkOrder?.device }}</div>
                  <div class="k">振动量级</div><div class="v">{{ currentWorkOrder?.level }}</div>
                  <div class="k">测试时长</div><div class="v">{{ currentWorkOrder?.duration }} 分钟</div>
                  <div class="k">测试类型</div><div class="v">{{ currentWorkOrder?.type }}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="emit('go-prev-stage')">返回</button>
            <button class="next-btn" @click="emit('go-next-stage')">确认启动振动台</button>
          </div>
        </div>
      </div>

      <div v-else-if="stage === 'calibration'" class="panel-card test-panel-full">
        <div class="cal-tabs">
          <button class="cal-tab" :class="{ active: calStep === 'amp' }" @click="emit('set-cal-step', 'amp')">① 振级校验</button>
          <button class="cal-tab" :class="{ active: calStep === 'dur' }" @click="emit('set-cal-step', 'dur')">② 时长校验</button>
        </div>

        <div v-if="calStep === 'amp'" class="cal-layout">
          <div class="cal-main">
            <div class="cal-title">振级校验</div>
            <div class="camera-feed-box">
              <div class="scan-line-anim"></div>
              <div class="cam-label">LIVE · 振动台主控界面采集</div>
            </div>
            <div class="alert info mt-4">
              <Icon icon="mdi:information" class="alert-icon blue" />
              <div class="alert-text">请在振动台主控计算机上切换到振级输入界面，参照右侧工单信息正确设定振动量级参数，确认无误后点击下一步。</div>
            </div>
            <div class="alert warning mt-2">
              <Icon icon="mdi:alert" class="alert-icon" />
              <div class="alert-text"><strong>重要：</strong>振级设置必须与工单信息完全一致，设置错误可能导致试件损坏或测试结果不准确。</div>
            </div>
            <div class="btn-row mt-4">
              <button class="cancel-btn" @click="emit('go-prev-stage')">上一步</button>
              <button class="next-btn" style="margin-top:auto; align-self:flex-end" @click="emit('set-cal-step', 'dur')">下一步：时长校验</button>
            </div>
          </div>
          <div class="cal-side">
            <div class="card">
              <div class="card-header"><h3 class="card-title">工单详细信息</h3></div>
              <div class="info-body">
                <div class="info-sec-title">基本信息</div>
                <div class="kv-row"><span class="k">工单编号</span><span class="v">{{ currentWorkOrder?.id }}</span></div>
                <div class="kv-row"><span class="k">申请人</span><span class="v">{{ currentWorkOrder?.applicant }}</span></div>
                <div class="kv-row"><span class="k">联系电话</span><span class="v">{{ currentWorkOrder?.phone }}</span></div>
                <div class="info-sec-title mt-4">测试参数</div>
                <div class="kv-row"><span class="k">振动量级</span><span class="v highlight">{{ currentWorkOrder?.level }}</span></div>
                <div class="kv-row"><span class="k">振动时长</span><span class="v highlight">{{ currentWorkOrder?.duration }} 分钟</span></div>
                <div class="kv-row"><span class="k">测试类型</span><span class="v">{{ currentWorkOrder?.type }}</span></div>
                <div class="kv-row"><span class="k">振动方向</span><span class="v">Z轴</span></div>
                <div class="kv-row"><span class="k">频率范围</span><span class="v">5~2000Hz</span></div>
                <div class="info-sec-title mt-4">设备信息</div>
                <div class="kv-row"><span class="k">设备名称</span><span class="v">{{ currentWorkOrder?.device }}</span></div>
                <div class="kv-row"><span class="k">数量</span><span class="v">1 台</span></div>
                <div class="alert warning small mt-4">
                  <Icon icon="mdi:alert" class="alert-icon small" />
                  <span>请核对振级参数设置</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="calStep === 'dur'" class="cal-layout">
          <div class="cal-main">
            <div class="cal-title">振动时长校验</div>
            <div class="camera-feed-box">
              <div class="scan-line-anim"></div>
              <div class="cam-label">LIVE · 振动时长设置界面采集</div>
            </div>
            <div class="alert info mt-4">
              <Icon icon="mdi:information" class="alert-icon blue" />
              <div class="alert-text">请在振动台主控计算机上切换到时长设置界面，参照工单信息正确设定振动时长，确认后点击完成校验。</div>
            </div>
            <div class="alert warning mt-2">
              <Icon icon="mdi:alert" class="alert-icon" />
              <div class="alert-text">时长设置不正确将导致测试时间不准确，影响测试结果的有效性。</div>
            </div>
            <div class="btn-row mt-4">
              <button class="cancel-btn" @click="emit('set-cal-step', 'amp')">上一步</button>
              <button class="next-btn" @click="emit('go-next-stage')">完成校验，进入振动测试</button>
            </div>
          </div>
          <div class="cal-side">
            <div class="card">
              <div class="card-header"><h3 class="card-title">时长校验</h3></div>
              <div class="info-body">
                <div class="dur-box">
                  <div class="dur-label">工单要求时长</div>
                  <div class="dur-val">{{ currentWorkOrder?.duration }}</div>
                  <div class="dur-unit">分钟</div>
                </div>
                <div class="alert warning small">
                  <Icon icon="mdi:alert" class="alert-icon small" />
                  <span>请核对时长设置</span>
                </div>
                <div class="info-sec-title mt-4">其他参数参考</div>
                <div class="kv-row"><span class="k">振动量级</span><span class="v">{{ currentWorkOrder?.level }}</span></div>
                <div class="kv-row"><span class="k">振动方向</span><span class="v">Z轴</span></div>
                <div class="kv-row"><span class="k">设备名称</span><span class="v">{{ currentWorkOrder?.device }}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="stage === 'testing'" class="panel-card test-panel-full">
        <div class="status-grid">
          <div class="status-box">
            <div class="status-header">⚡ 振动状态</div>
            <div class="status-row"><span class="label">振动量级</span><span class="value orange">{{ liveLevel }}</span></div>
            <div class="status-row mt-1"><span class="label">频率</span><span class="value cyan">{{ liveFreq }}</span></div>
          </div>
          <div class="status-box">
            <div class="status-header">📡 采集状态</div>
            <div class="status-row"><span class="label">已采集</span><span class="value green">{{ vibDataCount }} 条</span></div>
            <div class="status-row mt-1"><span class="label">测试时长</span><span class="value white">{{ formattedDuration }}</span></div>
          </div>
          <div class="status-box">
            <div class="status-header">⏱ 系统状态</div>
            <div class="status-row"><span class="label">测试状态</span><span class="badge" :class="isRunning ? 'badge-green' : 'badge-gray'">{{ isRunning ? '● 测试中' : '● 已暂停' }}</span></div>
            <div class="file-info">📁 {{ liveFileName }}</div>
          </div>
        </div>

        <div class="test-layout">
          <div class="card chart-card">
            <div class="card-header">
              <h3 class="card-title">📈 实时振动波形</h3>
              <div class="chart-legend">
                <span class="cyan">■ CH1 响应</span>
                <span class="amber">■ CH2 驱动</span>
              </div>
            </div>
            <div class="chart-body">
              <canvas id="test-osc-canvas" style="width:100%;height:100%;display:block"></canvas>
              <div class="camera-label">实时波形显示区域</div>
            </div>
          </div>

          <div class="side-info">
            <div class="card">
              <div class="card-header"><h3 class="card-title">📋 当前工单</h3></div>
              <div class="info-body">
                <div v-if="currentWorkOrder" class="wo-info">
                  <div>{{ currentWorkOrder.id }}</div>
                  <div class="sub">{{ currentWorkOrder.device }}</div>
                </div>
                <div v-else class="text-muted">未选择工单</div>
              </div>
            </div>
            <div class="card">
              <div class="card-header"><h3 class="card-title">📊 实时参数</h3></div>
              <div class="info-body">
                <div class="param-grid">
                  <div class="param-box"><div class="label">X轴加速度</div><div class="val red">{{ liveAx }}</div></div>
                  <div class="param-box"><div class="label">Y轴加速度</div><div class="val cyan">{{ liveAy }}</div></div>
                  <div class="param-box full"><div class="label">Z轴加速度</div><div class="val amber">{{ liveAz }}</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="test-controls">
          <button class="test-btn pause" v-if="isRunning" @click="emit('pause-vib-test')">⏸ 测试暂停</button>
          <button class="test-btn pause" v-else @click="emit('resume-vib-test')">▶ 继续测试</button>
          <button class="test-btn stop" @click="emit('open-abort-warning')">⏹ 测试中止</button>
          <button class="test-btn end" @click="emit('end-vib-test')">{{ testMode === 'pre' ? '预试验结束' : '测试结束' }}</button>
          <button class="test-btn end" v-if="testMode === 'pre'" @click="emit('convert-to-formal')">转入正式工单</button>
        </div>
      </div>

      <div v-else-if="stage === 'report'" class="modal-overlay">
        <div class="startup-check-modal" style="max-width: 700px; width: 95vw;">
          <div class="modal-header-simple">
            <h3>报告处理（{{ reportProgress }}%）</h3>
            <button class="modal-close-simple" @click="emit('set-stage-testing')">×</button>
          </div>
          <div class="content-pad">
            <div class="alert info" style="margin-bottom:12px">
              <Icon icon="mdi:information" class="alert-icon blue" />
              <div class="alert-text">点击“生成文件”后将依次生成 CSV/PNG/DOC，占位文件会自动下载以便保存。</div>
            </div>
            <div class="kv" style="margin-top:8px">
              <div class="k">{{ reportFiles[0].name }}</div><div class="v">{{ reportFiles[0].status }}</div>
              <div class="k">{{ reportFiles[1].name }}</div><div class="v">{{ reportFiles[1].status }}</div>
              <div class="k">{{ reportFiles[2].name }}</div><div class="v">{{ reportFiles[2].status }}</div>
            </div>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="emit('set-stage-testing')">返回测试</button>
            <button class="next-btn" :disabled="fileGenRunning" @click="emit('start-file-gen')">生成文件</button>
            <button class="next-btn" :disabled="!allFilesDone" @click="emit('set-stage-shutdown')">下一步：关机检查</button>
          </div>
        </div>
      </div>

      <div v-else class="modal-overlay">
        <div class="startup-check-modal" style="max-width: 700px; width: 95vw;">
          <h2 class="modal-title">关机检查</h2>
          <div class="check-list-container">
            <div class="check-list">
              <label
                v-for="item in shutdownChecks"
                :key="item.id"
                class="check-item"
                :class="{ 'is-checked': item.checked }"
              >
                <div class="checkbox-wrapper">
                  <input type="checkbox" :checked="item.checked" @change="emit('toggle-shutdown-check', item.id)" />
                  <div class="custom-checkbox">
                    <Icon v-if="item.checked" icon="mdi:check" />
                  </div>
                </div>
                <span class="check-text">{{ item.text }}</span>
              </label>
            </div>
          </div>
          <div class="modal-actions">
            <button class="cancel-btn" @click="emit('go-prev-stage')">上一步</button>
            <button class="next-btn" :disabled="!shutdownChecks.every(i => i.checked)" @click="emit('finish-shutdown')">完成并返回看板</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./vibration.shared.css"></style>
