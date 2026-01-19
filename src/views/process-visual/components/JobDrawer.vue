<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'

// 定义 props
interface Props {
  visible: boolean
  myJobData: any[]
  tempProcessData: any[]
  processType: 'eyes' | 'xray'
}

const props = defineProps<Props>()

// 定义 emits
const emit = defineEmits<{
  'update:visible': [value: boolean]
  'submit-process': [id: number]
  'edit-process': [row: any]
  'delete-process': [id: number]
  'continue-edit': [row: any]
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

// 获取测试类型
function getTestType(testtypeId: number) {
  return testtypeId === 2 || testtypeId === 3 || testtypeId === 4 ? '目检测试' : 'X-Ray测试'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="visible" class="drawer-overlay" @click.self="closeDrawer">
        <div class="drawer-container">
          <!-- 标题栏 -->
          <div class="drawer-header">
            <h3 class="drawer-title">工作列表</h3>
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
                      <span class="meta-item">
                        <Icon icon="mdi:test-tube" />
                        {{ getTestType(item.testtypeId) }}
                      </span>
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
                        <Icon icon="mdi:test-tube" />
                        {{ item.type === 'eyes' ? '目检测试' : 'X-Ray测试' }}
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
  top: 36px; /* header高度 */
  left: 0;
  right: 0;
  bottom: 28px; /* footer高度 */
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: flex-end;
}

.drawer-container {
  width: 520px;
  max-width: 90vw;
  height: 100%;
  background: var(--color-bg-primary);
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}

.drawer-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.drawer-tabs {
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: none;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: var(--color-bg-tertiary);
}

.tab-btn.active {
  background: var(--color-accent-blue);
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
  background: var(--color-accent-blue);
  color: white;
}

.badge.warning {
  background: var(--color-accent-orange);
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
  color: var(--color-text-tertiary);
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
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  transition: all 0.2s;
}

.job-item:hover {
  border-color: var(--color-accent-blue);
  box-shadow: 0 2px 12px rgba(88, 166, 255, 0.1);
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
  color: var(--color-text-primary);
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
  background: rgba(88, 166, 255, 0.15);
  color: var(--color-accent-blue);
}

.status-tag.warning {
  background: rgba(245, 158, 11, 0.15);
  color: var(--color-accent-orange);
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
  color: var(--color-text-tertiary);
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
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
}

.action-btn.primary {
  background: var(--color-accent-blue);
  color: white;
}

.action-btn.primary:hover {
  background: #4a9eff;
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
