<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { dateOf, DAYS_PER_MONTH } from '~~/shared/rules'
import { SECTOR_INDEX } from '~~/shared/sectors'
import { useGame, fmtMoney, fmtPop } from '~/composables/useGame'

const { snap, me, ui, fly, provinces } = useGame()
const online = computed(() => snap.value?.nations.filter(n => n.online).length ?? 0)
const progress = ref(0)
let raf = 0
const loop = () => { raf = requestAnimationFrame(loop); const s = snap.value; progress.value = s ? Math.min(1, (performance.now() - ui.lastTickAt) / s.dayMs) : 0 }
onMounted(() => { raf = requestAnimationFrame(loop) })
onBeforeUnmount(() => cancelAnimationFrame(raf))
const clock = computed(() => {
  const ms = (snap.value?.dayMs ?? 120000) * DAYS_PER_MONTH
  return ms >= 3_600_000 ? `1 month = ${(ms / 3_600_000).toFixed(ms % 3_600_000 ? 1 : 0)} h` : `1 month = ${Math.max(1, Math.round(ms / 60000))} min`
})
const oil = computed(() => snap.value?.market.prices[SECTOR_INDEX.oil] ?? 1)
function home() { const m = me.value; const p = m && provinces.value[m.capital]; if (p) fly(p.lat, p.lon, 4) }
</script>

<template>
  <header class="top glass">
    <div class="brand">
      <button class="menu" title="Toggle panel" @click="ui.panelOpen = !ui.panelOpen">☰</button>
      <span class="logo">STATES</span>
      <div class="date" :title="clock">
        <span class="mono">{{ snap ? dateOf(snap.tick) : '—' }}</span>
        <i class="prog" :style="{ width: progress * 100 + '%' }" />
      </div>
      <span class="clock muted">{{ clock }}</span>
    </div>

    <template v-if="me">
      <div class="nation" @click="home"><span class="swatch" :style="{ background: me.color }" /><b>{{ me.name }}</b></div>
      <div class="stats">
        <div><span class="k">GDP</span><span class="mono">{{ fmtMoney(me.idx.gdp ?? 0) }}</span></div>
        <div><span class="k">Growth</span><span class="mono" :class="(me.idx.growth ?? 0) < 0 ? 'bad' : 'good'">{{ (me.idx.growth ?? 0).toFixed(1) }}%</span></div>
        <div><span class="k">Treasury</span><span class="mono" :class="me.treasury < 0 ? 'bad' : ''">{{ fmtMoney(me.treasury) }}</span></div>
        <div><span class="k">Pop</span><span class="mono">{{ fmtPop(me.pop) }}</span></div>
        <div><span class="k">Approval</span><span class="mono" :class="(me.idx.approval ?? 50) < 35 ? 'bad' : (me.idx.approval ?? 50) < 50 ? 'warn' : 'good'">{{ Math.round(me.idx.approval ?? 0) }}%</span></div>
      </div>
      <button class="btn govbtn" @click="ui.gov = ui.gov ? null : 'overview'">🏛 Government</button>
    </template>

    <div class="spacer" />
    <button v-if="snap?.issue" class="btn issue" @click="ui.showIssue = true">📜 {{ snap.issue.title }}</button>
    <span v-if="me && me.wars.length" class="tag war">⚔ WAR ×{{ me.wars.length }}</span>

    <a class="btn guide" href="/guide" target="_blank" title="How to play, references and data sources">📖 Guide</a>
    <div class="toggles">
      <button class="tg" :class="{ on: ui.basemap === 'night' }" title="Day / night lights" @click="ui.basemap = ui.basemap === 'day' ? 'night' : 'day'">{{ ui.basemap === 'night' ? '🌙' : '☀' }}</button>
      <button class="tg" :class="{ on: ui.showTrade }" title="Trade routes" @click="ui.showTrade = !ui.showTrade">🚢</button>
    </div>
    <div class="market">
      <div title="World oil price index"><span class="k">Oil</span><span class="mono" :class="oil > 1.1 ? 'bad' : oil < 0.9 ? 'good' : ''">{{ oil.toFixed(2) }}×</span><small v-if="snap?.market.oilShock.length" class="bad">⚠</small></div>
      <div><span class="k">Online</span><span class="mono">{{ online }}</span></div>
    </div>
  </header>
</template>

<style scoped>
.top { position: absolute; top: 10px; left: 12px; right: 12px; height: 48px; display: flex; align-items: center; gap: 14px; padding: 0 12px; z-index: 20; }
.brand { display: flex; align-items: center; gap: 10px; }
.menu { background: none; border: 0; font-size: 16px; color: var(--muted); padding: 2px 4px; }
.logo { font-weight: 800; letter-spacing: 0.32em; font-size: 14px; }
.date { position: relative; color: var(--accent); font-size: 12px; padding: 3px 9px; border: 1px solid rgba(255, 212, 59, 0.3); border-radius: 5px; overflow: hidden; min-width: 104px; text-align: center; }
.prog { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--accent); opacity: .7; }
.clock { font-size: 10.5px; white-space: nowrap; }
.nation { display: flex; align-items: center; gap: 7px; cursor: pointer; padding-left: 12px; border-left: 1px solid var(--line); white-space: nowrap; }
.stats, .market { display: flex; gap: 14px; }
.stats > div, .market > div { display: flex; align-items: baseline; gap: 5px; white-space: nowrap; }
.k { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
.govbtn { border-color: rgba(255, 212, 59, .5); color: var(--accent); }
.spacer { flex: 1; }
.issue { border-color: rgba(255, 212, 59, 0.6); color: var(--accent); animation: glow 2s infinite; max-width: 240px; overflow: hidden; text-overflow: ellipsis; }
@keyframes glow { 50% { box-shadow: 0 0 14px rgba(255, 212, 59, 0.45); } }
.toggles { display: flex; gap: 4px; }
.guide { text-decoration: none; }
.tg { background: rgba(255,255,255,.05); border: 1px solid var(--line); border-radius: 6px; width: 30px; height: 28px; font-size: 14px; }
.tg.on { border-color: var(--accent); background: rgba(255,212,59,.12); }
@media (max-width: 1450px) { .stats > div:nth-child(4), .stats > div:nth-child(2), .clock { display: none; } }
@media (max-width: 1150px) { .stats { display: none; } }
@media (max-width: 900px) {
  .top { top: calc(6px + env(safe-area-inset-top)); left: 6px; right: 6px; height: 44px; gap: 8px; padding: 0 8px; }
  .menu, .clock, .market, .issue, .logo { display: none; }
  .nation { padding-left: 8px; min-width: 0; overflow: hidden; }
  .nation b { overflow: hidden; text-overflow: ellipsis; max-width: 34vw; }
  .date { min-width: 0; padding: 3px 6px; font-size: 11px; }
  .govbtn { padding: 7px 9px; }
  .guide { padding: 6px 8px; font-size: 0; }
  .guide::before { content: '📖'; font-size: 14px; }
}
</style>
