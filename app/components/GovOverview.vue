<script setup lang="ts">
import { computed } from 'vue'
import { BLOCS } from '~~/shared/policies'
import { INDEX_MAP, formatIndex } from '~~/shared/indices'
import { dateOf } from '~~/shared/rules'
import { useGame, fmtMoney, fmtTroops } from '~/composables/useGame'
import { useRanks } from '~/composables/useRanks'

const { me, snap, ui } = useGame()
const { rankOf } = useRanks()
const KPIS = ['gdp', 'gdppc', 'growth', 'inflation', 'unemployment', 'debt', 'hdi', 'happiness', 'approval', 'stability', 'softPower', 'cnp']
const fmt = (k: string, v: number | undefined) => formatIndex(INDEX_MAP[k]?.fmt ?? 'num', v)
const hist = (k: string) => me.value?.history.series[k] ?? []
const alerts = computed(() => {
  const m = me.value!, I = m.idx, out: { t: string; kind: 'bad' | 'warn' | 'info'; go?: () => void }[] = []
  if (snap.value?.issue) out.push({ t: `📜 Cabinet decision needed: ${snap.value.issue.title}`, kind: 'warn', go: () => { ui.showIssue = true } })
  const props = snap.value?.proposals.filter(p => p.to === m.id) ?? []
  if (props.length) out.push({ t: `🤝 ${props.length} diplomatic proposal(s) awaiting your answer`, kind: 'info', go: () => { ui.gov = 'foreign' } })
  if (m.wars.length) out.push({ t: `⚔ At war with ${m.wars.length} nation(s). War weariness ${Math.round(m.warWeariness)}%.`, kind: 'bad', go: () => { ui.gov = 'defense' } })
  if ((I.debt ?? 0) > 100) out.push({ t: `💸 Public debt at ${Math.round(I.debt)}% of GDP. Credit rating ${formatIndex('rating', I.credit)}.`, kind: 'bad', go: () => { ui.gov = 'budget' } })
  else if ((I.deficit ?? 0) < -4) out.push({ t: `💸 Running a deficit of ${Math.abs(I.deficit).toFixed(1)}% of GDP.`, kind: 'warn', go: () => { ui.gov = 'budget' } })
  if ((I.inflation ?? 0) > 8) out.push({ t: `📈 Inflation is ${I.inflation.toFixed(1)}%.`, kind: 'warn' })
  if ((I.unemployment ?? 0) > 10) out.push({ t: `👷 Unemployment is ${I.unemployment.toFixed(1)}%.`, kind: 'warn' })
  if ((I.stability ?? 50) < 35) out.push({ t: `🔥 Stability is ${Math.round(I.stability)}%. Unrest is spreading.`, kind: 'bad' })
  const hot = snap.value?.myProvinces.filter(p => p.unrest > 60).length ?? 0
  if (hot) out.push({ t: `🔥 ${hot} province(s) near revolt.`, kind: 'bad', go: () => { ui.gov = 'territories' } })
  if (m.protectedUntil > (snap.value?.tick ?? 0)) out.push({ t: `🛡 International protection until ${dateOf(m.protectedUntil, false)}.`, kind: 'info' })
  if (!out.length) out.push({ t: '✅ The nation is calm. Plan for the long term.', kind: 'info' })
  return out
})
const STOCKS = [
  ['tech', 'Technology', '🔬'], ['inst', 'Institutions', '⚖'], ['corruption', 'Corruption', '🕳'], ['cohesion', 'Social cohesion', '🤝'],
  ['culture', 'Culture', '🎭'], ['sports', 'Sport', '🏟'], ['brand', 'Global brands', '🏷'], ['diplomacy', 'Diplomatic network', '🕊'],
  ['milTech', 'Military tech', '🛩'], ['renewables', 'Renewables', '☀'],
] as const
const RANKS = ['cnp', 'gdp', 'hdi', 'softPower', 'military', 'influence', 'happiness', 'democracy', 'competitiveness', 'innovation']
const barColor = (v: number) => (v < 30 ? 'var(--bad)' : v < 55 ? 'var(--warn)' : 'var(--good)')
</script>

<template>
  <div v-if="me">
    <div class="alerts">
      <div v-for="(a, i) in alerts" :key="i" class="alert" :class="a.kind" @click="a.go?.()">{{ a.t }}</div>
    </div>

    <div class="kpi-grid">
      <div v-for="k in KPIS" :key="k" class="stat kpi">
        <div class="row between"><span class="k">{{ INDEX_MAP[k].label }}</span><span class="rk muted">#{{ rankOf(me.id, k).rank }}</span></div>
        <div class="v mono">{{ fmt(k, me.idx[k]) }}</div>
        <Sparkline :data="hist(k)" :color="INDEX_MAP[k].higher ? '#4dabf7' : '#ff8787'" />
      </div>
    </div>

    <div class="cols">
      <section>
        <div class="section-title">Factions · who holds power</div>
        <div v-for="b in BLOCS" :key="b.id" class="bloc">
          <div class="row between">
            <span>{{ b.icon }} {{ b.label }} <span class="muted tiny">weight {{ Math.round((me.blocWeights[b.id] ?? 0) * 100) }}%</span></span>
            <span class="mono">{{ Math.round(me.blocs[b.id]) }}%</span>
          </div>
          <div class="bar"><i :style="{ width: me.blocs[b.id] + '%', background: barColor(me.blocs[b.id]) }" /></div>
        </div>
        <p class="hint">Approval is the weighted average: {{ Math.round(me.idx.approval ?? 0) }}%. Weights shift with demographics — urbanisation empowers the middle class, industry the unions — and with your system of government.</p>
      </section>
      <section>
        <div class="section-title">National capital</div>
        <div v-for="[k, l, ic] in STOCKS" :key="k" class="bloc">
          <div class="row between"><span>{{ ic }} {{ l }}</span><span class="mono">{{ Math.round(me.stocks[k] ?? 0) }}</span></div>
          <div class="bar"><i :style="{ width: (me.stocks[k] ?? 0) + '%', background: k === 'corruption' ? barColor(100 - me.stocks[k]) : barColor(me.stocks[k]) }" /></div>
        </div>
      </section>
      <section>
        <div class="section-title">World standing</div>
        <div v-for="k in RANKS" :key="k" class="rank-row row between">
          <span>{{ INDEX_MAP[k].label }}</span>
          <span><b class="mono">#{{ rankOf(me.id, k).rank }}</b> <span class="muted tiny">of {{ rankOf(me.id, k).of }}</span></span>
        </div>
        <div class="section-title">Forces</div>
        <div class="rank-row row between"><span>Active troops</span><b class="mono">{{ fmtTroops(me.troops) }}</b></div>
        <div class="rank-row row between"><span>Monthly balance</span><b class="mono" :class="me.ledger.net < 0 ? 'bad' : 'good'">{{ fmtMoney(me.ledger.net) }}</b></div>
      </section>
    </div>

    <div class="section-title">Long-term trends</div>
    <div class="grid2">
      <div class="stat"><LineChart :series="[{ name: 'HDI ×100', data: hist('hdi').map(v => v * 100), color: '#51cf66' }, { name: 'Happiness ×10', data: hist('happiness').map(v => v * 10), color: '#ffd43b' }, { name: 'Approval', data: hist('approval'), color: '#4dabf7' }]" /></div>
      <div class="stat"><LineChart :series="[{ name: 'Soft power', data: hist('softPower'), color: '#e599f7' }, { name: 'Military', data: hist('military'), color: '#ff8787' }, { name: 'Comprehensive power', data: hist('cnp'), color: '#ffd43b' }]" /></div>
    </div>
  </div>
</template>

<style scoped>
.alerts { display: grid; gap: 5px; margin-bottom: 12px; }
.alert { padding: 7px 11px; border-radius: 7px; font-size: 12.5px; cursor: pointer; border: 1px solid; }
.alert.bad { background: rgba(255, 80, 80, 0.1); border-color: rgba(255, 80, 80, 0.35); color: #ffc9c9; }
.alert.warn { background: rgba(252, 196, 25, 0.08); border-color: rgba(252, 196, 25, 0.35); color: #ffe8a1; }
.alert.info { background: rgba(77, 171, 247, 0.07); border-color: rgba(77, 171, 247, 0.3); color: #c5e3fb; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(165px, 1fr)); gap: 7px; }
.kpi .rk { font-size: 10.5px; }
.cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
.bloc { margin-bottom: 7px; font-size: 12px; }
.bloc .bar { margin-top: 3px; }
.tiny { font-size: 10.5px; }
.hint { font-size: 11px; color: var(--muted); line-height: 1.5; }
.rank-row { font-size: 12.5px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
@media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } }
</style>
