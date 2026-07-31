<template>
  <header class="board-header">
    <div>
      <div class="board-header__eyebrow">MY CALIBRATION REPORTS</div>
      <h1>我的刻度报告</h1>
      <p class="board-header__desc">查看已提交报告，草稿与驳回报告可继续编辑</p>
    </div>
    <div class="board-header__tags">
      <el-tag v-if="draftCount" type="info" effect="plain">草稿 {{ draftCount }}</el-tag>
      <el-tag v-if="pendingCount" type="warning" effect="plain">待审核 {{ pendingCount }}</el-tag>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  pendingCount: number
  draftCount?: number
}>()
</script>

<style scoped lang="scss">
@import "../../data-board/styles/dashboard.scss";
@import "../styles/report.scss";

.board-header {
  align-items: center;

  &__tags {
    display: flex;
    gap: 8px;
  }
}
</style>
