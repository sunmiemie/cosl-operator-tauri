<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'

interface ProcessStep {
  id: number
  name: string
  desc: string
  pass: number
}

interface ProcessPic {
  id: number
  url: string
  name: string
  desc: string
  save: string[]
}

interface DetailItem {
  id: number
  name: string
  url: string
  step: ProcessStep[]
  pic: ProcessPic[]
}

interface AreaItem {
  id: number
  url: string
  general: {
    step: ProcessStep[]
    pic: ProcessPic[]
  }
  detail: DetailItem[]
}

interface ProcessTotal {
  url: string
  step: ProcessStep[]
  pic: ProcessPic[]
}

interface ProcessData {
  plane?: { size: string }
  total: ProcessTotal
  area: AreaItem[]
}

interface Props {
  data: ProcessData
  hasPlane?: boolean
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  hasPlane: false,
  title: '流程预览'
})

// 当前选中的分区
const selectedArea = ref<number | null>(null)

// 统计信息
const stats = computed(() => {
  const totalSteps = props.data.total.step.length
  const totalPics = props.data.total.pic.length
  const areaCount = props.data.area.length
  
  let areaSteps = 0
  let areaPics = 0
  let detailCount = 0
  
  props.data.area.forEach(area => {
    areaSteps += area.general.step.length
    areaPics += area.general.pic.length
    detailCount += area.detail.length
  })
  
  return {
    totalSteps,
    totalPics,
    areaCount,
    areaSteps,
    areaPics,
    detailCount
  }
})
</script>

<template>
  <div class="process-preview">
    <!-- 头部统计 -->
    <div class="preview-header">
      <div class="header-title">
        <Icon icon="mdi:chart-tree" />
        <span>{{ title }}</span>
      </div>
      
      <div class="stats-row">
        <div class="stat-item">
          <div class="stat-icon blue">
            <Icon icon="mdi:clipboard-check-outline" />
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ stats.totalSteps }}</span>
            <span class="stat-label">整体检测项</span>
          </div>
        </div>
        
        <div class="stat-item">
          <div class="stat-icon purple">
            <Icon icon="mdi:image-multiple-outline" />
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ stats.totalPics }}</span>
            <span class="stat-label">整体留存项</span>
          </div>
        </div>
        
        <div class="stat-item">
          <div class="stat-icon green">
            <Icon icon="mdi:grid" />
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ stats.areaCount }}</span>
            <span class="stat-label">分区数量</span>
          </div>
        </div>
        
        <div class="stat-item">
          <div class="stat-icon orange">
            <Icon icon="mdi:format-list-checks" />
          </div>
          <div class="stat-info">
            <span class="stat-value">{{ stats.areaSteps + stats.areaPics }}</span>
            <span class="stat-label">分区检测项</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 弓曲度检查 -->
    <div v-if="hasPlane && data.plane" class="plane-section">
      <div class="section-title">
        <Icon icon="mdi:ruler-square" />
        <span>弓曲度检查</span>
      </div>
      <div class="plane-content">
        <span class="plane-label">电路板厚度:</span>
        <span class="plane-value">{{ data.plane.size || '未设置' }} mm</span>
      </div>
    </div>

    <!-- 整体示意图 -->
    <div class="total-section">
      <div class="section-title">
        <Icon icon="mdi:image-outline" />
        <span>整体示意图</span>
      </div>
      <div class="total-image">
        <img v-if="data.total.url" :src="data.total.url" alt="整体示意图" />
        <div v-else class="no-image">
          <Icon icon="mdi:image-off-outline" />
          <span>暂无图片</span>
        </div>
      </div>
    </div>

    <!-- 整体检测项 -->
    <div v-if="data.total.step.length > 0" class="steps-section">
      <div class="section-title">
        <Icon icon="mdi:clipboard-list-outline" />
        <span>整体检测项 ({{ data.total.step.length }})</span>
      </div>
      <div class="steps-list">
        <div v-for="step in data.total.step" :key="step.id" class="step-item">
          <div class="step-number">{{ step.id }}</div>
          <div class="step-content">
            <div class="step-name">{{ step.name || '未命名' }}</div>
            <div v-if="step.desc" class="step-desc">{{ step.desc }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分区列表 -->
    <div v-if="data.area.length > 0" class="areas-section">
      <div class="section-title">
        <Icon icon="mdi:grid-large" />
        <span>分区流程 ({{ data.area.length }})</span>
      </div>
      
      <div class="areas-grid">
        <div 
          v-for="area in data.area" 
          :key="area.id" 
          class="area-item"
          :class="{ expanded: selectedArea === area.id }"
          @click="selectedArea = selectedArea === area.id ? null : area.id"
        >
          <div class="area-header">
            <div class="area-preview">
              <img v-if="area.url" :src="area.url" alt="分区" />
              <Icon v-else icon="mdi:grid" />
            </div>
            <div class="area-info">
              <span class="area-title">第 {{ area.id }} 分区</span>
              <span class="area-stats">
                {{ area.general.step.length }} 检测项 · 
                {{ area.general.pic.length }} 留存项 · 
                {{ area.detail.length }} 点位
              </span>
            </div>
            <Icon 
              :icon="selectedArea === area.id ? 'mdi:chevron-up' : 'mdi:chevron-down'" 
              class="expand-icon"
            />
          </div>
          
          <!-- 分区详情 -->
          <Transition name="expand">
            <div v-if="selectedArea === area.id" class="area-detail">
              <div v-if="area.general.step.length > 0" class="detail-group">
                <div class="detail-title">检测项</div>
                <div class="detail-list">
                  <div v-for="step in area.general.step" :key="step.id" class="detail-item">
                    <span class="detail-num">{{ step.id }}</span>
                    <span class="detail-name">{{ step.name || '未命名' }}</span>
                  </div>
                </div>
              </div>
              
              <div v-if="area.detail.length > 0" class="detail-group">
                <div class="detail-title">具体点位</div>
                <div class="detail-list">
                  <div v-for="detail in area.detail" :key="detail.id" class="detail-item">
                    <span class="detail-num">{{ detail.id }}</span>
                    <span class="detail-name">{{ detail.name || '未命名点位' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.process-preview {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.preview-header {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.stat-item {
  border: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-radius: 12px;
}

.stat-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  font-size: 22px;
}

.stat-icon.blue {
  background: rgba(88, 166, 255, 0.15);
  color: var(--color-accent-blue);
}

.stat-icon.purple {
  background: rgba(168, 85, 247, 0.15);
  color: var(--color-accent-purple);
}

.stat-icon.green {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.stat-icon.orange {
  background: rgba(249, 115, 22, 0.15);
  color: #f97316;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 12px;
}

.plane-section {
  border: 1px solid var(--color-border);
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-radius: 12px;
}

.plane-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
}

.plane-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.plane-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-accent-blue);
}

.total-section {
  border: 1px solid var(--color-border);
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-radius: 12px;
}

.total-image {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  background: var(--color-bg-secondary);
  border-radius: 10px;
  overflow: hidden;
}

.total-image img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.no-image {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.no-image .iconify {
  font-size: 48px;
  opacity: 0.5;
}

.steps-section {
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-radius: 12px;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--color-bg-secondary);
  border-radius: 8px;
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--color-accent-blue);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.step-content {
  flex: 1;
  min-width: 0;
}

.step-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
}

.step-desc {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 4px;
}
.areas-section {

  border: 1px solid var(--color-border);
  padding: 16px;
  background: var(--color-bg-tertiary);
  border-radius: 12px;
}

.areas-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.area-item {
  background: var(--color-bg-secondary);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;
}

.area-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.area-item.expanded {
  border: 1px solid var(--color-accent-blue);
}

.area-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
}

.area-preview {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--color-bg-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: var(--color-text-tertiary);
}

.area-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.area-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.area-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.area-stats {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.expand-icon {
  font-size: 20px;
  color: var(--color-text-tertiary);
  transition: transform 0.2s ease;
}

.area-detail {
  padding: 0 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-group {
  padding: 12px;
  background: var(--color-bg-tertiary);
  border-radius: 8px;
}

.detail-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.detail-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: var(--color-bg-secondary);
  border-radius: 6px;
}

.detail-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  background: var(--color-accent-purple);
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  color: white;
}

.detail-name {
  font-size: 13px;
  color: var(--color-text-primary);
}

/* 展开动画 */
.expand-enter-active,
.expand-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 500px;
}
</style>
