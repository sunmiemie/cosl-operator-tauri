<script setup lang="ts">
import type { Component } from "vue"

defineProps<{
  title: string
  subtitle?: string
  icon?: Component
}>()
</script>

<template>
  <el-card shadow="never" class="dashboard-panel">
    <template #header>
      <div>
        <div class="dashboard-panel__title">
          <component :is="icon" v-if="icon" class="el-icon" />
          <span>{{ title }}</span>
        </div>
        <div v-if="subtitle" class="dashboard-panel__subtitle">{{ subtitle }}</div>
      </div>
    </template>
    <slot />
  </el-card>
</template>

<style scoped lang="scss">
@import "../styles/dashboard.scss";
</style>
