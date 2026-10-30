<script setup lang="ts">
import { computed } from 'vue'
import { BLOCS } from '~~/shared/policies'
import { useGame } from '~/composables/useGame'
import { DRIVER_INFO } from '~/utils/power'

const { ui, me } = useGame()
const key = computed(() => ui.why ?? '')
const MOD_KEY: Record<string, string> = { productivity: 'growth', inflation: 'inflation', unemployment: 'unemployment', credit: 'credit', pc: 'pc', stability: 'stability', legitimacy: 'legitimacy', corruption: 'corruption', institutions: 'institutions', fertility: 'fertility' }
const info = computed(() => {
  const k = key.value
  if (k.startsWith('bloc:')) {
    const b = BLOCS.find(x => x.id === k.slice(5))
    return { title: `${b?.icon ?? ''} ${b?.label ?? k} approval`, unit: 'target', desc: 'This faction’s approval drifts towards the sum of these forces.' }
  }
  return DRIVER_INFO[k] ?? { title: k, unit: '', desc: '' }
})
const rows = computed(() => (me.value?.drivers[key.value] ?? []).slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])))
const total = computed(() => rows.value.reduce((a, [, v]) => a + v, 0))
const scale = computed(() => Math.max(0.001, ...rows.value.map(([, v]) => Math.abs(v))))
const lowerBetter = computed(() => ['inflation', 'unemployment', 'corruption', 'coup'].includes(key.value) || (key.value === 'credit' && (me.value?.cond.creditGap ?? 0) > 5))
const sources = computed(() => {
  const mk = key.value.startsWith('bloc:') ? key.value : MOD_KEY[key.value]
  return mk ? me.value?.modSrc[mk] ?? [] : []
})
const fmt = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v) < 10 ? Math.abs(v).toFixed(2) : Math.abs(v).toFixed(1)}`
</script>

<template>
  <div v-if="ui.why && me" class="why-veil" @click.self="ui.why = null">
    <div class="why glass">
      <div class="row between">
        <div>
          <div class="eyebrow">Why?</div>
          <h3>{{ info.title }}</h3>
        </div>
        <button class="x" @click="ui.why = null">✕</button>
      </div>
      <p class="muted desc">{{ info.desc }}</p>
      <div v-if="!rows.length" class="muted">No data yet. Check back after a game day.</div>
      <div v-for="[label, v] in rows" :key="label" class="drow">
        <span class="lbl">{{ label }}</span>
        <div class="track">
          <i :style="{ width: (Math.abs(v) / scale) * 50 + '%', left: v >= 0 ? '50%' : 50 - (Math.abs(v) / scale) * 50 + '%' }" :class="(v >= 0) !== lowerBetter ? 'g' : 'b'" />
        </div>
        <span class="mono val">{{ fmt(v) }}</span>
      </div>
      <div v-if="rows.length" class="drow total"><span class="lbl">Total</span><span /><span class="mono val">{{ total.toFixed(2) }} <small class="muted">{{ info.unit }}</small></span></div>
      <template v-if="sources.length">
        <div class="eyebrow" style="margin-top:12px">Biggest policy effects</div>
        <div v-for="[label, v] in sources" :key="label" class="src row between"><span>{{ label }}</span><span class="mono" :class="(v >= 0) !== lowerBetter ? 'good' : 'bad'">{{ fmt(v) }}</span></div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.why-veil { position: fixed; inset: 0; z-index: 70; background: rgba(0, 0, 0, 0.45); display: grid; place-items: center; padding: 14px; }
.why { width: min(520px, 100%); max-height: 86vh; overflow-y: auto; padding: 16px 18px; background: var(--panel-solid); }
.eyebrow { font-size: 10.5px; color: var(--accent); text-transform: uppercase; letter-spacing: .12em; font-weight: 700; }
h3 { margin: 2px 0 0; font-size: 18px; }
.desc { font-size: 12px; line-height: 1.5; margin: 6px 0 12px; }
.x { background: none; border: 0; color: var(--muted); font-size: 18px; align-self: flex-start; }
.drow { display: grid; grid-template-columns: 170px 1fr 70px; gap: 8px; align-items: center; font-size: 12.5px; padding: 3px 0; }
.drow.total { border-top: 1px solid var(--line); margin-top: 4px; padding-top: 6px; font-weight: 700; }
.lbl { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.track { position: relative; height: 8px; background: rgba(255, 255, 255, .05); border-radius: 4px; }
.track::after { content: ''; position: absolute; left: 50%; top: -2px; bottom: -2px; width: 1px; background: rgba(255, 255, 255, .25); }
.track i { position: absolute; top: 0; bottom: 0; border-radius: 4px; }
.track i.g { background: var(--good); }
.track i.b { background: var(--bad); }
.val { text-align: right; }
.src { font-size: 12px; padding: 3px 0; border-bottom: 1px solid rgba(255, 255, 255, .04); }
@media (max-width: 600px) { .drow { grid-template-columns: 120px 1fr 56px; } }
</style>
