<script setup lang="ts">
import { ref } from "vue"
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
  isDualSensor,
  preCheckCount,
  results,
  canNext,
  togglePreCheck,
  connNext,
  onToolTypeChange,
  runPretest,
  runSampling,
  writeToInstrument,
  nextStep,
  prevStep,
  finish,
  getToolDisplayName,
  TOOL_TYPE_OPTIONS,
  POWER_PARAM_ROWS
} = useCalibrationFlow()

const COMM_PORTS = [
  { device: "仪器（TBUS）", mode: "RS-485", port: "COM3", baud: "115200" },
  { device: "直流电源", mode: "USB-HID", port: "自动识别", baud: "—" },
  { device: "数据棒", mode: "USB-Serial", port: "COM4", baud: "9600" }
]

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
      icon-tone="purple"
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
        :comm-ports="COMM_PORTS"
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
        @prev="prevStep"
        @next="nextStep"
        @pretest="runPretest('hi')"
        @sample="runSampling('hi')"
      />

      <StepSampling
        v-else-if="step === 4"
        phase="lo"
        :order="order"
        :draft="calibrationDraft"
        :tool-display-name="getToolDisplayName(order.toolType)"
        :is-dual-sensor="isDualSensor"
        :can-next="canNext"
        @prev="prevStep"
        @next="nextStep"
        @pretest="runPretest('lo')"
        @sample="runSampling('lo')"
      />

      <StepValidation
        v-else-if="step === 5 && results && toolCfg"
        :results="results"
        :kc-min="toolCfg.kcMin"
        :kc-max="toolCfg.kcMax"
        @prev="prevStep"
        @next="nextStep"
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

.cal-flow-page {
  gap: 12px;
}

.cal-flow-panel {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0;
  display: flex;
  flex-direction: column;
}
</style>
