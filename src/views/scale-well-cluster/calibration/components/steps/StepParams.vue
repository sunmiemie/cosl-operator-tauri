<script setup lang="ts">
import { ArrowLeft, ArrowRight } from "@element-plus/icons-vue"
import CalibrationStepLayout from "../CalibrationStepLayout.vue"
import type { CalibrationDraft, CalibrationWorkOrder } from "../../../shared/types"

const props = defineProps<{
  order: CalibrationWorkOrder
  draft: CalibrationDraft
  toolTypeOptions: { value: string; label: string }[]
  powerRows: string[][]
  commPorts: { device: string; mode: string; port: string; baud: string }[]
}>()

const emit = defineEmits<{
  prev: []
  next: []
  toolChange: [value: string]
}>()

const calParamRows = [
  {
    key: "hi",
    label: "高刻 HIGH#",
    tag: "danger" as const,
    hole: () => props.draft.hiHole,
    api: () => props.order.hiApi,
    interval: () => props.draft.hiInterval,
    count: () => props.draft.hiCount,
    onInterval: (v: number) => { props.draft.hiInterval = v },
    onCount: (v: number) => { props.draft.hiCount = v }
  },
  {
    key: "lo",
    label: "低刻 LOW#",
    tag: "primary" as const,
    hole: () => props.draft.loHole,
    api: () => props.order.loApi,
    interval: () => props.draft.loInterval,
    count: () => props.draft.loCount,
    onInterval: (v: number) => { props.draft.loInterval = v },
    onCount: (v: number) => { props.draft.loCount = v }
  }
]
</script>

<template>
  <CalibrationStepLayout title="刻度参数配置" description="填写仪器与采样参数，建立刻度文件">
    <el-row :gutter="16" class="params-stack">
      <el-col :span="24">
        <el-card shadow="never" class="step-card">
          <template #header>仪器信息</template>
          <el-form label-position="top" class="params-form">
            <el-row :gutter="16">
              <el-col :xs="24" :sm="12" :lg="8">
                <el-form-item label="仪器型号 (Tool Size)">
                  <el-select
                    :model-value="order.toolType"
                    style="width: 100%"
                    @change="emit('toolChange', $event)"
                  >
                    <el-option
                      v-for="opt in toolTypeOptions"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :lg="8">
                <el-form-item label="仪器编号 (Tool SN)">
                  <el-input v-model="order.serialNumber" placeholder="如 DWPR675A-0001" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :lg="8">
                <el-form-item label="测试地点 (Location)">
                  <el-input v-model="order.location" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :lg="8">
                <el-form-item label="刻度设备 (Cal Device)">
                  <el-input v-model="order.calibrationDevice" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :lg="8">
                <el-form-item label="测试人员 (Engineer)">
                  <el-input v-model="order.engineer" />
                </el-form-item>
              </el-col>
              <el-col :xs="24" :sm="12" :lg="8">
                <el-form-item label="QC 工程师">
                  <el-input v-model="draft.qcEngineer" placeholder="QC工程师姓名" />
                </el-form-item>
              </el-col>
              <el-col :span="24">
                <el-form-item label="软件版本号 (Software Version)">
                  <el-input v-model="draft.softVer" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
        </el-card>
      </el-col>

      <el-col :span="24">
        <el-card shadow="never" class="step-card">
          <template #header>高 / 低刻采样参数</template>
          <el-table :data="calParamRows" border stripe size="small" class="param-table">
            <el-table-column label="类型" width="120">
              <template #default="{ row }">
                <el-tag :type="row.tag" size="small">{{ row.label }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="井径 (mm)" width="110">
              <template #default="{ row }">{{ row.hole() }}</template>
            </el-table-column>
            <el-table-column label="标称 API" width="110">
              <template #default="{ row }">{{ row.api() }}</template>
            </el-table-column>
            <el-table-column label="采样间隔 (s)" min-width="130">
              <template #default="{ row }">
                <el-input-number
                  :model-value="row.interval()"
                  :min="20"
                  :step="1"
                  size="small"
                  controls-position="right"
                  @update:model-value="row.onInterval($event ?? 20)"
                />
              </template>
            </el-table-column>
            <el-table-column label="采样点数" min-width="130">
              <template #default="{ row }">
                <el-input-number
                  :model-value="row.count()"
                  :min="100"
                  :step="10"
                  size="small"
                  controls-position="right"
                  @update:model-value="row.onCount($event ?? 100)"
                />
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="step-card">
          <template #header>上电参数参考</template>
          <el-table :data="powerRows.map(([param, ref, note]) => ({ param, ref, note }))" size="small" stripe>
            <el-table-column prop="param" label="参数" width="120" />
            <el-table-column prop="ref" label="参考值" width="120" />
            <el-table-column prop="note" label="说明" min-width="160" show-overflow-tooltip />
          </el-table>
        </el-card>
      </el-col>

      <el-col :xs="24" :lg="12">
        <el-card shadow="never" class="step-card">
          <template #header>通信端口配置</template>
          <el-table :data="commPorts" size="small" stripe>
            <el-table-column prop="device" label="设备" min-width="100" />
            <el-table-column prop="mode" label="方式" width="90" />
            <el-table-column prop="port" label="端口" width="90" />
            <el-table-column prop="baud" label="波特率" width="80" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <template #footer>
      <el-button @click="emit('prev')">
        <el-icon class="el-icon--left"><ArrowLeft /></el-icon>
        上一步
      </el-button>
      <el-button type="primary" @click="emit('next')">
        建立刻度文件，继续
        <el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>
    </template>
  </CalibrationStepLayout>
</template>

<style scoped lang="scss">
.params-stack {
  display: flex;
  flex-wrap: wrap;
}

.step-card {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  margin-bottom: 0;
}

.params-form :deep(.el-form-item__label) {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.param-table {
  width: 100%;
}
</style>
