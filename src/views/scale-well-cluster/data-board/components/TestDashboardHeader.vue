<script setup lang="ts">
import { useScaleWellSession } from "../../shared/composables/useScaleWellSession"
import ScaleWellPageHeader from "../../shared/components/ScaleWellPageHeader.vue"

defineProps<{
  subtitle: string
}>()

const { role, setRole } = useScaleWellSession()

function onRoleChange(v: string | number | boolean | undefined) {
  if (v === "leader" || v === "tester") setRole(v)
}
</script>

<template>
  <ScaleWellPageHeader
    icon="mdi:view-dashboard"
    title="数据看板"
    :subtitle="subtitle"
    icon-tone="blue"
  >
    <el-radio-group :model-value="role" size="small" @update:model-value="onRoleChange">
      <el-radio-button value="leader">组长视图</el-radio-button>
      <el-radio-button value="tester">测试员视图</el-radio-button>
    </el-radio-group>
  </ScaleWellPageHeader>
</template>
