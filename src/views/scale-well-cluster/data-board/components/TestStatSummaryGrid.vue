<script setup lang="ts">
defineProps<{
  pending: number
  inProgress: number
  todayCompleted: number
  onlineLabel: string
}>()
</script>

<template>
  <div class="sw-stat-grid">
    <div class="sw-stat-card">
      <div class="sw-stat-card__label">待测新工单</div>
      <div class="sw-stat-card__value">{{ pending }}<span class="sw-stat-card__unit">件</span></div>
      <div class="sw-stat-card__meta">待排程</div>
    </div>
    <div class="sw-stat-card">
      <div class="sw-stat-card__label">待继续工单</div>
      <div class="sw-stat-card__value">{{ inProgress }}<span class="sw-stat-card__unit">件</span></div>
      <div class="sw-stat-card__meta">暂停中</div>
    </div>
    <div class="sw-stat-card">
      <div class="sw-stat-card__label">今日完成</div>
      <div class="sw-stat-card__value">{{ todayCompleted }}<span class="sw-stat-card__unit">件</span></div>
      <div class="sw-stat-card__meta is-up">已完成</div>
    </div>
    <div class="sw-stat-card">
      <div class="sw-stat-card__label">账号在线时长</div>
      <div class="sw-stat-card__value sw-stat-card__value--sm">{{ onlineLabel }}</div>
      <div class="sw-stat-card__meta">本次登录</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@import "../../shared/styles/scale-well-theme.scss";

.sw-stat-card__value--sm {
  font-size: 1.375rem;
}
</style>
