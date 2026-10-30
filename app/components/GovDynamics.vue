<script setup lang="ts">
import { computed } from 'vue'
import { POLICIES, optionMods, optionNote, type PolicyDef } from '~~/shared/policies'
import { useGame } from '~/composables/useGame'
import { effectChips } from '~/utils/effects'

const { me, snap, ui } = useGame()
const D = computed(() => me.value!.demo)
const F = computed(() => me.value!.fin)
const T = computed(() => snap.value?.trends)
const c = computed(() => me.value!.cond)
const hist = (k: string) => me.value?.history.series[k] ?? []
const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`

const ages = computed(() => [
  { label: 'Today', y: D.value.young, w: D.value.prime + D.value.mature, o: D.value.old },
  { label: 'In 10 years', y: D.value.in10.young, w: D.value.in10.working, o: D.value.in10.old },
  { label: 'In 20 years', y: D.value.in20.young, w: D.value.in20.working, o: D.value.in20.old },
])
const growth = computed(() => (D.value.births - D.value.deaths + D.value.mig) * 100)

// public debt in ten years if nothing changes: d' = d·(1+r)/(1+g) − primary balance
const debtPath = computed(() => {
  const m = me.value!
  const r = (m.idx.interest ?? 4) / 100, g = ((m.idx.growth ?? 2) + (m.idx.inflation ?? 2)) / 100
  const primary = ((m.ledger.net + (m.ledger.spending.interest ?? 0)) / Math.max(0.001, m.gdp)) * 100
  let d = m.idx.debt ?? 0
  const path = [d]
  for (let i = 0; i < 10; i++) { d = Math.max(0, d * (1 + r) / (1 + g) - primary); path.push(d) }
  return path
})

const credit = computed(() => ({ gap: F.value.credit - F.value.trend, risk: F.value.risk * 100 }))

// every policy, oldest first, with what it is doing to you right now
const inForce = computed(() => {
  const m = me.value!
  return POLICIES.map(p => {
    const v = m.policy[p.id]
    const yrs = m.since[p.id] ?? 0
    const now = optionMods(p, v, m.cond, yrs), base = p.kind === 'slider' ? p.mods(+v) : p.options.find(o => o.id === v)?.mods ?? {}
    const sit: Record<string, number> = {}
    for (const [k, x] of Object.entries(now)) { const d = x - (base[k] ?? 0); if (Math.abs(d) > 1e-3) sit[k] = d }
    return { p, label: optionLabel(p, v), yrs, note: optionNote(p, v, m.cond, yrs), chips: effectChips(sit, 4) }
  }).filter(x => x.note || x.chips.length).sort((a, b) => b.yrs - a.yrs)
})
function optionLabel(p: PolicyDef, v: string | number) {
  return p.kind === 'slider' ? `${v}${p.unit}` : p.options.find(o => o.id === v)?.label ?? String(v)
}
</script>

<template>
  <div v-if="me && T" class="dyn">
    <p class="intro">The slow forces that decide where your nation will be in twenty years. Nothing here changes overnight, and most of it was set in motion by decisions taken long ago. Click <b>why?</b> to see every cause.</p>

    <div class="grid">
      <!-- demography -->
      <section class="card">
        <div class="row between"><div class="section-title">👪 Population</div><button class="why" @click="ui.why = 'fertility'">why?</button></div>
        <div v-for="a in ages" :key="a.label" class="age">
          <span class="muted">{{ a.label }}</span>
          <div class="stack">
            <i class="y" :style="{ width: a.y * 100 + '%' }">{{ a.y > 0.08 ? pct(a.y) : '' }}</i>
            <i class="w" :style="{ width: a.w * 100 + '%' }">{{ pct(a.w) }}</i>
            <i class="o" :style="{ width: a.o * 100 + '%' }">{{ a.o > 0.06 ? pct(a.o) : '' }}</i>
          </div>
        </div>
        <div class="legend"><span><i class="y" />under 15</span><span><i class="w" />working age</span><span><i class="o" />over 65</span></div>
        <div class="kv">
          <div><span>Children per woman</span><b class="mono">{{ me.stocks.fertility.toFixed(2) }}</b></div>
          <div><span>Births · deaths · migration</span><b class="mono">{{ (D.births * 1000).toFixed(0) }} · {{ (D.deaths * 1000).toFixed(0) }} · {{ (D.mig * 1000).toFixed(1) }} ‰</b></div>
          <div><span>Population growth</span><b class="mono" :class="growth < 0 ? 'bad' : ''">{{ growth.toFixed(2) }}% / yr</b></div>
          <div><span>Pensions</span><b class="mono" :class="D.pensions > 10 ? 'bad' : ''">{{ D.pensions.toFixed(1) }}% of GDP</b></div>
          <div><span>Workers per pensioner</span><b class="mono">{{ (1 / Math.max(0.02, c.dep)).toFixed(1) }}</b></div>
        </div>
        <Sparkline v-if="hist('old').length > 1" :data="hist('old')" color="#ffa94d" />
        <p class="hint">Births follow income, education, housing costs and family policy; the effect on your workforce arrives 15–20 years later. An ageing population shrinks the labour force and raises pension and health bills automatically.</p>
      </section>

      <!-- money -->
      <section class="card">
        <div class="row between"><div class="section-title">🏦 Credit cycle</div><button class="why" @click="ui.why = 'credit'">why?</button></div>
        <div class="kv">
          <div><span>Private credit</span><b class="mono">{{ F.credit.toFixed(0) }}% of GDP</b></div>
          <div><span>Long-run trend</span><b class="mono">{{ F.trend.toFixed(0) }}%</b></div>
          <div><span>Gap</span><b class="mono" :class="credit.gap > 8 ? 'bad' : credit.gap > 4 ? 'warn' : ''">{{ credit.gap >= 0 ? '+' : '' }}{{ credit.gap.toFixed(1) }} pts</b></div>
          <div><span>Banking-crisis risk</span><b class="mono" :class="credit.risk > 8 ? 'bad' : credit.risk > 3 ? 'warn' : 'good'">{{ credit.risk.toFixed(1) }}% / yr</b></div>
          <div><span>Business cycle</span><b class="mono" :class="F.cycle < 1 ? 'bad' : 'good'">{{ ((F.cycle - 1) * 100).toFixed(1) }}% output</b></div>
          <div v-if="F.crisis > 0"><span>Banking crisis</span><b class="bad">{{ Math.round(F.crisis) }} months left</b></div>
          <div v-if="F.fund > 0"><span>Sovereign wealth fund</span><b class="mono">${{ F.fund.toFixed(0) }}B</b></div>
          <div v-if="F.fx > 0"><span>Currency crisis</span><b class="bad">{{ Math.round(F.fx) }} months</b></div>
        </div>
        <Sparkline v-if="hist('privateCredit').length > 1" :data="hist('privateCredit')" color="#e599f7" />
        <p class="hint">Low real interest rates, light regulation, open capital flows and optimism push lending above trend: growth and house prices boom. The bigger the gap, the likelier a crash that cuts output for two years and lands the bill on the state.</p>
      </section>

      <section class="card">
        <div class="section-title">📉 Debt in ten years, if nothing changes</div>
        <LineChart :series="[{ name: 'Public debt % GDP', data: debtPath, color: debtPath[10] > debtPath[0] ? '#ff8787' : '#69db7c' }]" :labels="['now', '+10 yrs']" :height="110" :fmt="(v: number) => v.toFixed(0) + '%'" />
        <div class="kv">
          <div><span>Debt now → in 10 years</span><b class="mono" :class="debtPath[10] > 120 ? 'bad' : ''">{{ debtPath[0].toFixed(0) }}% → {{ debtPath[10].toFixed(0) }}%</b></div>
          <div><span>Interest rate vs nominal growth</span><b class="mono">{{ (me.idx.interest ?? 0).toFixed(1) }}% vs {{ ((me.idx.growth ?? 0) + (me.idx.inflation ?? 0)).toFixed(1) }}%</b></div>
        </div>
        <p class="hint">When interest exceeds nominal growth, debt snowballs even with a balanced primary budget. At 220% of GDP you default.</p>
      </section>

      <!-- the world -->
      <section class="card">
        <div class="section-title">🌍 The world is changing</div>
        <div class="trend"><span>🌡 Global warming</span><b class="mono">+{{ T.temp.toFixed(2) }}°C</b><span class="muted">{{ T.co2.toFixed(0) }} Gt CO₂ a year · climate stress here: {{ (c.heat * 100).toFixed(0) }}/100</span></div>
        <div class="trend"><span>☀ Energy transition</span><b class="mono">{{ pct(T.green) }}</b><span class="muted">of world energy is renewable · oil demand {{ pct(T.oilDemand) }} of 2030</span></div>
        <div class="trend"><span>🤖 Automation</span><b class="mono">{{ pct(T.automation) }}</b><span class="muted">of routine work automated · your skills {{ me.stocks.hc.toFixed(0) }}/100</span></div>
        <div class="trend"><span>⛏ Your reserves</span><b class="mono">{{ pct(me.reserves) }}</b><span class="muted">of original oil & mineral reserves left · resources {{ pct(c.resource) }} of GDP</span></div>
        <p class="hint">Emissions from every nation heat the planet: tropical and arid land loses harvests and productivity, the far north gains a little, disasters grow more frequent. As renewables spread, oil demand and prices fall. Automation rewards skilled economies and squeezes the cheap-labour path to industry.</p>
      </section>
    </div>

    <div class="section-title">🕰 Policies in force, and what they do to you now</div>
    <p class="hint">The situational part of each policy's effect, beyond its headline effects: it depends on your circumstances and on how long the policy has been in place. A policy that helped a poor, young nation can hurt a rich, ageing one.</p>
    <div class="pol">
      <div v-for="x in inForce" :key="x.p.id" class="prow">
        <div><b>{{ x.p.label }}</b>: {{ x.label }} <span class="muted mono">{{ x.yrs.toFixed(0) }} yrs</span></div>
        <div class="muted note">{{ x.note }}</div>
        <div class="chips"><span v-for="ch in x.chips" :key="ch.text" class="chip" :class="ch.good ? 'g' : 'b'">{{ ch.text }}</span></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intro { font-size: 12.5px; color: var(--muted); margin: 0 0 12px; line-height: 1.5; max-width: 900px; }
.grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 14px; }
.card { border: 1px solid var(--line); border-radius: 9px; padding: 10px 12px; background: rgba(255, 255, 255, .02); }
.why { background: none; border: 1px solid var(--line); border-radius: 5px; font-size: 10.5px; color: var(--muted); padding: 1px 6px; }
.why:hover { color: var(--accent); border-color: var(--accent); }
.age { display: grid; grid-template-columns: 82px 1fr; gap: 8px; align-items: center; font-size: 11.5px; margin-bottom: 4px; }
.stack { display: flex; height: 18px; border-radius: 4px; overflow: hidden; }
.stack i { display: flex; align-items: center; justify-content: center; font-style: normal; font-size: 10px; font-weight: 700; color: rgba(0, 0, 0, .7); transition: width .6s; }
.y { background: #74c0fc; } .w { background: #8ce99a; } .o { background: #ffa94d; }
.legend { display: flex; gap: 12px; font-size: 10.5px; color: var(--muted); margin: 2px 0 8px 90px; }
.legend i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
.kv { display: grid; gap: 3px; font-size: 12px; margin: 6px 0; }
.kv > div { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px solid rgba(255, 255, 255, .04); padding: 2px 0; }
.kv span { color: var(--muted); }
.hint { font-size: 11.5px; color: var(--muted); line-height: 1.5; margin: 6px 0 0; }
.trend { display: grid; grid-template-columns: 150px 64px 1fr; gap: 8px; align-items: baseline; font-size: 12.5px; padding: 5px 0; border-bottom: 1px solid rgba(255, 255, 255, .04); }
.trend .muted { font-size: 11px; }
.pol { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 7px; }
.prow { border: 1px solid var(--line); border-radius: 8px; padding: 7px 9px; font-size: 12px; display: grid; gap: 3px; }
.note { font-size: 11.5px; line-height: 1.4; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .trend { grid-template-columns: 1fr auto; } .trend .muted { grid-column: 1 / -1; } }
</style>
