<script setup lang="ts">
import { computed } from 'vue'
import { useGame, type MapMode } from '~/composables/useGame'
import { TERRAIN } from '~~/shared/rules'
import { SECTORS } from '~~/shared/sectors'
const { ui, me, snap } = useGame()
const MODES: { id: MapMode; label: string; needsMe?: boolean }[] = [
  { id: 'political', label: 'Political' }, { id: 'diplomatic', label: 'Diplomatic', needsMe: true }, { id: 'blocs', label: 'Trade blocs' },
  { id: 'influence', label: 'My influence', needsMe: true }, { id: 'wealth', label: 'Wealth' }, { id: 'development', label: 'Development' },
  { id: 'industry', label: 'Industry' }, { id: 'resources', label: 'Resources' }, { id: 'population', label: 'Population' },
  { id: 'unrest', label: 'Unrest' }, { id: 'terrain', label: 'Terrain' },
]
const legend = computed<[string, string][] | null>(() => {
  switch (ui.mapMode) {
    case 'diplomatic': return [['#ffd43b', 'You'], ['#40c057', 'Ally'], ['#94d82d', 'Bloc'], ['#22b8cf', 'Pact'], ['#e8590c', 'Sanctioned'], ['#fa5252', 'Enemy'], ['#868e96', 'Neutral']]
    case 'blocs': return (snap.value?.tradeBlocs ?? []).map(b => [b.color, b.name] as [string, string])
    case 'resources': return [['#a855f7', 'Oil'], ['#ff8c00', 'Metals'], ['#22d3ee', 'Strait'], ['#4caf50', 'Fertile']]
    case 'wealth': return [['#7a1f1f', '$2k'], ['#c2410c', '$6k'], ['#eab308', '$15k'], ['#84cc16', '$30k'], ['#22c55e', '$50k'], ['#a5f3fc', '$80k+']]
    case 'development': return [['#6441a5', 'Low'], ['#2c7be5', 'Medium'], ['#00d97e', 'High'], ['#e6fffa', 'Very high']]
    case 'population': return [['#1f4e8c', 'Sparse'], ['#3f8fd2', ''], ['#f2c14e', ''], ['#f25c54', 'Dense']]
    case 'unrest': return [['#2b8a3e', 'Calm'], ['#fab005', ''], ['#f76707', ''], ['#c92a2a', 'Revolt']]
    case 'influence': return [['#3a0ca3', 'Little'], ['#7209b7', ''], ['#f72585', ''], ['#ffd6ff', 'Dominant']]
    case 'industry': return SECTORS.filter(s => s.tradable).map(s => [s.color, s.label.split(' ')[0]] as [string, string])
    case 'terrain': return Object.values(TERRAIN).map(t => [t.color, t.label.split(' ').pop()!] as [string, string])
    default: return null
  }
})
</script>

<template>
  <div class="modes">
    <div v-if="legend?.length" class="legend glass">
      <span v-for="([c, l], i) in legend" :key="i" class="lg"><i class="swatch" :style="{ background: c }" />{{ l }}</span>
    </div>
    <div class="modebar glass">
      <button v-for="m in MODES" :key="m.id" :class="{ on: ui.mapMode === m.id }" :disabled="m.needsMe && !me" @click="ui.mapMode = m.id">{{ m.label }}</button>
    </div>
  </div>
</template>

<style scoped>
.modes { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 15; display: flex; flex-direction: column; align-items: center; gap: 6px; max-width: calc(100vw - 800px); min-width: 520px; }
.modebar { display: flex; flex-wrap: wrap; justify-content: center; padding: 3px; gap: 2px; border-radius: 9px; }
.modebar button { background: none; border: 0; padding: 6px 9px; border-radius: 6px; font-size: 11.5px; font-weight: 600; color: var(--muted); }
.modebar button.on { background: rgba(255, 255, 255, 0.13); color: var(--text); }
.modebar button:disabled { opacity: 0.35; }
.legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; padding: 5px 10px; font-size: 11px; }
.lg { display: inline-flex; align-items: center; gap: 4px; }
@media (max-width: 1300px) { .modes { min-width: 0; max-width: 60vw; } }
@media (max-width: 900px) {
  .modes { left: 8px; right: 8px; transform: none; max-width: none; min-width: 0; bottom: calc(64px + env(safe-area-inset-bottom)); }
  .modebar button { padding: 9px 11px; font-size: 13px; }
}
</style>
