<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'

const emit = defineEmits(['cancel', 'complete'])

const checkItems = ref([
  { id: 1, text: '确认各处电源关闭，设备停机状态正常', checked: false },
  { id: 2, text: '完成外观检查并整理试验现场', checked: false }
])

const allChecked = computed(() => checkItems.value.every(item => item.checked))

function toggleCheck(id: number) {
  const item = checkItems.value.find(i => i.id === id)
  if (item) item.checked = !item.checked
}
</script>

<template>
  <div class="modal-overlay">
    <div class="shutdown-check-modal">
      <h2 class="modal-title">关机检查</h2>
      <p class="modal-subtitle">报告保存完成后，请完成设备停机与现场整理确认。</p>
      
      <div class="check-list-container">
        <div class="check-list">
          <label v-for="item in checkItems" :key="item.id" class="check-item" :class="{ 'is-checked': item.checked }">
            <div class="checkbox-wrapper">
              <input type="checkbox" :checked="item.checked" @change="toggleCheck(item.id)" />
              <div class="custom-checkbox"><Icon v-if="item.checked" icon="mdi:check" /></div>
            </div>
            <span class="check-text">{{ item.text }}</span>
          </label>
        </div>
      </div>
      
      <div class="modal-actions">
        <button class="cancel-btn" @click="emit('cancel')">返回</button>
        <button class="next-btn" :disabled="!allChecked" @click="emit('complete')">确认完成</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; backdrop-filter: blur(4px); }
.shutdown-check-modal { background: var(--color-bg-secondary); border-radius: 16px; padding: 32px; max-width: 700px; width: 100%; box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.3); border: 1px solid var(--color-border); animation: slideIn 0.3s ease-out; }
@keyframes slideIn { from { opacity: 0; transform: translateY(-20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-title { font-size: 24px; font-weight: 700; text-align: center; margin-bottom: 8px; }
.modal-subtitle { font-size: 14px; color: var(--color-text-secondary); text-align: center; margin: 0 0 24px; }
.check-list-container { background: var(--color-bg-tertiary); border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid var(--color-border); }
.check-list { display: flex; flex-direction: column; gap: 12px; }
.check-item { display: flex; align-items: flex-start; gap: 14px; cursor: pointer; padding: 10px; border-radius: 8px; transition: background 0.2s; }
.check-item:hover { background: var(--color-bg-primary); }
.checkbox-wrapper { position: relative; width: 20px; height: 20px; flex-shrink: 0; margin-top: 2px; }
.checkbox-wrapper input { position: absolute; opacity: 0; cursor: pointer; width: 100%; height: 100%; z-index: 1; }
.custom-checkbox { width: 100%; height: 100%; border: 2px solid var(--color-border); border-radius: 4px; display: flex; align-items: center; justify-content: center; background: var(--color-bg-primary); }
.check-item.is-checked .custom-checkbox { background: var(--color-accent-blue); border-color: var(--color-accent-blue); color: white; }
.check-text { font-size: 15px; line-height: 1.5; }
.modal-actions { display: flex; gap: 16px; }
.cancel-btn, .next-btn { flex: 1; padding: 12px 24px; border-radius: 10px; font-size: 16px; font-weight: 600; cursor: pointer; }
.cancel-btn { background: transparent; color: var(--color-text-secondary); border: 1px solid var(--color-border); }
.cancel-btn:hover { background: var(--color-bg-tertiary); }
.next-btn { background: var(--color-accent-blue); color: white; border: none; }
.next-btn:disabled { background: var(--color-bg-tertiary); color: var(--color-text-tertiary); cursor: not-allowed; }
</style>
