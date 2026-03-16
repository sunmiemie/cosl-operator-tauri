<script setup lang="ts">
import { ref, computed } from 'vue'
import { Icon } from '@iconify/vue'

// 声明组件的抛出事件
const emit = defineEmits(['cancel', 'complete'])

// 开机检查项配置
const checkItems = ref([
  { id: 1, text: '电源电压、环境温度及相对湿度符合使用条件', checked: false },
  { id: 2, text: '温箱箱体、控制箱、冷却系统电源连接安全可靠', checked: false },
  { id: 3, text: '确保"急停"按键复位', checked: false },
  { id: 4, text: '箱体上开门液压系统工作正常', checked: false },
  { id: 5, text: '外壳接地线连接可靠', checked: false }
])

// 校验是否所有项均已打勾
const allChecked = computed(() => checkItems.value.every(item => item.checked))

// 切换单项选中状态
function toggleCheck(id: number) {
  const item = checkItems.value.find(i => i.id === id)
  if (item) item.checked = !item.checked
}
</script>

<template>
  <div class="modal-overlay">
    <div class="startup-check-modal">
      <h2 class="modal-title">开机检查</h2>
      
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
        <button class="cancel-btn" @click="emit('cancel')">取消</button>
        <button class="next-btn" :disabled="!allChecked" @click="emit('complete')">下一步</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 弹窗遮罩与定位 */
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; backdrop-filter: blur(4px); }
.startup-check-modal { background: var(--color-bg-secondary); border-radius: 16px; padding: 32px; max-width: 700px; width: 100%; box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.3); border: 1px solid var(--color-border); animation: slideIn 0.3s ease-out; }
@keyframes slideIn { from { opacity: 0; transform: translateY(-20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }
.modal-title { font-size: 24px; font-weight: 700; text-align: center; margin-bottom: 24px; }
.check-list-container { background: var(--color-bg-tertiary); border-radius: 12px; padding: 20px; margin-bottom: 24px; border: 1px solid var(--color-border); }
.check-list { display: flex; flex-direction: column; gap: 12px; }
.check-item { display: flex; align-items: flex-start; gap: 14px; cursor: pointer; padding: 10px; border-radius: 8px; transition: background 0.2s; }
.check-item:hover { background: var(--color-bg-primary); }

/* 自定义复选框样式 */
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