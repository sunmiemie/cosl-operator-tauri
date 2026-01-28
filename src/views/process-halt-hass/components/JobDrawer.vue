<script setup lang="ts">
/**
 * HALT-HASS 工作抽屉组件
 * 包含：我的待处理、待完成编辑两个 Tab
 */
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { HaltHassJob } from '../types'

// 暂存项类型
interface TempItem {
  fileName: string
  name: string
  version: string
  mode: string
  processId?: number
}

// 定义 props
interface Props {
  visible: boolean
  myJobData: HaltHassJob[]
  tempProcessData: TempItem[]
}

const props = defineProps<Props>()

// 定义 emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'submit-process': [id: number]
  'edit-process': [row: HaltHassJob]
  'delete-process': [id: number]
  'continue-edit': [row: TempItem]
  'delete-temp': [fileName: string]
}>()

// 当前Tab
const activeTab = ref<'myjob' | 'temp'>('myjob')

// 待处理数量
const myJobCount = computed(() => props.myJobData.length)
const tempCount = computed(() => props.tempProcessData.length)

// 关闭抽屉
function closeDrawer() {
  emit('update:visible', false)
}

// 获取状态标签
function getStatusTag(status: number) {
  switch (status) {
    case 0:
      return { text: '已创建', type: 'primary' }
    case 1:
      return { text: '待审核', type: 'warning' }
    case 2:
      return { text: '待修改', type: 'error' }
    case 3:
      return { text: '可使用', type: 'success' }
    default:
      return { text: '未知', type: 'default' }
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="visible" class="drawer-overlay" @click.self="closeDrawer">
        <div class="drawer-container">
          <!-- 标题栏 -->
          <div class="drawer-header">
            <h3 class="drawer-title">
              <Icon icon="mdi:briefcase-outline" />
              工作列表
            </h3>
            <button class="close-btn" @click="closeDrawer">
              <Icon icon="mdi:close" />
            </button>
          </div>

          <!-- Tabs -->
          <div class="drawer-tabs">
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'myjob' }"
              @click="activeTab = 'myjob'"
            >
              <Icon icon="mdi:clipboard-list-outline" />
              <span>我的待处理</span>
              <span v-if="myJobCount > 0" class="badge">{{ myJobCount }}</span>
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'temp' }"
              @click="activeTab = 'temp'"
            >
              <Icon icon="mdi:file-clock-outline" />
              <span>待完成编辑</span>
              <span v-if="tempCount > 0" class="badge warning">{{ tempCount }}</span>
            </button>
          </div>

          <!-- 内容区 -->
          <div class="drawer-content">
            <!-- 我的待处理 -->
            <div v-if="activeTab === 'myjob'" class="tab-content">
              <div v-if="myJobData.length === 0" class="empty-state">
                <Icon icon="mdi:clipboard-check-outline" class="empty-icon" />
                <span>暂无需要处理的工作</span>
              </div>

              <div v-else class="job-list">
                <div
                  v-for="item in myJobData"
                  :key="item.id"
                  class="job-item"
                >
                  <div class="job-info">
                    <div class="job-header">
                      <span class="job-name">{{ item.name }}</span>
                      <span
                        class="status-tag"
                        :class="getStatusTag(item.status).type"
                      >
                        {{ getStatusTag(item.status).text }}
                      </span>
                    </div>
                    <div class="job-meta">
                      <span class="meta-item">
                        <Icon icon="mdi:identifier" />
                        ID: {{ item.id }}
                      </span>
                      <span class="meta-item">
                        <Icon icon="mdi:tag-outline" />
                        V{{ item.version }}
                      </span>
                      <span v-if="item.boardGroups.length > 0" class="meta-item">
                        <Icon icon="mdi:chip" />
                        {{ item.boardGroups.map(g => g.name).join(', ') }}
                      </span>
                    </div>
                    <!-- 审核反馈 -->
                    <div v-if="item.feedback && item.feedback.length > 0" class="feedback-section">
                      <div class="feedback-label">
                        <Icon icon="mdi:comment-alert-outline" />
                        审核反馈:
                      </div>
                      <div class="feedback-content">
                        {{ item.feedback[item.feedback.length - 1] }}
                      </div>
                    </div>
                  </div>

                  <div class="job-actions">
                    <button
                      v-if="item.status === 0 || item.status === 2"
                      class="action-btn primary"
                      title="提交审核"
                      @click="$emit('submit-process', item.id)"
                    >
                      <Icon icon="mdi:send-outline" />
                    </button>
                    <button
                      v-if="item.status === 0 || item.status === 2"
                      class="action-btn"
                      title="编辑"
                      @click="$emit('edit-process', item)"
                    >
                      <Icon icon="mdi:pencil-outline" />
                    </button>
                    <button
                      v-if="item.status === 0"
                      class="action-btn danger"
                      title="删除"
                      @click="$emit('delete-process', item.id)"
                    >
                      <Icon icon="mdi:delete-outline" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 待完成编辑 -->
            <div v-if="activeTab === 'temp'" class="tab-content">
              <div v-if="tempProcessData.length === 0" class="empty-state">
                <Icon icon="mdi:file-document-outline" class="empty-icon" />
                <span>暂无暂存的工艺</span>
              </div>

              <div v-else class="job-list">
                <div
                  v-for="item in tempProcessData"
                  :key="item.fileName"
                  class="job-item"
                >
                  <div class="job-info">
                    <div class="job-header">
                      <span class="job-name">{{ item.name }}</span>
                      <span
                        class="status-tag"
                        :class="item.mode === '编辑' ? 'primary' : 'warning'"
                      >
                        {{ item.mode }}{{ item.processId ? `[${item.processId}]` : '' }}
                      </span>
                    </div>
                    <div class="job-meta">
                      <span class="meta-item">
                        <Icon icon="mdi:tag-outline" />
                        V{{ item.version }}
                      </span>
                      <span class="meta-item">
                        <Icon icon="mdi:thermometer-alert" />
                        HALT-HASS 工艺
                      </span>
                    </div>
                  </div>

                  <div class="job-actions">
                    <button
                      class="action-btn primary"
                      title="继续编辑"
                      @click="$emit('continue-edit', item)"
                    >
                      <Icon icon="mdi:play-outline" />
                    </button>
                    <button
                      class="action-btn danger"
                      title="删除"
                      @click="$emit('delete-temp', item.fileName)"
                    >
                      <Icon icon="mdi:delete-outline" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  top: 36px;
  left: 0;
  right: 0;
  bottom: 28px;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: flex-end;
  z-index: 1000;
}

.drawer-container {
  width: 520px;
  max-width: 90vw;
  height: 100%;
  background: var(--color-bg-primary, #fff);
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border, #e2e8f0);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.drawer-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
  margin: 0;
}

.drawer-title :deep(svg) {
  font-size: 22px;
  color: var(--color-primary, #3b82f6);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--color-bg-tertiary, #f1f5f9);
  color: var(--color-text-primary, #1e293b);
}

.drawer-tabs {
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: none;
  background: var(--color-bg-secondary, #f8fafc);
  color: var(--color-text-secondary, #64748b);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: var(--color-bg-tertiary, #f1f5f9);
}

.tab-btn.active {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
}

.tab-btn:not(.active) .badge {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.badge.warning {
  background: var(--color-warning, #f59e0b);
}

.drawer-content {
  flex: 1;
  overflow: hidden;
}

.tab-content {
  height: 100%;
  overflow-y: auto;
  padding: 16px 24px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 20px;
  color: var(--color-text-tertiary, #94a3b8);
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.job-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.job-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px;
  background: var(--color-bg-secondary, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 10px;
  transition: all 0.2s;
}

.job-item:hover {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 2px 12px rgba(59, 130, 246, 0.1);
}

.job-info {
  flex: 1;
  min-width: 0;
}

.job-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.job-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.status-tag.primary {
  background: rgba(59, 130, 246, 0.15);
  color: var(--color-primary, #3b82f6);
}

.status-tag.warning {
  background: rgba(245, 158, 11, 0.15);
  color: var(--color-warning, #f59e0b);
}

.status-tag.error {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.status-tag.success {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.job-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--color-text-tertiary, #94a3b8);
}

.feedback-section {
  margin-top: 10px;
  padding: 10px;
  background: rgba(239, 68, 68, 0.05);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 6px;
}

.feedback-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: #ef4444;
  margin-bottom: 4px;
}

.feedback-content {
  font-size: 13px;
  color: var(--color-text-secondary, #64748b);
  line-height: 1.5;
}

.job-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  margin-left: 16px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: var(--color-bg-tertiary, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--color-bg-primary, #fff);
  color: var(--color-text-primary, #1e293b);
}

.action-btn.primary {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.action-btn.primary:hover {
  background: #2563eb;
}

.action-btn.danger:hover {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

/* 动画 */
.drawer-enter-active,
.drawer-leave-active {
  transition: all 0.3s ease;
}

.drawer-enter-active .drawer-container,
.drawer-leave-active .drawer-container {
  transition: transform 0.3s ease;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

.drawer-enter-from .drawer-container,
.drawer-leave-to .drawer-container {
  transform: translateX(100%);
}
</style>
