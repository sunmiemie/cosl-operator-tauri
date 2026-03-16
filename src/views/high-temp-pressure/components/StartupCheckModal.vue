<script setup lang="ts">
import { Icon } from '@iconify/vue'
import type { StartupCheckItem } from '../types'

defineProps<{
  visible: boolean
  checkItems: StartupCheckItem[]
  allChecked: boolean
}>()

const emit = defineEmits<{
  'toggle-check': [id: number]
  close: []
  complete: []
}>()
</script>

<template>
  <div v-if="visible" class="startup-check-overlay">
    <div class="startup-check-modal">
      <h2 class="modal-title">开机检查</h2>
      <div class="check-list-container">
        <div class="check-list">
          <label
            v-for="item in checkItems"
            :key="item.id"
            class="check-item"
            :class="{ 'is-checked': item.checked }"
          >
            <div class="checkbox-wrapper">
              <input type="checkbox" :checked="item.checked" @change="emit('toggle-check', item.id)" />
              <div class="custom-checkbox">
                <Icon v-if="item.checked" icon="mdi:check" />
              </div>
            </div>
            <span class="check-text">{{ item.text }}</span>
          </label>
        </div>
      </div>

      <div class="modal-actions">
        <button class="cancel-btn" @click="emit('close')">取消</button>
        <button class="next-btn" :disabled="!allChecked" @click="emit('complete')">下一步</button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./high-temp-pressure.shared.css"></style>
