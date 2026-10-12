<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{ data: number[]; color?: string; height?: number }>(), { color: '#4dabf7', height: 28 })
const path = computed(() => {
  const d = props.data
  if (d.length < 2) return ''
  const min = Math.min(...d), max = Math.max(...d)
  const span = max - min || 1
  return d.map((v, i) => `${i ? 'L' : 'M'}${((i / (d.length - 1)) * 100).toFixed(2)},${(props.height - 2 - ((v - min) / span) * (props.height - 4)).toFixed(2)}`).join('')
})
</script>

<template>
  <svg class="spark" :viewBox="`0 0 100 ${height}`" preserveAspectRatio="none" :style="{ height: height + 'px' }">
    <path v-if="path" :d="path + `L100,${height}L0,${height}Z`" :fill="color" opacity="0.12" />
    <path v-if="path" :d="path" :stroke="color" fill="none" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  </svg>
</template>

<style scoped>
.spark { width: 100%; display: block; margin-top: 4px; }
</style>
