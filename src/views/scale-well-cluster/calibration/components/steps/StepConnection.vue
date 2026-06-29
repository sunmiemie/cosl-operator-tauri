<script setup lang="ts">
import { ArrowLeft, ArrowRight } from "@element-plus/icons-vue"
import CalibrationStepLayout from "../CalibrationStepLayout.vue"

defineProps<{
  guide: { badge: string; title: string; text: string; warn: string }
}>()

const emit = defineEmits<{
  prev: []
  next: []
}>()
</script>

<template>
  <CalibrationStepLayout
    title="系统连接"
    description="请确认系统连接正确，点击图片可放大查看；确认后方可继续"
  >
    <el-row :gutter="16">
      <el-col :xs="24" :lg="14">
        <el-card shadow="never" class="step-card guide-card">
          <template #header>
            <div class="card-head">
              <el-tag type="primary" effect="plain" size="small">{{ guide.badge }}</el-tag>
              <span>{{ guide.title }}</span>
            </div>
          </template>
          <p class="guide-text">{{ guide.text }}</p>
          <el-alert type="warning" :closable="false" show-icon :title="guide.warn" />
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="10">
        <el-card shadow="never" class="step-card diagram-card">
          <template #header>连接示意图</template>
          <div class="diagram-placeholder">
            <el-empty description="示意图资源待接入" :image-size="72" />
          </div>
        </el-card>
      </el-col>
    </el-row>

    <template #footer>
      <el-button @click="emit('prev')">
        <el-icon class="el-icon--left"><ArrowLeft /></el-icon>
        上一步
      </el-button>
      <el-button type="primary" @click="emit('next')">
        参数配置
        <el-icon class="el-icon--right"><ArrowRight /></el-icon>
      </el-button>
    </template>
  </CalibrationStepLayout>
</template>

<style scoped lang="scss">
.step-card {
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  height: 100%;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.guide-text {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.diagram-card {
  min-height: 260px;
}

.diagram-placeholder {
  min-height: 180px;
  display: grid;
  place-items: center;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
}
</style>
