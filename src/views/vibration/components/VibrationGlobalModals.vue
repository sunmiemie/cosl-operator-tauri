<script setup lang="ts">
import { Icon } from '@iconify/vue'

defineProps<{
  showSafetyWarning: boolean
  showConfirmStartModal: boolean
  showAbortWarning: boolean
}>()

const emit = defineEmits<{
  'update:showSafetyWarning': [value: boolean]
  'continue-after-safety-warning': []
  'update:showConfirmStartModal': [value: boolean]
  'confirm-start-vibration': []
  'update:showAbortWarning': [value: boolean]
  'confirm-abort': []
}>()
</script>

<template>
  <div v-if="showSafetyWarning" class="modal-overlay">
    <div class="startup-check-modal">
      <h2 class="modal-title">安全警告</h2>
      <div class="hint" style="margin-bottom: 12px;">存在未通过检查项，确认继续可能存在安全风险。</div>
      <div class="modal-actions">
        <button class="cancel-btn" @click="emit('update:showSafetyWarning', false)">取消</button>
        <button class="next-btn" @click="emit('continue-after-safety-warning')">确认继续</button>
      </div>
    </div>
  </div>

  <div v-if="showConfirmStartModal" class="modal-overlay">
    <div class="startup-check-modal" style="width: 460px;">
      <div class="modal-header-simple">
        <h3>⚠️ 确认启动振动台</h3>
        <button class="modal-close-simple" @click="emit('update:showConfirmStartModal', false)">×</button>
      </div>
      <div class="content-pad">
        <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:14px">请确认以下准备工作已全部完成：</div>
        <ul style="list-style:none;padding:0;margin-bottom:16px">
          <li style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;color:var(--color-text-secondary)">
            <span style="color:var(--color-accent-green);font-weight:700">✓</span>振动台运转前10项检查已完成
          </li>
          <li style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;color:var(--color-text-secondary)">
            <span style="color:var(--color-accent-green);font-weight:700">✓</span>试件已安装牢固，工具已清理
          </li>
          <li style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;color:var(--color-text-secondary)">
            <span style="color:var(--color-accent-green);font-weight:700">✓</span>工作区域已确认无人员
          </li>
          <li style="display:flex;align-items:center;gap:8px;padding:5px 0;font-size:12px;color:var(--color-text-secondary)">
            <span style="color:var(--color-accent-green);font-weight:700">✓</span>操作员已在安全位置就位
          </li>
        </ul>
        <div class="alert warning" style="margin-bottom: 0;">
          <Icon icon="mdi:alert" class="alert-icon" />
          <div class="alert-text">
            <strong>注意：</strong>启动后振动台开始工作，请确保所有准备工作已完成。
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="cancel-btn" @click="emit('update:showConfirmStartModal', false)">取消</button>
        <button class="next-btn" @click="emit('confirm-start-vibration')">确认启动</button>
      </div>
    </div>
  </div>

  <div v-if="showAbortWarning" class="modal-overlay">
    <div class="startup-check-modal" style="width: 420px;">
      <div class="modal-header-simple">
        <h3>⚠️ 测试中止确认</h3>
        <button class="modal-close-simple" @click="emit('update:showAbortWarning', false)">×</button>
      </div>
      <div class="content-pad">
        <div class="alert warning">
          <span class="alert-icon">⛔</span>
          <div class="alert-text"><strong>警告：</strong>测试中止将删除工单文件夹中的所有测试数据，操作不可恢复。</div>
        </div>
        <p style="font-size:13px;color:var(--color-text-secondary);line-height:1.7">
          确认中止后：<br>• 工单文件夹中的所有数据将被清空<br>• 工单状态恢复为"待测试"<br>• 页面跳转至数据看板
        </p>
      </div>
      <div class="modal-actions">
        <button class="cancel-btn" @click="emit('update:showAbortWarning', false)">取消</button>
        <button class="next-btn" @click="emit('confirm-abort')">确认中止</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./vibration.shared.css"></style>
