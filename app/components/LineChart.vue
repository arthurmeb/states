<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{ series: { name: string; data: number[]; color: string }[]; labels?: string[]; height?: number; fmt?: (v: number) => string }>(), { height: 140, fmt: (v: number) => v.toFixed(1) })
const W = 600
const pad = { l: 44, r: 8, t: 8, b: 18 }
const all = computed(() => props.series.flatMap(s => s.data).filter(v => isFinite(v)))
const min = computed(() => Math.min(...all.value, 0 < Math.min(...all.value) && Math.min(...all.value) < Math.max(...all.value) * 0.2 ? 0 : Math.min(...all.value)))
const max = computed(() => { const m = Math.max(...all.value); return m === min.value ? m + 1 : m })
const len = computed(() => Math.max(2, ...props.series.map(s => s.data.length)))
const x = (i: number) => pad.l + (i / (len.value - 1)) * (W - pad.l - pad.r)
const y = (v: number) => pad.t + (1 - (v - min.value) / (max.value - min.value)) * (props.height - pad.t - pad.b)
const paths = computed(() => props.series.map(s => ({ ...s, d: s.data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('') })))
const ticks = computed(() => [0, 0.5, 1].map(f => min.value + (max.value - min.value) * f))
</script>

<template>
  <svg class="chart" :viewBox="`0 0 ${W} ${height}`" preserveAspectRatio="none" :style="{ height: height + 'px' }">
    <g v-for="t in ticks" :key="t">
      <line :x1="pad.l" :x2="W - pad.r" :y1="y(t)" :y2="y(t)" stroke="rgba(255,255,255,0.08)" />
      <text :x="pad.l - 6" :y="y(t) + 3" text-anchor="end" class="tk">{{ fmt(t) }}</text>
    </g>
    <text v-if="labels?.length" :x="pad.l" :y="height - 4" class="tk">{{ labels[0] }}</text>
    <text v-if="labels?.length" :x="W - pad.r" :y="height - 4" text-anchor="end" class="tk">{{ labels[labels.length - 1] }}</text>
    <path v-for="p in paths" :key="p.name" :d="p.d" :stroke="p.color" fill="none" stroke-width="2" vector-effect="non-scaling-stroke" />
  </svg>
  <div v-if="series.length > 1" class="legend">
    <span v-for="s in series" :key="s.name"><i :style="{ background: s.color }" />{{ s.name }}</span>
  </div>
</template>

<style scoped>
.chart { width: 100%; display: block; }
.tk { fill: #8b95a7; font-size: 10px; font-family: 'JetBrains Mono', monospace; }
.legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 11px; color: var(--muted); margin-top: 2px; }
.legend i { display: inline-block; width: 10px; height: 3px; margin-right: 4px; vertical-align: middle; border-radius: 2px; }
</style>
