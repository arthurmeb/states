<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { INDEX_MAP, formatIndex } from '~~/shared/indices'
import { dateOf } from '~~/shared/rules'
import type { LogEntry } from '~~/shared/types'
import { useGame } from '~/composables/useGame'

const { me, ui, snap, send, nations } = useGame()
const KIND: Record<LogEntry['kind'], { icon: string; label: string; color: string }> = {
  policy: { icon: '📜', label: 'Policy', color: '#4dabf7' },
  budget: { icon: '💰', label: 'Budget', color: '#ffd43b' },
  gov: { icon: '🏛', label: 'Government', color: '#e599f7' },
  strategy: { icon: '🧭', label: 'Strategy', color: '#da77f2' },
  local: { icon: '🏙', label: 'Provinces', color: '#63e6be' },
  build: { icon: '🏗', label: 'Projects', color: '#ffa94d' },
  war: { icon: '⚔', label: 'War', color: '#ff6b6b' },
  diplo: { icon: '🤝', label: 'Diplomacy', color: '#3bc9db' },
  territory: { icon: '🗺', label: 'Territory', color: '#a9e34b' },
}
const GROUPS: [string, string[]][] = [
  ['Economy', ['gdp', 'gdppc', 'growth', 'inflation', 'unemployment', 'exports', 'complexity', 'competitiveness', 'innovation', 'fdi']],
  ['Fiscal', ['debt', 'deficit', 'revenue', 'credit']],
  ['People', ['hdi', 'happiness', 'approval', 'lifeExp', 'education', 'health', 'poverty', 'gini', 'safety']],
  ['State', ['stability', 'democracy', 'freedom', 'cpi', 'infrastructure', 'renewables', 'airQuality']],
  ['Power', ['cnp', 'military', 'softPower', 'influence']],
]
const RANGES: [string, number][] = [['1y', 52], ['3y', 156], ['All', 1e9]]
const BRIEF = ['gdppc', 'growth', 'unemployment', 'inflation', 'approval', 'stability', 'debt', 'cnp']
const higher = (k: string) => INDEX_MAP[k]?.higher ?? true
const PCT = new Set(['gdp', 'gdppc', 'exports'])

const subject = ref<number>(ui.trajSubject ?? me.value!.id)
const rival = ref<number | null>([...nations.value.values()].find(n => n.name === 'Straits Republic' && n.id !== subject.value)?.id ?? null)
const metric = ref('gdppc')
const range = ref(156)
const kinds = ref(new Set<string>(Object.keys(KIND)))
const focus = ref<number | null>(null)

const fetchAll = () => { send({ t: 'trajectory', nation: subject.value }); if (rival.value != null) send({ t: 'trajectory', nation: rival.value }) }
onMounted(fetchAll)
watch(subject, v => { if (rival.value === v) rival.value = v === me.value?.id ? null : me.value?.id ?? null })
watch([subject, rival], fetchAll)
watch(() => Math.floor((snap.value?.tick ?? 0) / 7), fetchAll) // a new weekly sample exists
watch(() => ui.trajSubject, v => { if (v != null) subject.value = v }, { immediate: true })

const list = computed(() => [...nations.value.values()].sort((a, b) => (b.idx.gdp ?? 0) - (a.idx.gdp ?? 0)))
const S = computed(() => ui.trajectories[subject.value])
const R = computed(() => (rival.value != null ? ui.trajectories[rival.value] : undefined))
const subjN = computed(() => nations.value.get(subject.value))
const rivalN = computed(() => (rival.value != null ? nations.value.get(rival.value) : undefined))
const isMe = computed(() => subject.value === me.value?.id)

const ticks = computed(() => (S.value?.history.t ?? []).slice(-range.value))
function pick(tr: typeof S.value) {
  const T = ticks.value
  if (!tr) return T.map(() => NaN)
  const m = new Map<number, number>()
  tr.history.t.forEach((t, i) => m.set(t, tr.history.series[metric.value]?.[i] ?? NaN))
  return T.map(t => m.get(t) ?? NaN)
}
const series = computed(() => {
  const out = [{ name: subjN.value?.name ?? 'Nation', data: pick(S.value), color: subjN.value?.color ?? '#4dabf7' }]
  if (R.value && rivalN.value) out.push({ name: rivalN.value.name, data: pick(R.value), color: rivalN.value.color === out[0].color ? '#ffffff' : rivalN.value.color })
  return out
})
const labels = computed(() => (ticks.value.length ? [dateOf(ticks.value[0], false), dateOf(ticks.value[ticks.value.length - 1], false)] : []))
const log = computed(() => (S.value?.log ?? []).filter(e => kinds.value.has(e.kind)))
const rows = computed(() => log.value.map((e, k) => ({ e, k, fx: effect(e) })).reverse())
const idxAt = (t: number) => { const i = ticks.value.findIndex(x => x >= t); return i < 0 ? ticks.value.length - 1 : i }
const marks = computed(() => {
  const T = ticks.value
  if (!T.length) return []
  return log.value.map((e, k) => ({ e, k })).filter(({ e }) => e.t >= T[0])
    .map(({ e, k }) => ({ i: idxAt(e.t), color: KIND[e.kind].color, label: `${dateOf(e.t, false)} · ${e.text}`, on: focus.value === k }))
})
const fmt = (v: number) => formatIndex(INDEX_MAP[metric.value]?.fmt ?? 'num', v)

function valueAt(t: number) {
  const h = S.value?.history
  if (!h) return NaN
  const i = h.t.findIndex(x => x >= t)
  return i < 0 ? NaN : h.series[metric.value]?.[i] ?? NaN
}
/** What the metric did in the 26 weeks after a decision (or until now). */
function effect(e: LogEntry) {
  const h = S.value?.history
  if (!h?.t.length) return null
  const endT = Math.min(e.t + 182, h.t[h.t.length - 1])
  const a = valueAt(e.t), b = valueAt(endT)
  if (!isFinite(a) || !isFinite(b) || endT <= e.t) return null
  const pct = PCT.has(metric.value)
  const d = pct ? (a ? ((b - a) / Math.abs(a)) * 100 : 0) : b - a
  const good = higher(metric.value) ? d > 0 : d < 0
  return { txt: `${d >= 0 ? '+' : ''}${d.toFixed(pct || Math.abs(d) < 10 ? 1 : 0)}${pct ? '%' : ''}`, cls: Math.abs(d) < 0.05 ? 'muted' : good ? 'good' : 'bad', weeks: Math.round((endT - e.t) / 7) }
}

const briefing = computed(() => {
  const h = S.value?.history
  if (!h || h.t.length < 2) return []
  return BRIEF.map(k => {
    const s = h.series[k] ?? [], a = s[s.length - 2] ?? 0, b = s[s.length - 1] ?? 0, d = b - a
    const flat = Math.abs(d) < Math.max(1e-6, Math.abs(b) * 0.0005)
    return { k, label: INDEX_MAP[k]?.label ?? k, now: formatIndex(INDEX_MAP[k]?.fmt ?? 'num', b), arrow: flat ? '·' : d > 0 ? '▲' : '▼', cls: flat ? 'muted' : (d > 0) === higher(k) ? 'good' : 'bad' }
  })
})
function toggle(k: string) { const s = new Set(kinds.value); if (s.has(k)) s.delete(k); else s.add(k); kinds.value = s }
</script>

<template>
  <div class="traj">
    <div class="pickers">
      <label>Nation
        <select v-model.number="subject" class="field">
          <option v-for="n in list" :key="n.id" :value="n.id">{{ n.id === me?.id ? '★ ' : '' }}{{ n.name }}</option>
        </select>
      </label>
      <label>Compare with
        <select v-model="rival" class="field">
          <option :value="null">Nobody</option>
          <option v-for="n in list" :key="n.id" :value="n.id" :disabled="n.id === subject">{{ n.name }}</option>
        </select>
      </label>
      <div class="seg">
        <button v-for="[l, w] in RANGES" :key="l" :class="{ on: range === w }" @click="range = w">{{ l }}</button>
      </div>
    </div>

    <div v-if="briefing.length" class="brief">
      <div class="bh">📋 {{ isMe ? 'Your week' : `${subjN?.name ?? 'Their'} this week` }}</div>
      <div class="bgrid">
        <div v-for="b in briefing" :key="b.k" @click="metric = b.k">
          <span>{{ b.label }}</span><b class="mono">{{ b.now }}</b><i :class="b.cls">{{ b.arrow }}</i>
        </div>
      </div>
    </div>

    <div class="metrics">
      <div v-for="[g, ks] in GROUPS" :key="g" class="mg">
        <span class="gl">{{ g }}</span>
        <button v-for="k in ks" :key="k" class="chip" :class="{ on: metric === k }" @click="metric = k">{{ INDEX_MAP[k]?.label ?? k }}</button>
      </div>
    </div>

    <div class="chartbox">
      <div v-if="!S" class="muted">Loading trajectory…</div>
      <div v-else-if="ticks.length < 2" class="muted">History is sampled every game week. Check back after a week of game time.</div>
      <LineChart v-else :series="series" :labels="labels" :height="230" :fmt="fmt" :marks="marks" />
      <div class="kinds">
        <button v-for="(v, k) in KIND" :key="k" class="kd" :class="{ off: !kinds.has(k) }" @click="toggle(k)"><i :style="{ background: v.color }" />{{ v.icon }} {{ v.label }}</button>
      </div>
    </div>

    <h3>Decisions & events <small class="muted">· change in {{ INDEX_MAP[metric]?.label }} over the next 6 months</small></h3>
    <div v-if="!rows.length" class="muted small">Nothing logged yet. Every change to policy, budget, provinces, projects, wars, treaties and territory is recorded each week.</div>
    <div class="log">
      <div v-for="r in rows" :key="r.e.t + r.e.text" class="le" :class="{ on: focus === r.k }" @mouseenter="focus = r.k" @mouseleave="focus = null" @click="focus = r.k">
        <span class="dt mono">{{ dateOf(r.e.t, false) }}</span>
        <span class="ic">{{ KIND[r.e.kind].icon }}</span>
        <span class="tx">{{ r.e.text }}</span>
        <span v-if="r.fx" class="fx mono" :class="r.fx.cls" :title="`${INDEX_MAP[metric]?.label} over ${r.fx.weeks} weeks`">{{ r.fx.txt }}<small v-if="r.fx.weeks < 26"> {{ r.fx.weeks }}w</small></span>
      </div>
    </div>
    <p class="muted tiny">These effects are correlation, not proof. Other decisions, world shocks and the business cycle move the numbers too. Compare with a rival that didn't make the change to see the difference.</p>
  </div>
</template>

<style scoped>
.pickers { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; margin-bottom: 10px; }
.pickers label { display: flex; flex-direction: column; gap: 3px; font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; min-width: 180px; flex: 1; }
.pickers .seg { flex: none; }
.brief { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; background: rgba(255,255,255,.025); }
.bh { font-weight: 700; font-size: 12px; margin-bottom: 6px; }
.bgrid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px 12px; }
.bgrid > div { display: flex; align-items: baseline; gap: 6px; font-size: 11.5px; cursor: pointer; }
.bgrid span { color: var(--muted); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bgrid i { font-style: normal; font-size: 10px; }
.metrics { display: grid; gap: 4px; margin-bottom: 8px; }
.mg { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.gl { font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); width: 64px; font-weight: 700; }
.chip { background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 12px; padding: 3px 9px; font-size: 11.5px; color: #cbd2dc; }
.chip.on { border-color: var(--accent); color: var(--accent); background: rgba(255,212,59,.1); }
.chartbox { border: 1px solid var(--line); border-radius: 8px; padding: 10px; margin-bottom: 12px; }
.kinds { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.kd { background: none; border: 1px solid var(--line); border-radius: 6px; padding: 3px 7px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }
.kd i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.kd.off { opacity: .35; }
h3 { font-size: 14px; margin: 6px 0; }
h3 small { font-weight: 400; font-size: 11.5px; }
.le { display: grid; grid-template-columns: 92px 22px 1fr auto; gap: 6px; align-items: baseline; padding: 6px 4px; border-bottom: 1px solid rgba(255,255,255,.05); font-size: 12.5px; }
.le.on { background: rgba(255,255,255,.05); }
.dt { font-size: 11px; color: var(--muted); }
.fx { font-size: 12px; }
.fx small { color: var(--muted); }
.small { font-size: 12px; }
.tiny { font-size: 11px; margin-top: 10px; }
@media (max-width: 900px) {
  .bgrid { grid-template-columns: repeat(2, 1fr); }
  .le { grid-template-columns: 70px 18px 1fr; }
  .le .fx { grid-column: 3; }
  .gl { width: 100%; }
}
</style>
