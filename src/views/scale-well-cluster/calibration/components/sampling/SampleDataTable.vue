<script setup lang="ts">
import { computed } from "vue"
import { DocumentCopy, DataLine } from "@element-plus/icons-vue"
import type { PhaseSamplingState } from "../../../shared/types"

const props = defineProps<{
  phase: "hi" | "lo"
  phaseState: PhaseSamplingState
  dualSensor: boolean
}>()

const emit = defineEmits<{
  copy: []
  calculate: []
  debug: [on: boolean]
}>()

const isHi = computed(() => props.phase === "hi")
const suffix = computed(() => (isHi.value ? "H" : "L"))

const cpsHeaders = computed(() =>
  props.dualSensor
    ? ["#", `CPSA_${suffix.value}`, `CPSB_${suffix.value}`]
    : ["#", `CPSB_${suffix.value}`]
)

const countHeaders = computed(() =>
  props.dualSensor
    ? ["#", `CountA_${suffix.value}`, `CountB_${suffix.value}`]
    : ["#", `CountB_${suffix.value}`]
)

const activeHeaders = computed(() =>
  props.phaseState.dataSubTab === "cps" ? cpsHeaders.value : countHeaders.value
)
</script>

<template>
  <div class="formal-data-panel">
    <div class="sample-tab-row formal-subtab-row">
      <button
        type="button"
        class="sample-tab"
        :class="{ active: phaseState.dataSubTab === 'cps' }"
        @click="phaseState.dataSubTab = 'cps'"
      >
        CPS 视图
      </button>
      <button
        type="button"
        class="sample-tab"
        :class="{ active: phaseState.dataSubTab === 'count' }"
        @click="phaseState.dataSubTab = 'count'"
      >
        Count 视图
      </button>
    </div>

    <div class="formal-data-table-wrap">
      <div
        class="formal-data-table-head"
        :class="{ 'is-dual': dualSensor }"
      >
        <span v-for="h in activeHeaders" :key="h">{{ h }}</span>
      </div>
      <div class="formal-data-table-body">
        <div v-if="!phaseState.tableData.length" class="pretest-table-empty">
          <el-icon :size="24"><DataLine /></el-icon>
          <span>启动采样后数据将写入此表</span>
        </div>
        <div
          v-for="(row, i) in phaseState.tableData"
          :key="i"
          class="formal-data-table-row"
          :class="{ 'is-dual': dualSensor }"
        >
          <span class="c-idx">{{ i + 1 }}</span>
          <template v-if="phaseState.dataSubTab === 'cps'">
            <span v-if="dualSensor" class="c-val">{{ row.cpsA ?? "—" }}</span>
            <span class="c-val c-val--main">{{ row.cpsB ?? "—" }}</span>
          </template>
          <template v-else>
            <span v-if="dualSensor" class="c-val">{{ row.countA ?? "—" }}</span>
            <span class="c-val c-val--main">{{ row.countB ?? "—" }}</span>
          </template>
        </div>
      </div>
    </div>

    <div class="formal-data-actions">
      <button type="button" class="formal-action-btn" @click="emit('copy')">
        <el-icon><DocumentCopy /></el-icon>
        Copy to Excel
      </button>
      <button type="button" class="formal-action-btn formal-action-btn--primary" @click="emit('calculate')">
        Calculate
      </button>
    </div>

    <div class="sdlog-wrap">
      <div class="sdlog-body">
        <div v-for="(line, i) in phaseState.sdLogs" :key="i">{{ i + 1 }}. {{ line }}</div>
        <div v-if="!phaseState.sdLogs.length" class="sdlog-empty">—</div>
      </div>
    </div>

    <label class="formal-debug-toggle">
      <input
        type="checkbox"
        :checked="phaseState.sdDebug"
        @change="emit('debug', ($event.target as HTMLInputElement).checked)"
      />
      <span class="formal-debug-toggle__track" />
      <span class="formal-debug-toggle__label">Show Debug</span>
    </label>
  </div>
</template>

<style scoped lang="scss">
@import "../../styles/sampling.scss";
</style>
