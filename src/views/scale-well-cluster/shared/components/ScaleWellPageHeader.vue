<script setup lang="ts">
import { Icon } from "@iconify/vue"

withDefaults(
  defineProps<{
    icon?: string
    title: string
    subtitle?: string
    iconTone?: "blue" | "purple" | "amber" | "cyan"
  }>(),
  {
    icon: "mdi:radioactive",
    subtitle: "",
    iconTone: "blue"
  }
)
</script>

<template>
  <header class="sw-page-header">
    <div class="sw-page-header__left">
      <div class="sw-page-header__icon" :class="`is-${iconTone}`">
        <Icon :icon="icon" />
      </div>
      <div>
        <h1 class="sw-page-header__title">{{ title }}</h1>
        <p v-if="subtitle" class="sw-page-header__subtitle">{{ subtitle }}</p>
      </div>
    </div>
    <div v-if="$slots.default" class="sw-page-header__actions">
      <slot />
    </div>
  </header>
</template>
