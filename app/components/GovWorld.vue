<script setup lang="ts">
import { computed, ref } from 'vue'
import { INDICES, INDEX_MAP, formatIndex } from '~~/shared/indices'
import { SECTORS } from '~~/shared/sectors'
import { GOV_LABEL, STRATEGIES } from '~~/shared/rules'
import { useGame, fmtMoney, fmtPop } from '~/composables/useGame'

const { snap, me, nations, ui } = useGame()
const key = ref('cnp')
const def = computed(() => INDEX_MAP[key.value])
const rows = computed(() => [...(snap.value?.nations ?? [])].filter(n => n.idx[key.value] != null).sort((a, b) => (def.value.higher ? b.idx[key.value] - a.idx[key.value] : a.idx[key.value] - b.idx[key.value])))
const max = computed(() => Math.max(...rows.value.map(n => Math.abs(n.idx[key.value])), 1e-9))
const QUICK = ['cnp', 'gdp', 'gdppc', 'hdi', 'happiness', 'softPower', 'military', 'influence', 'democracy', 'competitiveness', 'innovation', 'epi']
const wars = computed(() => {
  const seen = new Set<string>(), out: [number, number][] = []
  for (const n of snap.value?.nations ?? []) for (const w of n.wars) { const k = [n.id, w].sort().join('-'); if (!seen.has(k)) { seen.add(k); out.push([n.id, w]) } }
  return out
})
const worldGdp = computed(() => (snap.value?.nations ?? []).reduce((a, n) => a + (n.idx.gdp ?? 0), 0))
</script>

<template>
  <div v-if="snap">
    <div class="grid4">
      <div class="stat"><div class="k">Nations</div><div class="v mono">{{ snap.nations.length }}</div><div class="s">{{ snap.nations.filter(n => !n.ai).length }} led by players</div></div>
      <div class="stat"><div class="k">States' GDP</div><div class="v mono">{{ fmtMoney(worldGdp) }}</div><div class="s">excluding unclaimed lands</div></div>
      <div class="stat"><div class="k">Trade blocs</div><div class="v mono">{{ snap.tradeBlocs.length }}</div></div>
      <div class="stat"><div class="k">Wars</div><div class="v mono" :class="wars.length ? 'bad' : ''">{{ wars.length }}</div></div>
    </div>

    <div class="section-title row between"><span>Rankings</span>
      <select v-model="key" class="field sel"><option v-for="i in INDICES" :key="i.id" :value="i.id">{{ i.label }}</option></select>
    </div>
    <div class="chips" style="margin-bottom:8px"><button v-for="q in QUICK" :key="q" class="chip btnchip" :class="{ on: key === q }" @click="key = q">{{ INDEX_MAP[q].label }}</button></div>
    <div class="muted tiny" style="margin-bottom:6px">{{ def.desc }} <span v-if="def.method">Method: {{ def.method }}.</span></div>
    <div class="rank">
      <div v-for="(n, i) in rows" :key="n.id" class="rr" :class="{ mine: n.id === me?.id }" @click="ui.inspectNation = n.id; ui.gov = null">
        <span class="pos mono">{{ i + 1 }}</span>
        <i class="swatch" :style="{ background: n.color }" />
        <span class="nm">{{ n.name }}<span v-if="!n.ai" class="pl">★</span></span>
        <span class="barwrap"><span class="b" :style="{ width: (Math.abs(n.idx[key]) / max * 100) + '%', background: n.color }" /></span>
        <span class="mono val">{{ formatIndex(def.fmt, n.idx[key]) }}</span>
        <span class="muted tiny meta">{{ GOV_LABEL[n.gov] }} · {{ STRATEGIES[n.strategy]?.label }} · {{ fmtPop(n.pop) }}</span>
      </div>
    </div>

    <div class="cols">
      <section>
        <div class="section-title">World commodity prices</div>
        <div v-for="(s, i) in SECTORS.filter(x => x.tradable)" :key="s.id" class="row between line">
          <span>{{ s.icon }} {{ s.label }}</span>
          <span class="mono" :class="snap.market.prices[SECTORS.indexOf(s)] > 1.05 ? 'good' : snap.market.prices[SECTORS.indexOf(s)] < 0.95 ? 'bad' : ''">{{ snap.market.prices[SECTORS.indexOf(s)].toFixed(2) }}×</span>
          <span v-if="i < 0" />
        </div>
        <div v-if="snap.market.oilShock.length" class="bad tiny" style="margin-top:6px">⚠ Oil supply shock: conflict at {{ snap.market.oilShock.join(', ') }}</div>
      </section>
      <section>
        <div class="section-title">Trade blocs</div>
        <div v-if="!snap.tradeBlocs.length" class="muted tiny">No trade blocs yet.</div>
        <div v-for="b in snap.tradeBlocs" :key="b.id" class="blocrow">
          <b :style="{ color: b.color }">{{ b.name }}</b> <span class="muted tiny">CET {{ b.cet }}% · led by {{ nations.get(b.founder)?.name }}</span>
          <div class="chips"><span v-for="m in b.members" :key="m" class="chip"><i class="swatch" :style="{ background: nations.get(m)?.color }" /> {{ nations.get(m)?.name }}</span></div>
        </div>
        <div class="section-title">Wars raging</div>
        <div v-if="!wars.length" class="muted tiny">The world is at peace… for now.</div>
        <div v-for="[a, b] in wars" :key="a + '-' + b" class="tiny line"><span :style="{ color: nations.get(a)?.color }">{{ nations.get(a)?.name }}</span> <span class="bad">⚔</span> <span :style="{ color: nations.get(b)?.color }">{{ nations.get(b)?.name }}</span></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.sel { width: 260px; padding: 5px 8px; font-size: 12px; }
.btnchip { cursor: pointer; border: 1px solid var(--line-strong); background: none; color: #cbd2dc; }
.btnchip.on { border-color: var(--accent); color: var(--accent); }
.rank { display: grid; gap: 1px; max-height: 460px; overflow-y: auto; }
.rr { display: grid; grid-template-columns: 26px 12px 220px 1fr 90px 260px; gap: 8px; align-items: center; padding: 4px 6px; border-radius: 5px; font-size: 12px; cursor: pointer; }
.rr:hover { background: rgba(255,255,255,.04); }
.rr.mine { background: rgba(255,212,59,.1); }
.pos { color: var(--muted); text-align: right; }
.nm { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.pl { color: var(--accent); margin-left: 4px; }
.barwrap { height: 6px; background: rgba(255,255,255,.05); border-radius: 3px; overflow: hidden; }
.b { display: block; height: 100%; border-radius: 3px; opacity: .85; }
.val { text-align: right; }
.meta { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 10px; }
.line { font-size: 12.5px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
.blocrow { margin-bottom: 8px; }
.tiny { font-size: 11px; }
</style>
