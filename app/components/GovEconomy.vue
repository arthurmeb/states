<script setup lang="ts">
import { computed } from 'vue'
import { SECTORS, type SectorId, type SectorReq } from '~~/shared/sectors'
import { useGame, fmtMoney, fmtPop } from '~/composables/useGame'

const { me, snap, send, nations } = useGame()
const unlock = (req: SectorReq) => {
  const m = me.value!
  const v: Record<string, number> = { gdppc: m.idx.gdppc ?? 0, hc: m.stocks.hc ?? 0, tech: m.stocks.tech ?? 0, infra: m.stocks.infra ?? 0, inst: m.stocks.inst ?? 0 }
  let f = 1
  const missing: string[] = []
  for (const [k, need] of Object.entries(req)) {
    if (!need) continue
    const x = Math.max(0, Math.min(1, (v[k] - need * 0.8) / (need * 0.25)))
    f *= x
    if (x < 1) missing.push(`${k === 'gdppc' ? 'GDP/cap' : k === 'hc' ? 'education' : k === 'inst' ? 'institutions' : k === 'infra' ? 'infrastructure' : 'technology'} ${k === 'gdppc' ? '$' + Math.round(v[k]).toLocaleString() : Math.round(v[k])} / ${k === 'gdppc' ? '$' + need.toLocaleString() : need}`)
  }
  return { f, missing }
}
const rows = computed(() => {
  const m = me.value!
  const tot = m.sectors.output.reduce((a, b) => a + b, 0) || 1
  const jt = m.sectors.jobs.reduce((a, b) => a + b, 0) || 1
  return SECTORS.map((s, i) => ({ s, i, out: m.sectors.output[i], share: m.sectors.output[i] / tot, jobs: m.sectors.jobs[i], jshare: m.sectors.jobs[i] / jt, ex: m.sectors.exports[i], im: m.sectors.imports[i], price: snap.value?.market.prices[i] ?? 1, u: unlock(s.req) }))
})
function toggleSub(id: SectorId) {
  const cur = me.value!.subsidies
  const next = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id].slice(-3)
  send({ t: 'subsidies', sectors: next })
}
const subsidyIcons = computed(() => me.value?.subsidies.length ? me.value.subsidies.map(id => SECTORS.find(x => x.id === id)?.icon ?? '').join(' ') : 'none')
const partners = computed(() => me.value!.partners.slice(0, 10))
const totalEx = computed(() => me.value!.sectors.exports.reduce((a, b) => a + b, 0))
const totalIm = computed(() => me.value!.sectors.imports.reduce((a, b) => a + b, 0))
</script>

<template>
  <div v-if="me">
    <div class="grid4">
      <div class="stat"><div class="k">Exports</div><div class="v mono">{{ fmtMoney(totalEx * 12) }}<small>/yr</small></div></div>
      <div class="stat"><div class="k">Imports</div><div class="v mono">{{ fmtMoney(totalIm * 12) }}<small>/yr</small></div></div>
      <div class="stat"><div class="k">Economic complexity</div><div class="v mono">{{ Math.round(me.idx.complexity ?? 0) }}</div></div>
      <div class="stat"><div class="k">Industrial subsidies</div><div class="v mono">{{ me.budget.subsidies.toFixed(1) }}% GDP</div><div class="s">targets: {{ subsidyIcons }}</div></div>
    </div>
    <p class="hint">Industries climb a development ladder. Higher-tier sectors unlock as income, education, technology, infrastructure and institutions rise; they then grow toward where they are most profitable at world prices. Pick up to <b>three</b> target industries for subsidies (budget line in Taxes & budget) and use provincial focus, special economic zones and projects to steer location.</p>
    <table class="tbl">
      <thead><tr><th>Industry</th><th class="r">Output/mo</th><th>Share</th><th class="r">Jobs</th><th class="r">Exports</th><th class="r">Imports</th><th class="r">World price</th><th>Status</th><th /></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.s.id">
          <td><b>{{ r.s.icon }} {{ r.s.label }}</b><div class="muted tiny">{{ r.s.desc }}</div></td>
          <td class="r mono">{{ fmtMoney(r.out) }}</td>
          <td style="width:110px"><div class="bar"><i :style="{ width: Math.min(100, r.share * 300) + '%', background: r.s.color }" /></div><span class="tiny muted">{{ (r.share * 100).toFixed(1) }}%</span></td>
          <td class="r mono">{{ fmtPop(r.jobs) }}</td>
          <td class="r mono">{{ r.s.tradable ? fmtMoney(r.ex) : '—' }}</td>
          <td class="r mono">{{ r.s.tradable ? fmtMoney(r.im) : '—' }}</td>
          <td class="r mono" :class="r.price > 1.05 ? 'good' : r.price < 0.95 ? 'bad' : ''">{{ r.s.tradable ? r.price.toFixed(2) + '×' : '—' }}</td>
          <td class="tiny">
            <span v-if="r.u.f >= 1" class="good">✓ unlocked</span>
            <span v-else-if="r.u.f > 0" class="warn">partially ({{ Math.round(r.u.f * 100) }}%)</span>
            <span v-else class="bad">🔒 locked</span>
            <div v-for="m in r.u.missing" :key="m" class="muted">{{ m }}</div>
          </td>
          <td><button class="btn small" :class="me.subsidies.includes(r.s.id) ? 'primary' : ''" @click="toggleSub(r.s.id)">{{ me.subsidies.includes(r.s.id) ? '★ Target' : 'Target' }}</button></td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">Top trading partners</div>
    <table class="tbl">
      <thead><tr><th>Partner</th><th class="r">You export</th><th class="r">You import</th><th class="r">Your tariff</th><th class="r">Their tariff</th></tr></thead>
      <tbody>
        <tr v-for="p in partners" :key="p.id">
          <td><i class="swatch" :style="{ background: nations.get(p.id)?.color }" /> {{ nations.get(p.id)?.name }}</td>
          <td class="r mono">{{ fmtMoney(p.exports * 12) }}/yr</td>
          <td class="r mono">{{ fmtMoney(p.imports * 12) }}/yr</td>
          <td class="r mono">{{ p.tariffOut >= 0 ? p.tariffOut + '%' : 'default' }}</td>
          <td class="r mono">{{ p.tariffIn >= 0 ? p.tariffIn + '%' : 'default' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.v small { font-size: 11px; color: var(--muted); }
.hint { font-size: 12px; color: var(--muted); line-height: 1.5; margin: 10px 0; }
.tiny { font-size: 10.5px; }
</style>
