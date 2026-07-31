<script setup lang="ts">
import { computed, ref } from "vue"
import { buildCommPortRows, getSettingsHint } from "@/services/calibration-device"
import ScaleWellPageHeader from "../shared/components/ScaleWellPageHeader.vue"
import CalibrationSteps from "./components/CalibrationSteps.vue"
import StepPreCheck from "./components/steps/StepPreCheck.vue"
import StepConnection from "./components/steps/StepConnection.vue"
import StepParams from "./components/steps/StepParams.vue"
import StepSampling from "./components/steps/StepSampling.vue"
import StepValidation from "./components/steps/StepValidation.vue"
import StepWrite from "./components/steps/StepWrite.vue"
import { useCalibrationFlow, CAL_STEPS, CONN_GUIDE } from "./composables/use-calibration-flow"

const {
  PRE_CHECK_LABELS,
  step,
  order,
  editableOrder,
  calibrationDraft,
  toolCfg,
  qualification,
  isDualSensor,
  preCheckCount,
  results,
  lastCal,
  canNext,
  togglePreCheck,
  connNext,
  onToolTypeChange,
  initSamplingPhase,
  runCommPretest,
  runFormalSampling,
  readSingle,
  toggleChartSeries,
  copyDataToExcel,
  manualCalculate,
  toggleSdDebug,
  writeToInstrument,
  restartSampling,
  nextStep,
  prevStep,
  finish,
  getToolDisplayName,
  TOOL_TYPE_OPTIONS,
  POWER_PARAM_ROWS
} = useCalibrationFlow()

const commPorts = computed(() => buildCommPortRows(order.value))
const settingsHint = computed(() => getSettingsHint(order.value ?? null))

const writing = ref(false)

const onConnNext = () => {
  connNext()
  nextStep()
}

const confirmWrite = () => {
  writing.value = true
  setTimeout(() => {
    writeToInstrument()
    writing.value = false
  }, 800)
}
</script>

<template>
  <div v-if="order && editableOrder" class="scale-well-page cal-flow-page">
    <ScaleWellPageHeader
      icon="mdi:flask-outline"
      title="伽马刻度流程"
      :subtitle="`工单 ${order.id} · ${getToolDisplayName(order.toolType)} · 按步骤完成高低刻度采样与数据写入`"
      icon-tone="amber"
    />

    <CalibrationSteps :active="step" :steps="CAL_STEPS" />

    <div class="sw-content-panel cal-flow-panel">
      <StepPreCheck
        v-if="step === 0"
        :labels="PRE_CHECK_LABELS"
        :pre-checks="calibrationDraft.preChecks"
        :pre-check-count="preCheckCount"
        :can-next="canNext"
        @toggle="togglePreCheck"
        @next="nextStep"
      />

      <StepConnection
        v-else-if="step === 1"
        :guide="CONN_GUIDE"
        @prev="prevStep"
        @next="onConnNext"
      />

      <StepParams
        v-else-if="step === 2"
        :order="editableOrder"
        :draft="calibrationDraft"
        :tool-type-options="TOOL_TYPE_OPTIONS"
        :power-rows="POWER_PARAM_ROWS(isDualSensor)"
        :comm-ports="commPorts"
        :settings-hint="settingsHint"
        @prev="prevStep"
        @next="nextStep"
        @tool-change="onToolTypeChange"
      />

      <StepSampling
        v-else-if="step === 3"
        phase="hi"
        :order="order"
        :draft="calibrationDraft"
        :tool-display-name="getToolDisplayName(order.toolType)"
        :is-dual-sensor="isDualSensor"
        :can-next="canNext"
        @init="initSamplingPhase('hi')"
        @prev="prevStep"
        @next="nextStep"
        @comm-pretest="runCommPretest('hi')"
        @read-single="readSingle('hi', $event)"
        @formal-sample="runFormalSampling('hi')"
        @toggle-series="toggleChartSeries('hi', $event)"
        @copy-excel="copyDataToExcel('hi')"
        @manual-calc="manualCalculate('hi')"
        @toggle-debug="toggleSdDebug('hi', $event)"
      />

      <StepSampling
        v-else-if="step === 4"
        phase="lo"
        :order="order"
        :draft="calibrationDraft"
        :tool-display-name="getToolDisplayName(order.toolType)"
        :is-dual-sensor="isDualSensor"
        :can-next="canNext"
        @init="initSamplingPhase('lo')"
        @prev="prevStep"
        @next="nextStep"
        @comm-pretest="runCommPretest('lo')"
        @read-single="readSingle('lo', $event)"
        @formal-sample="runFormalSampling('lo')"
        @toggle-series="toggleChartSeries('lo', $event)"
        @copy-excel="copyDataToExcel('lo')"
        @manual-calc="manualCalculate('lo')"
        @toggle-debug="toggleSdDebug('lo', $event)"
      />

      <StepValidation
        v-else-if="step === 5 && results && qualification"
        :results="results"
        :last-cal="lastCal"
        :qualification="qualification"
        :dual-sensor="isDualSensor"
        @prev="prevStep"
        @next="nextStep"
        @restart="restartSampling"
      />

      <StepWrite
        v-else-if="step === 6 && results"
        :results="results"
        :data-written="calibrationDraft.dataWritten"
        :writing="writing"
        @prev="prevStep"
        @confirm="confirmWrite"
        @finish="finish"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@import "../shared/styles/scale-well-theme.scss";
@import "./styles/calibration-flow.scss";

.cal-flow-page {
  gap: 12px;

  :deep(.sw-page-header__icon.is-amber) {
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--cal-amber-bright) 22%, transparent),
      0 4px 14px -4px var(--cal-amber-dim);
  }

  :deep(.sw-page-header__title) {
    letter-spacing: 0.015em;
  }

  :deep(.sw-page-header__subtitle) {
    color: color-mix(in srgb, var(--color-text-secondary) 88%, var(--cal-amber-muted));
  }
}

.cal-flow-panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
}
</style>
