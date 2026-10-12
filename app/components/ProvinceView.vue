<script setup lang="ts">
import { computed, ref } from 'vue'
import { TERRAIN, claimCost } from '~~/shared/rules'
import { SECTORS } from '~~/shared/sectors'
import { PROJECTS, PROJECT_MAP } from '~~/shared/projects'
import { LOCAL_POLICIES } from '~~/shared/policies'
import { useGame, fmtPop, fmtMoney, fmtTroops, fmtUsd } from '~/composables/useGame'

const { ui, snap, provinces, cities, countries, nations, me, send, relation } = useGame()
const id = computed(() => ui.provinceView!)
const P = computed(() => provinces.value[id.value])
const d = computed(() => ui.details[id.value])
const owner = computed(() => { const o = snap.value?.prov.owner[id.value] ?? -1; return o >= 0 ? nations.value.get(o) ?? null : null })
const mine = computed(() => !!me.value && owner.value?.id === me.value.id)
const country = computed(() => countries.value[P.value?.iso3 ?? ''])
const tab = ref<'overview' | 'economy' | 'policy' | 'build'>('overview')
const deployAmt = ref(5)

const sectors = computed(() => {
  const det = d.value
  if (!det) return []
  const jt = det.jobs.reduce((a, b) => a + b, 0) || 1
  const ot = det.output.reduce((a, b) => a + b, 0) || 1
  return SECTORS.map((s, i) => ({ s, jobs: det.jobs[i], jobShare: det.jobs[i] / jt, out: det.output[i], outShare: det.output[i] / ot }))
    .filter(x => x.jobShare > 0.002 || x.outShare > 0.002).sort((a, b) => b.out - a.out)
})
const cityList = computed(() => (P.value?.cities ?? []).map(c => cities.value[c]).filter(Boolean).sort((a, b) => b.pop - a.pop))
const STOCKS = [
  { k: 'infra', label: 'Infrastructure', icon: '🛤' }, { k: 'edu', label: 'Education', icon: '🎓' }, { k: 'health', label: 'Health', icon: '🏥' },
  { k: 'safety', label: 'Safety', icon: '🛡' }, { k: 'housing', label: 'Housing', icon: '🏘' }, { k: 'pollution', label: 'Pollution', icon: '🏭', bad: true },
] as const
const barColor = (v: number, bad = false) => { const x = bad ? 100 - v : v; return x < 30 ? 'var(--bad)' : x < 55 ? 'var(--warn)' : 'var(--good)' }

const gdppcNat = computed(() => me.value?.idx.gdppc ?? 20000)
const projCost = (cost: number) => +(cost * Math.max(0.35, Math.min(1.6, 0.35 + gdppcNat.value / 50000))).toFixed(1)
function buildReason(pid: string): string | null {
  const def = PROJECT_MAP[pid], det = d.value, Pv = P.value, m = me.value
  if (!def || !det || !m) return 'Unavailable'
  const existing = det.projects.find(x => x.id === pid)
  if (existing) return existing.done ? 'Built' : 'Underway'
  if (det.projects.filter(x => !x.done).length >= 2) return '2 projects underway'
  const r = def.req ?? {}
  if (r.coastal && !Pv.coastal) return 'Needs coast'
  if (r.oil && !Pv.oil) return 'Needs oil'
  if (r.metals && !Pv.metals) return 'Needs metals'
  if (r.fertility && !Pv.fertility) return 'Needs fertile land'
  if (r.attraction && Pv.attraction < r.attraction) return 'Needs attractions'
  if (r.hc && det.stocks.edu < r.hc) return `Education ≥ ${r.hc}`
  if (r.tech && (m.stocks.tech ?? 0) < r.tech) return `Technology ≥ ${r.tech}`
  if (r.inst && (m.stocks.inst ?? 0) < r.inst) return `Institutions ≥ ${r.inst}`
  return null
}
const canClaim = computed(() => {
  const s = snap.value, m = me.value
  if (!s || !m || owner.value) return false
  return [...P.value.nb, ...P.value.sea].some(q => s.prov.owner[q] === m.id)
})
const close = () => { ui.provinceView = null }
</script>

<template>
  <div class="pv-veil" @keydown.esc="close">
    <div class="pv glass">
      <header class="pv-head">
        <div>
          <div class="eyebrow">{{ TERRAIN[P.terrain].label }} · {{ P.region }} · heritage data: {{ country?.name ?? P.iso3 }}<span v-if="country?.estimated"> (est.)</span></div>
          <h1>{{ P.name }}</h1>
          <div class="owner">
            <template v-if="owner"><i class="swatch" :style="{ background: owner.color }" /><b>{{ owner.name }}</b>
              <span v-if="id === owner.capital" class="tag">★ capital</span>
              <span v-if="relation(owner.id) !== 'neutral' && relation(owner.id) !== 'self'" class="tag" :class="relation(owner.id)">{{ relation(owner.id) }}</span>
              <span v-if="d && d.core !== owner.id" class="tag warn">non-core region</span>
              <span v-if="d?.occupied" class="tag war">occupied</span>
            </template>
            <span v-else class="muted">Unclaimed land</span>
          </div>
        </div>
        <button class="x" @click="close">✕</button>
      </header>

      <div class="pv-body">
        <div class="scene">
          <IsoCity v-if="d" :key="id" :province="P" :detail="d" :color="owner?.color ?? '#adb5bd'" />
          <div v-else class="loading muted">Surveying the province…</div>
          <div v-if="d" class="scene-stats">
            <div><span>People</span><b>{{ fmtPop(d.pop) }}</b></div>
            <div><span>Urban</span><b>{{ Math.round(d.urban * 100) }}%</b></div>
            <div><span>GDP / cap</span><b>{{ fmtUsd(d.gdppc) }}</b></div>
            <div><span>Jobless</span><b :class="d.unemployment > 10 ? 'bad' : ''">{{ d.unemployment.toFixed(1) }}%</b></div>
            <div><span>Happiness</span><b>{{ d.happiness.toFixed(1) }}/10</b></div>
            <div><span>Unrest</span><b :class="d.unrest > 60 ? 'bad' : d.unrest > 30 ? 'warn' : ''">{{ d.unrest }}%</b></div>
          </div>
        </div>

        <aside class="side scroll">
          <nav class="seg tabs">
            <button :class="{ on: tab === 'overview' }" @click="tab = 'overview'">Overview</button>
            <button :class="{ on: tab === 'economy' }" @click="tab = 'economy'">Economy</button>
            <button v-if="mine" :class="{ on: tab === 'policy' }" @click="tab = 'policy'">Policy</button>
            <button v-if="mine" :class="{ on: tab === 'build' }" @click="tab = 'build'">Build</button>
          </nav>

          <template v-if="d && tab === 'overview'">
            <div class="section-title">Local conditions</div>
            <div v-for="s in STOCKS" :key="s.k" class="stock">
              <div class="row between"><span>{{ s.icon }} {{ s.label }}</span><span class="mono">{{ Math.round(d.stocks[s.k]) }}</span></div>
              <div class="bar"><i :style="{ width: d.stocks[s.k] + '%', background: barColor(d.stocks[s.k], 'bad' in s) }" /></div>
            </div>
            <div class="section-title">Cities</div>
            <div v-if="!cityList.length" class="muted small">No major cities — rural hinterland.</div>
            <div v-for="c in cityList" :key="c.id" class="row between city"><span>{{ c.capital ? '★ ' : '' }}{{ c.name }}</span><span class="mono muted">{{ fmtPop(c.pop) }}</span></div>
            <div class="section-title">Resources</div>
            <div class="row" style="flex-wrap:wrap;gap:4px">
              <span v-if="P.oil" class="tag oil">🛢 Oil {{ '●'.repeat(P.oil) }}</span>
              <span v-if="P.metals" class="tag metals">⛏ Metals {{ '●'.repeat(P.metals) }}</span>
              <span v-if="P.fertility" class="tag food">🌾 Fertile {{ '●'.repeat(P.fertility) }}</span>
              <span v-if="P.attraction" class="tag">🏖 Attractions {{ '★'.repeat(P.attraction) }}</span>
              <span v-if="P.strait" class="tag strait">⚓ {{ P.strait }}</span>
              <span v-if="P.coastal" class="tag coast">Coastal</span>
              <span class="tag">🛡 Defence {{ TERRAIN[P.terrain].defense }}×</span>
            </div>
            <div class="section-title">Projects</div>
            <div v-if="!d.projects.length" class="muted small">Nothing built yet.</div>
            <div v-for="p in d.projects" :key="p.id" class="proj">
              <span>{{ PROJECT_MAP[p.id]?.icon }} {{ PROJECT_MAP[p.id]?.label }}</span>
              <span v-if="p.done" class="good small">operational</span>
              <span v-else class="small mono warn">{{ Math.round((p.progress / (PROJECT_MAP[p.id]?.months ?? 1)) * 100) }}%</span>
            </div>
            <template v-if="mine">
              <div class="section-title">Garrison · {{ fmtTroops(d.garrison) }}</div>
              <div class="row"><input v-model.number="deployAmt" type="range" min="1" :max="Math.max(1, Math.ceil(Math.max(me!.reserve, d.garrison)))"><span class="mono">{{ deployAmt }}k</span></div>
              <div class="grid2">
                <button class="btn" :disabled="me!.reserve < 0.5" @click="send({ t: 'deploy', province: id, amount: deployAmt })">+ Deploy</button>
                <button class="btn" :disabled="d.garrison < 0.5" @click="send({ t: 'deploy', province: id, amount: -deployAmt })">− Withdraw</button>
              </div>
              <button v-if="id !== me!.capital" class="btn small" style="margin-top:8px" @click="send({ t: 'capital', province: id })">Move capital here ($5B)</button>
            </template>
            <template v-else-if="me && !owner">
              <div class="section-title">Annexation</div>
              <button class="btn primary block" :disabled="!canClaim" @click="send({ t: 'claim', province: id })">Annex for {{ fmtMoney(claimCost(me.provinces, snap!.prov.pop[id])) }}</button>
              <p v-if="!canClaim" class="muted small">Must border your territory.</p>
            </template>
          </template>

          <template v-if="d && tab === 'economy'">
            <div class="section-title row between"><span>Industries</span><span class="muted">output / month</span></div>
            <div v-for="x in sectors" :key="x.s.id" class="sector">
              <div class="row between"><span>{{ x.s.icon }} {{ x.s.label }}</span><span class="mono">{{ fmtMoney(x.out) }}</span></div>
              <div class="bar dual"><i :style="{ width: x.outShare * 100 + '%', background: x.s.color }" /></div>
              <div class="muted tiny">{{ fmtPop(x.jobs) }} jobs · {{ (x.jobShare * 100).toFixed(1) }}% of workers</div>
            </div>
            <div class="row between total"><b>Provincial GDP</b><b class="mono">{{ fmtMoney(d.gdp * 12) }}/yr</b></div>
          </template>

          <template v-if="d && mine && tab === 'policy'">
            <div v-for="lp in LOCAL_POLICIES" :key="lp.id">
              <div class="section-title">{{ lp.label }}</div>
              <div class="seg wrap">
                <button v-for="o in lp.options" :key="o.id" :class="{ on: d.policy[lp.id] === o.id }" @click="send({ t: 'local', province: id, id: lp.id, value: o.id })">{{ o.label }}</button>
              </div>
              <p class="hint">{{ lp.options.find(o => o.id === d!.policy[lp.id])?.desc }}</p>
            </div>
          </template>

          <template v-if="d && mine && tab === 'build'">
            <p class="hint">Treasury {{ fmtMoney(me!.treasury) }}. Projects permanently reshape this province — and show up in the city.</p>
            <div v-for="pr in PROJECTS" :key="pr.id" class="build" :class="{ dis: buildReason(pr.id) }">
              <div class="row between">
                <b>{{ pr.icon }} {{ pr.label }}</b>
                <button class="btn small" :class="buildReason(pr.id) ? '' : 'primary'" :disabled="!!buildReason(pr.id)" @click="send({ t: 'build', province: id, project: pr.id })">
                  {{ buildReason(pr.id) ?? `${fmtMoney(projCost(pr.cost))} · ${pr.months}mo` }}
                </button>
              </div>
              <div class="muted tiny">{{ pr.desc }}</div>
            </div>
          </template>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pv-veil { position: fixed; inset: 0; background: rgba(2, 4, 8, 0.6); z-index: 40; display: grid; place-items: center; padding: 14px; }
.pv { width: min(1500px, 100%); height: min(920px, calc(100vh - 28px)); display: flex; flex-direction: column; background: rgba(10, 14, 22, 0.96); }
.pv-head { display: flex; justify-content: space-between; padding: 14px 18px 8px; }
.eyebrow { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
h1 { margin: 2px 0 4px; font-size: 26px; }
.owner { display: flex; gap: 7px; align-items: center; flex-wrap: wrap; }
.x { background: none; border: 0; color: var(--muted); font-size: 18px; align-self: flex-start; }
.pv-body { flex: 1; display: grid; grid-template-columns: 1fr 380px; gap: 12px; padding: 0 14px 14px; min-height: 0; }
.scene { position: relative; min-height: 0; border-radius: 10px; overflow: hidden; border: 1px solid var(--line); }
.loading { display: grid; place-items: center; height: 100%; }
.scene-stats { position: absolute; top: 10px; left: 10px; right: 10px; display: flex; gap: 6px; flex-wrap: wrap; pointer-events: none; }
.scene-stats > div { background: rgba(8, 12, 20, 0.75); border: 1px solid var(--line); border-radius: 7px; padding: 5px 9px; display: flex; flex-direction: column; }
.scene-stats span { font-size: 9.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
.scene-stats b { font-size: 14px; }
.side { min-height: 0; padding-right: 4px; }
.tabs { margin-bottom: 6px; }
.stock { margin-bottom: 7px; font-size: 12px; }
.stock .bar { margin-top: 3px; }
.city { font-size: 12px; padding: 2px 0; }
.small { font-size: 11.5px; }
.tiny { font-size: 10.5px; margin-top: 1px; }
.proj { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
.sector { margin-bottom: 8px; font-size: 12px; }
.sector .bar { margin-top: 3px; }
.total { margin-top: 10px; padding-top: 8px; border-top: 1px solid var(--line); }
.seg.wrap { flex-wrap: wrap; }
.seg.wrap button { flex: 1 0 30%; }
.hint { font-size: 11px; color: var(--muted); margin: 4px 0 8px; line-height: 1.45; }
.build { padding: 8px 0; border-bottom: 1px solid var(--line); }
.build.dis { opacity: 0.6; }
@media (max-width: 1000px) { .pv-body { grid-template-columns: 1fr; grid-template-rows: 55% 1fr; } }
@media (max-width: 900px) {
  .pv-veil { padding: 0; }
  .pv { height: 100dvh; border-radius: 0; }
  .pv-head { padding: 10px 12px 6px; }
  h1 { font-size: 20px; }
  .x { font-size: 24px; padding: 4px 8px; }
  .pv-body { grid-template-columns: 1fr; grid-template-rows: 34dvh 1fr; padding: 0 8px 8px; gap: 8px; }
}
</style>
