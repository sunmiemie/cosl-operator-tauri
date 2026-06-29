<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <div class="cal-step-layout">
    <header class="cal-step-layout__head">
      <div>
        <h3 class="cal-step-layout__title">{{ title }}</h3>
        <p v-if="description" class="cal-step-layout__desc">{{ description }}</p>
      </div>
      <div v-if="$slots.extra" class="cal-step-layout__extra">
        <slot name="extra" />
      </div>
    </header>
    <div class="cal-step-layout__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="cal-step-layout__foot">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped lang="scss">
.cal-step-layout {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
}

.cal-step-layout__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.cal-step-layout__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.cal-step-layout__desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.cal-step-layout__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 20px;
}

.cal-step-layout__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
  background: var(--color-bg-tertiary);
}
</style>
