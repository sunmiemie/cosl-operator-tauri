<template>
  <header class="board-header">
    <div>
      <div class="board-header__eyebrow">CALIBRATION REPORT</div>
      <h1>刻度报告</h1>
      <p class="board-header__desc">历史刻度数据存档与报告审核</p>
    </div>
    <el-tag type="warning" effect="plain">待审核 {{ pendingCount }} 份</el-tag>
  </header>
</template>

<script setup lang="ts">
defineProps<{
  pendingCount: number
}>()
</script>

<style scoped lang="scss">
@import "../../data-board/styles/dashboard.scss";
@import "../styles/report.scss";

.board-header {
  align-items: center;
}
</style>
