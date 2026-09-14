<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import type { BoardModelItem } from '@/views/process-halt-hass/types'
import type { HaltHassSlotAssignment, HaltHassTargetBoard } from '../types'

const props = defineProps<{
  assignments: HaltHassSlotAssignment[]
  eligibleBoards: HaltHassTargetBoard[]
  availableOrders: Array<{ id: number; orderNo: string; boardCount: number }>
  selectedOrderIds: number[]
  applicableBoardModels: BoardModelItem[]
  confirmedSerials: string[]
  valid: boolean
  validationMessage: string
  loading?: boolean
}>()

const emit = defineEmits<{
  role: [slotNo: number, role: HaltHassSlotAssignment['role']]
  update: [slotNo: number, patch: Partial<HaltHassSlotAssignment>]
  order: [orderId: number, selected: boolean]
}>()

const selectedTargetIds = computed(() => new Set(
  props.assignments
    .filter(item => item.role === 'target' && item.targetBoardId)
    .map(item => Number(item.targetBoardId)),
))
const confirmedSerialSet = computed(() => new Set(
  props.confirmedSerials.map(serial => serial.trim().toUpperCase()).filter(Boolean),
))

function assignmentSerial(slot: HaltHassSlotAssignment): string {
  if (slot.role === 'target') {
    return props.eligibleBoards.find(board => board.id === slot.targetBoardId)?.serial || ''
  }
  return slot.role === 'companion' ? (slot.companionSerial || '') : ''
}

function isSlotScanned(slot: HaltHassSlotAssignment): boolean {
  const serial = assignmentSerial(slot).trim().toUpperCase()
  return Boolean(serial && confirmedSerialSet.value.has(serial))
}

function targetOptions(slot: HaltHassSlotAssignment) {
  return props.eligibleBoards.filter(target => (
    slot.allowedBoardModelIds.includes(target.boardModelId)
    && (!selectedTargetIds.value.has(target.id) || target.id === slot.targetBoardId)
  ))
}

function modelOptions(slot: HaltHassSlotAssignment) {
  return props.applicableBoardModels.filter(model => slot.allowedBoardModelIds.includes(model.id))
}

function onRoleChange(slotNo: number, event: Event) {
  emit('role', slotNo, (event.target as HTMLSelectElement).value as HaltHassSlotAssignment['role'])
}

function onTargetChange(slotNo: number, event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  emit('update', slotNo, { targetBoardId: value || undefined })
}

function onCompanionModelChange(slotNo: number, event: Event) {
  const value = Number((event.target as HTMLSelectElement).value)
  emit('update', slotNo, { companionBoardModelId: value || undefined })
}
</script>

<template>
  <div class="session-selector">
    <div class="order-scope">
      <div class="order-scope-title">
        <Icon icon="mdi:clipboard-multiple-outline" />
        <span>本次参与测试的工单</span>
        <small>目标板 SN 仅在勾选工单内匹配</small>
      </div>
      <div class="order-options">
        <label v-for="order in availableOrders" :key="order.id" class="order-option">
          <input
            type="checkbox"
            :checked="selectedOrderIds.includes(order.id)"
            @change="emit('order', order.id, ($event.target as HTMLInputElement).checked)"
          />
          <strong>{{ order.orderNo }}</strong>
          <span>{{ order.boardCount }} 块待测板</span>
        </label>
      </div>
    </div>

    <div class="selector-summary" :class="{ valid }">
      <Icon :icon="loading ? 'mdi:loading' : valid ? 'mdi:check-circle' : 'mdi:information-outline'" :class="{ spin: loading }" />
      <span>{{ loading ? '正在加载可测试目标板...' : validationMessage }}</span>
    </div>

    <div class="slot-list">
      <div v-for="slot in assignments" :key="slot.slotNo" class="slot-row">
        <div class="slot-identity">
          <strong>{{ slot.slotName }}</strong>
          <span>#{{ slot.slotNo }}</span>
          <em v-if="slot.required">必装</em>
        </div>

        <select class="field role-field" :value="slot.role" @change="onRoleChange(slot.slotNo, $event)">
          <option value="empty">空板位</option>
          <option value="target">目标板</option>
          <option v-if="slot.allowCompanion" value="companion">陪测板</option>
        </select>

        <template v-if="slot.role === 'target'">
          <select class="field board-field" :value="slot.targetBoardId || ''" @change="onTargetChange(slot.slotNo, $event)">
            <option value="">请选择目标板</option>
            <option v-for="board in targetOptions(slot)" :key="board.id" :value="board.id">
              {{ board.serial }} · {{ board.boardModelName }} · {{ board.orderNo }}
            </option>
          </select>
        </template>

        <template v-else-if="slot.role === 'companion'">
          <select class="field model-field" :value="slot.companionBoardModelId || ''" @change="onCompanionModelChange(slot.slotNo, $event)">
            <option value="">陪测型号</option>
            <option v-for="model in modelOptions(slot)" :key="model.id" :value="model.id">{{ model.name }}</option>
          </select>
          <input
            class="field serial-field"
            :value="slot.companionSerial || ''"
            placeholder="扫描或输入陪测板 SN"
            @input="emit('update', slot.slotNo, { companionSerial: ($event.target as HTMLInputElement).value })"
          />
        </template>

        <div v-else class="empty-hint">本板位不参与本场测试</div>

        <div v-if="slot.role !== 'empty'" class="scan-confirmation" :class="{ confirmed: isSlotScanned(slot) }">
          <Icon :icon="isSlotScanned(slot) ? 'mdi:barcode-scan' : 'mdi:barcode-off'" />
          {{ isSlotScanned(slot) ? '已扫码' : '待扫码' }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-selector { display: flex; flex-direction: column; gap: 14px; }
.order-scope { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--color-border, #dbe4ef); border-radius: 10px; background: var(--color-bg-secondary, #fff); }
.order-scope-title { display: flex; align-items: center; gap: 7px; font-weight: 700; }
.order-scope-title small { margin-left: 6px; color: #64748b; font-size: 12px; font-weight: 400; }
.order-options { display: flex; flex-wrap: wrap; gap: 8px; }
.order-option { display: inline-flex; align-items: center; gap: 7px; min-height: 34px; padding: 6px 10px; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer; }
.order-option:has(input:checked) { color: #1d4ed8; border-color: #60a5fa; background: #eff6ff; }
.order-option span { color: #64748b; font-size: 12px; }
.selector-summary { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 8px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; }
.selector-summary.valid { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
.slot-list { display: flex; flex-direction: column; gap: 10px; }
.slot-row { display: grid; grid-template-columns: 130px 110px minmax(260px, 1fr) minmax(180px, .65fr) 88px; gap: 10px; align-items: center; padding: 12px; border: 1px solid var(--color-border, #dbe4ef); border-radius: 10px; background: var(--color-bg-secondary, #fff); }
.slot-identity { display: flex; align-items: baseline; gap: 6px; white-space: nowrap; }
.slot-identity span { color: #94a3b8; font-size: 12px; }
.slot-identity em { color: #dc2626; font-size: 11px; font-style: normal; }
.field { min-width: 0; height: 38px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 7px; color: inherit; background: var(--color-bg-primary, #fff); }
.board-field, .empty-hint { grid-column: span 2; }
.empty-hint { color: #94a3b8; font-size: 13px; }
.scan-confirmation { display: flex; align-items: center; justify-content: center; gap: 5px; height: 30px; border-radius: 999px; font-size: 12px; color: #b45309; background: #fffbeb; border: 1px solid #fde68a; }
.scan-confirmation.confirmed { color: #047857; background: #ecfdf5; border-color: #a7f3d0; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 1100px) {
  .slot-row { grid-template-columns: 110px 100px 1fr 82px; }
  .board-field, .empty-hint { grid-column: auto; }
  .serial-field { grid-column: auto; }
}
</style>
