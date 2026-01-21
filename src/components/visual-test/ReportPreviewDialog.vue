<script setup lang="ts">
/**
 * 报告预览对话框
 * 
 * 支持两种模式:
 * - prod: 正式报告 (包含 2D/3D/弓曲度/X-Ray)
 * - temp: 临时报告 (包含 tempTest 列表)
 * 
 * 参考原程序 ReportPreviewDialog.vue
 */
import { ref, computed, watch, Teleport } from 'vue'
import { Icon } from '@iconify/vue'
import type { ReportData } from '@/services/report'

// Props
const props = withDefaults(defineProps<{
  visible: boolean
  data: ReportData | null
  mode: 'prod' | 'temp'
  loading?: boolean
}>(), {
  loading: false
})

// Emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

// 临时隐藏状态 (Ctrl+Q 切换)
const tempHide = ref(false)

// 图片查看器
const viewerVisible = ref(false)
const viewerUrl = ref('')

// 计算属性: 对话框是否显示
const dialogVisible = computed({
  get: () => props.visible && !tempHide.value,
  set: (val) => emit('update:visible', val)
})

// 打开图片查看器
function openViewer(url: string) {
  viewerUrl.value = url
  viewerVisible.value = true
}

// 关闭对话框
function handleClose() {
  emit('update:visible', false)
  tempHide.value = false
}

// 快捷键切换隐藏
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'q' && e.ctrlKey) {
    tempHide.value = !tempHide.value
  }
}

// 监听显示状态，绑定/解绑快捷键
watch(() => props.visible, (visible) => {
  if (visible) {
    window.addEventListener('keydown', handleKeydown)
  } else {
    window.removeEventListener('keydown', handleKeydown)
    tempHide.value = false
  }
}, { immediate: true })

// 获取状态样式类
function getPassClass(pass: number): string {
  if (pass === 1) return 'pass'
  if (pass === 2) return 'fail'
  if (pass === 3) return 'question'
  if (pass === 4) return 'mixed'
  return ''
}

// 获取状态文本
function getPassText(pass: number): string {
  if (pass === 1) return '通过'
  if (pass === 2) return '缺陷'
  if (pass === 3) return '疑问'
  if (pass === 4) return '缺陷+疑问'
  return '未知'
}
</script>

<template>
  <Teleport to="body">
    <!-- 临时隐藏时的恢复按钮 -->
    <div v-if="visible && tempHide" class="restore-btn" @click="tempHide = false">
      <Icon icon="mdi:history" />
    </div>

    <!-- 主对话框 -->
    <div v-if="dialogVisible" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog-container">
        <!-- 头部 -->
        <div class="dialog-header">
          <div class="header-left">
            <Icon icon="mdi:file-document" class="header-icon" />
            <span class="header-title">报告详情</span>
            <span v-if="mode === 'temp'" class="mode-badge temp">临时报告</span>
            <span v-else class="mode-badge prod">正式报告</span>
          </div>
          <div class="header-right">
            <button class="btn-icon" @click="tempHide = true" title="临时隐藏 (Ctrl+Q)">
              <Icon icon="mdi:arrow-collapse" />
            </button>
            <button class="btn-icon close" @click="handleClose" title="关闭">
              <Icon icon="mdi:close" />
            </button>
          </div>
        </div>

        <!-- 内容 -->
        <div class="dialog-body">
          <!-- 加载状态 -->
          <div v-if="loading" class="loading-state">
            <Icon icon="mdi:loading" class="loading-icon" />
            <span>加载中...</span>
          </div>

          <!-- 无数据 -->
          <div v-else-if="!data" class="empty-state">
            <Icon icon="mdi:file-question" />
            <span>暂无报告数据</span>
          </div>

          <!-- 报告内容 -->
          <div v-else class="report-content">
            <!-- 基本信息 -->
            <div class="info-section">
              <div class="info-row">
                <span class="info-label">工单号:</span>
                <span class="info-value">{{ data.testunit_id || data.dev_testunit_id || '-' }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">序列号:</span>
                <span class="info-value">{{ data.board_serialnumber || '-' }}</span>
              </div>
            </div>

            <!-- 临时报告: tempTest 列表 -->
            <template v-if="mode === 'temp' && data.json?.tempTest">
              <div class="section">
                <div class="section-header">
                  <Icon icon="mdi:clipboard-list" />
                  <span>检测项目</span>
                </div>
                <div class="temp-list">
                  <div 
                    v-for="item in data.json.tempTest" 
                    :key="item.id"
                    class="temp-item"
                    :class="getPassClass(item.pass)"
                  >
                    <div class="item-header">
                      <span class="item-name">{{ item.name }}</span>
                      <span class="item-status" :class="getPassClass(item.pass)">
                        {{ getPassText(item.pass) }}
                        <span v-if="(item as any).warn" class="warn-badge">制程警示</span>
                      </span>
                    </div>
                    <div v-if="item.desc" class="item-desc">{{ item.desc }}</div>
                    
                    <!-- 留存图片 -->
                    <div v-if="item.save?.length" class="item-images">
                      <span class="images-label">留存图片:</span>
                      <div class="images-grid">
                        <img 
                          v-for="(img, idx) in item.save" 
                          :key="idx"
                          :src="img"
                          alt=""
                          @click="openViewer(img)"
                        />
                      </div>
                    </div>

                    <!-- 缺陷信息 -->
                    <div v-if="item.error?.url?.length" class="item-images error">
                      <span class="images-label">缺陷图片:</span>
                      <div v-if="item.error.desc" class="error-desc">{{ item.error.desc }}</div>
                      <div class="images-grid">
                        <img 
                          v-for="(img, idx) in item.error.url" 
                          :key="idx"
                          :src="img"
                          alt=""
                          @click="openViewer(img)"
                        />
                      </div>
                    </div>

                    <!-- 疑问信息 -->
                    <div v-if="item.question?.url?.length" class="item-images question">
                      <span class="images-label">疑问图片:</span>
                      <div v-if="item.question.desc" class="question-desc">{{ item.question.desc }}</div>
                      <div class="images-grid">
                        <img 
                          v-for="(img, idx) in item.question.url" 
                          :key="idx"
                          :src="img"
                          alt=""
                          @click="openViewer(img)"
                        />
                      </div>
                    </div>

                    <!-- 制程警示信息 -->
                    <div v-if="(item as any).warn?.url?.length" class="item-images warn">
                      <span class="images-label">制程警示图片:</span>
                      <div v-if="(item as any).warn.desc" class="warn-desc">{{ (item as any).warn.desc }}</div>
                      <div class="images-grid">
                        <img 
                          v-for="(img, idx) in (item as any).warn.url" 
                          :key="idx"
                          :src="img"
                          alt=""
                          @click="openViewer(img)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- 正式报告: 2D 留存 -->
            <template v-if="mode === 'prod' && data.json?.twoD">
              <div class="section">
                <div class="section-header">
                  <Icon icon="mdi:camera" />
                  <span>2D 留存</span>
                </div>
                <div class="twoD-images">
                  <div class="twoD-item">
                    <span class="side-label">正面</span>
                    <img :src="data.json.twoD" alt="正面" @click="openViewer(data.json.twoD!)" />
                  </div>
                  <div v-if="data.json.twoDBak" class="twoD-item">
                    <span class="side-label">背面</span>
                    <img :src="data.json.twoDBak" alt="背面" @click="openViewer(data.json.twoDBak!)" />
                  </div>
                </div>
              </div>
            </template>

            <!-- 正式报告: 弓曲度检测 -->
            <template v-if="mode === 'prod' && data.json?.plane?.leftUrl">
              <div class="section">
                <div class="section-header">
                  <Icon icon="mdi:chart-bell-curve" />
                  <span>弓曲度检测</span>
                </div>
                <div class="plane-content">
                  <div class="plane-results">
                    <div class="plane-item" :class="getPassClass(data.json.plane.leftPass || 0)">
                      <span class="plane-label">正面弓曲度</span>
                      <span class="plane-status">{{ getPassText(data.json.plane.leftPass || 0) }}</span>
                    </div>
                    <div class="plane-item" :class="getPassClass(data.json.plane.rightPass || 0)">
                      <span class="plane-label">对面弓曲度</span>
                      <span class="plane-status">{{ getPassText(data.json.plane.rightPass || 0) }}</span>
                    </div>
                  </div>
                  <div class="plane-images">
                    <img :src="data.json.plane.leftUrl" alt="正面" @click="openViewer(data.json.plane.leftUrl)" />
                    <img :src="data.json.plane.rightUrl" alt="对面" @click="openViewer(data.json.plane.rightUrl)" />
                  </div>
                </div>
              </div>
            </template>

            <!-- 正式报告: 3D 检测 -->
            <template v-if="mode === 'prod' && data.json?.threeD?.eyes">
              <div class="section">
                <div class="section-header">
                  <Icon icon="mdi:cube-scan" />
                  <span>3D 检测 - 正面</span>
                </div>
                <div class="threeD-content">
                  <!-- 整体检测 -->
                  <div v-if="data.json.threeD.eyes.total?.stepList?.length" class="subsection">
                    <div class="subsection-title">整体检测</div>
                    <div class="step-list">
                      <div 
                        v-for="step in data.json.threeD.eyes.total.stepList" 
                        :key="(step as any).id"
                        class="step-item"
                        :class="getPassClass((step as any).pass)"
                      >
                        <span class="step-name">{{ (step as any).name }}</span>
                        <span class="step-status">{{ getPassText((step as any).pass) }}</span>
                      </div>
                    </div>
                  </div>
                  <!-- 区域检测 -->
                  <div v-for="area in data.json.threeD.eyes.area" :key="(area as any).id" class="subsection">
                    <div class="subsection-title">区域 {{ (area as any).id }} - {{ (area as any).name }}</div>
                    <!-- 区域内容省略，结构类似 -->
                  </div>
                </div>
              </div>

              <!-- 3D 背面 -->
              <div v-if="data.json.threeD.eyesBak?.total" class="section">
                <div class="section-header">
                  <Icon icon="mdi:cube-scan" />
                  <span>3D 检测 - 背面</span>
                </div>
                <div class="threeD-content">
                  <div v-if="data.json.threeD.eyesBak.total?.stepList?.length" class="subsection">
                    <div class="subsection-title">整体检测</div>
                    <div class="step-list">
                      <div 
                        v-for="step in data.json.threeD.eyesBak.total.stepList" 
                        :key="(step as any).id"
                        class="step-item"
                        :class="getPassClass((step as any).pass)"
                      >
                        <span class="step-name">{{ (step as any).name }}</span>
                        <span class="step-status">{{ getPassText((step as any).pass) }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- 正式报告: X-Ray 检测 -->
            <template v-if="mode === 'prod' && data.json?.xray">
              <div class="section">
                <div class="section-header">
                  <Icon icon="mdi:radioactive" />
                  <span>X-Ray 检测</span>
                </div>
                <div class="xray-content">
                  <!-- 整体检测 -->
                  <div v-if="data.json.xray.total?.stepList?.length" class="subsection">
                    <div class="subsection-title">整体检测</div>
                    <div class="step-list">
                      <div 
                        v-for="step in data.json.xray.total.stepList" 
                        :key="(step as any).id"
                        class="step-item"
                        :class="getPassClass((step as any).pass)"
                      >
                        <span class="step-name">{{ (step as any).name }}</span>
                        <span class="step-status">{{ getPassText((step as any).pass) }}</span>
                      </div>
                    </div>
                  </div>
                  <!-- 区域检测 -->
                  <div v-for="area in data.json.xray.area" :key="(area as any).id" class="subsection">
                    <div class="subsection-title">区域 {{ (area as any).id }} - {{ (area as any).name }}</div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 图片查看器 -->
    <div v-if="viewerVisible" class="viewer-overlay" @click="viewerVisible = false">
      <div class="viewer-content" @click.stop>
        <img :src="viewerUrl" alt="" />
        <button class="viewer-close" @click="viewerVisible = false">
          <Icon icon="mdi:close" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 恢复按钮 */
.restore-btn {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 10000;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary, rgb(59, 130, 246));
  color: white;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.25rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
}

.restore-btn:hover {
  transform: scale(1.1);
}

/* 对话框遮罩 */
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

/* 对话框容器 */
.dialog-container {
  width: 80vw;
  max-width: 1200px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg, #1a1a2e);
  border: 1px solid var(--color-border, #2a2a4a);
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}

/* 头部 */
.dialog-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: var(--color-bg-secondary, #252542);
  border-bottom: 1px solid var(--color-border, #2a2a4a);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon {
  font-size: 1.5rem;
  color: var(--color-primary, rgb(59, 130, 246));
}

.header-title {
  font-size: 1.125rem;
  font-weight: 600;
}

.mode-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 1rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.mode-badge.prod {
  background: rgba(59, 130, 246, 0.2);
  color: rgb(96, 165, 250);
}

.mode-badge.temp {
  background: rgba(245, 158, 11, 0.2);
  color: rgb(251, 191, 36);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-icon {
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--color-text-secondary, #9ca3af);
  cursor: pointer;
  transition: all 0.15s;
}

.btn-icon:hover {
  background: var(--color-bg-hover, rgba(255, 255, 255, 0.1));
  color: var(--color-text-primary, #ffffff);
}

.btn-icon.close:hover {
  background: rgba(239, 68, 68, 0.2);
  color: rgb(248, 113, 113);
}

/* 内容区 */
.dialog-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

/* 加载/空状态 */
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 4rem 2rem;
  color: var(--color-text-secondary, #9ca3af);
  font-size: 1rem;
}

.loading-icon {
  font-size: 2rem;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 基本信息 */
.info-section {
  display: flex;
  gap: 2rem;
  padding: 1rem;
  background: var(--color-bg-secondary, #252542);
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.info-label {
  color: var(--color-text-secondary, #9ca3af);
  font-size: 0.875rem;
}

.info-value {
  font-weight: 500;
  font-family: monospace;
}

/* 区块 */
.section {
  margin-bottom: 1.5rem;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary, #252542);
  border-radius: 0.5rem 0.5rem 0 0;
  border: 1px solid var(--color-border, #2a2a4a);
  border-bottom: none;
  font-weight: 500;
}

/* 临时报告列表 */
.temp-list {
  border: 1px solid var(--color-border, #2a2a4a);
  border-radius: 0 0 0.5rem 0.5rem;
}

.temp-item {
  padding: 1rem;
  border-bottom: 1px solid var(--color-border, #2a2a4a);
}

.temp-item:last-child {
  border-bottom: none;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.item-name {
  font-weight: 500;
}

.item-status {
  padding: 0.25rem 0.75rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.item-status.pass { background: rgba(34, 197, 94, 0.2); color: rgb(74, 222, 128); }
.item-status.fail { background: rgba(239, 68, 68, 0.2); color: rgb(248, 113, 113); }
.item-status.question { background: rgba(249, 115, 22, 0.2); color: rgb(251, 146, 60); }
.item-status.mixed { background: rgba(139, 92, 246, 0.2); color: rgb(167, 139, 250); }

.warn-badge {
  margin-left: 0.5rem;
  padding: 0.125rem 0.5rem;
  background: rgba(245, 158, 11, 0.2);
  color: rgb(251, 191, 36);
  border-radius: 0.25rem;
  font-size: 0.625rem;
}

.item-desc {
  color: var(--color-text-secondary, #9ca3af);
  font-size: 0.875rem;
  margin-bottom: 0.75rem;
}

.item-images {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--color-border, #2a2a4a);
}

.images-label {
  display: block;
  font-size: 0.75rem;
  color: var(--color-text-secondary, #9ca3af);
  margin-bottom: 0.5rem;
}

.item-images.error .images-label { color: rgb(248, 113, 113); }
.item-images.question .images-label { color: rgb(251, 146, 60); }
.item-images.warn .images-label { color: rgb(251, 191, 36); }

.error-desc,
.question-desc,
.warn-desc {
  font-size: 0.8125rem;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0.25rem;
}

.images-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.images-grid img {
  width: 100px;
  height: 100px;
  object-fit: cover;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: transform 0.15s;
}

.images-grid img:hover {
  transform: scale(1.05);
}

/* 2D 留存 */
.twoD-images {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--color-border, #2a2a4a);
  border-radius: 0 0 0.5rem 0.5rem;
}

.twoD-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.side-label {
  font-size: 0.875rem;
  color: var(--color-text-secondary, #9ca3af);
}

.twoD-item img {
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
  border-radius: 0.375rem;
  cursor: pointer;
}

/* 弓曲度检测 */
.plane-content {
  padding: 1rem;
  border: 1px solid var(--color-border, #2a2a4a);
  border-radius: 0 0 0.5rem 0.5rem;
}

.plane-results {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.plane-item {
  flex: 1;
  display: flex;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: var(--color-bg-secondary, #252542);
  border-radius: 0.375rem;
}

.plane-item.pass { border-left: 3px solid rgb(34, 197, 94); }
.plane-item.fail { border-left: 3px solid rgb(239, 68, 68); }
.plane-item.question { border-left: 3px solid rgb(249, 115, 22); }

.plane-status {
  font-weight: 500;
}

.plane-item.pass .plane-status { color: rgb(74, 222, 128); }
.plane-item.fail .plane-status { color: rgb(248, 113, 113); }
.plane-item.question .plane-status { color: rgb(251, 146, 60); }

.plane-images {
  display: flex;
  gap: 1rem;
  justify-content: center;
}

.plane-images img {
  max-width: 45%;
  max-height: 250px;
  object-fit: contain;
  border-radius: 0.375rem;
  cursor: pointer;
}

/* 3D/X-Ray 内容 */
.threeD-content,
.xray-content {
  padding: 1rem;
  border: 1px solid var(--color-border, #2a2a4a);
  border-radius: 0 0 0.5rem 0.5rem;
}

.subsection {
  margin-bottom: 1rem;
}

.subsection:last-child {
  margin-bottom: 0;
}

.subsection-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text-secondary, #9ca3af);
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px dashed var(--color-border, #2a2a4a);
}

.step-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.step-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--color-bg-tertiary, rgba(255, 255, 255, 0.03));
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.step-item.pass { border-left: 2px solid rgb(34, 197, 94); }
.step-item.fail { border-left: 2px solid rgb(239, 68, 68); }
.step-item.question { border-left: 2px solid rgb(249, 115, 22); }
.step-item.mixed { border-left: 2px solid rgb(139, 92, 246); }

.step-status {
  font-weight: 500;
}

.step-item.pass .step-status { color: rgb(74, 222, 128); }
.step-item.fail .step-status { color: rgb(248, 113, 113); }
.step-item.question .step-status { color: rgb(251, 146, 60); }
.step-item.mixed .step-status { color: rgb(167, 139, 250); }

/* 图片查看器 */
.viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.95);
}

.viewer-content {
  position: relative;
  max-width: 90vw;
  max-height: 90vh;
}

.viewer-content img {
  max-width: 100%;
  max-height: 90vh;
  object-fit: contain;
}

.viewer-close {
  position: absolute;
  top: -2.5rem;
  right: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  font-size: 1.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.viewer-close:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 滚动条 */
.dialog-body::-webkit-scrollbar {
  width: 8px;
}

.dialog-body::-webkit-scrollbar-track {
  background: transparent;
}

.dialog-body::-webkit-scrollbar-thumb {
  background: var(--color-border, #2a2a4a);
  border-radius: 4px;
}

.dialog-body::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-secondary, #4a5568);
}
</style>
