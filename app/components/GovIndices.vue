<script setup lang="ts">
import { computed, ref } from 'vue'
import { INDICES, INDEX_CATEGORIES, formatIndex, type IndexCategory } from '~~/shared/indices'
import { useGame } from '~/composables/useGame'
import { useRanks } from '~/composables/useRanks'

const { me, snap } = useGame()
const { rankOf, worldMedian } = useRanks()
const cat = ref<IndexCategory | 'all'>('all')
const open = ref<string | null>(null)
const list = computed(() => INDICES.filter(i => cat.value === 'all' || i.category === cat.value))
const tone = (id: string) => {
  const r = rankOf(me.value!.id, id)
  if (!r.of) return ''
  const q = r.rank / r.of
  return q <= 0.25 ? 'good' : q >= 0.75 ? 'bad' : ''
}
const leaders = (id: string, higher: boolean) => [...(snap.value?.nations ?? [])].filter(n => n.idx[id] != null).sort((a, b) => (higher ? b.idx[id] - a.idx[id] : a.idx[id] - b.idx[id])).slice(0, 5)
</script>

<template>
  <div v-if="me">
    <p class="intro">Every index is recomputed daily from the simulation — seeded from World Bank, WGI and UNDP data for your territory, then driven by your policies. Methods approximate the named real-world indices.</p>
    <div class="seg cats">
      <button :class="{ on: cat === 'all' }" @click="cat = 'all'">All ({{ INDICES.length }})</button>
      <button v-for="c in INDEX_CATEGORIES" :key="c.id" :class="{ on: cat === c.id }" @click="cat = c.id">{{ c.icon }} {{ c.label }}</button>
    </div>
    <table class="tbl">
      <thead><tr><th>Index</th><th class="r">Value</th><th class="r">World rank</th><th class="r">World median</th><th>Method</th></tr></thead>
      <tbody>
        <template v-for="i in list" :key="i.id">
          <tr class="clk" @click="open = open === i.id ? null : i.id">
            <td><b>{{ i.label }}</b><div class="muted tiny">{{ i.desc }}</div></td>
            <td class="r mono" :class="tone(i.id)">{{ formatIndex(i.fmt, me.idx[i.id]) }}</td>
            <td class="r mono">#{{ rankOf(me.id, i.id).rank }} <span class="muted">/ {{ rankOf(me.id, i.id).of }}</span></td>
            <td class="r mono muted">{{ formatIndex(i.fmt, worldMedian(i.id)) }}</td>
            <td class="muted tiny">{{ i.method }}</td>
          </tr>
          <tr v-if="open === i.id" class="detail">
            <td colspan="5">
              <div class="row" style="align-items:flex-start;gap:20px">
                <div style="flex:1">
                  <LineChart v-if="me.history.series[i.id]?.length > 1" :series="[{ name: i.label, data: me.history.series[i.id], color: '#4dabf7' }]" :height="110" :fmt="v => formatIndex(i.fmt, v)" />
                  <div v-else class="muted tiny">Monthly history is recorded for headline indices.</div>
                </div>
                <div style="width:260px">
                  <div class="section-title">World leaders</div>
                  <div v-for="(n, k) in leaders(i.id, i.higher)" :key="n.id" class="row between tiny"><span>{{ k + 1 }}. <i class="swatch" :style="{ background: n.color }" /> {{ n.name }}</span><span class="mono">{{ formatIndex(i.fmt, n.idx[i.id]) }}</span></div>
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.intro { font-size: 12px; color: var(--muted); margin: 0 0 10px; max-width: 900px; line-height: 1.5; }
.cats { flex-wrap: wrap; margin-bottom: 10px; }
.cats button { flex: none; padding: 5px 10px; }
.tiny { font-size: 10.5px; }
.clk { cursor: pointer; }
.clk:hover td { background: rgba(255,255,255,.03); }
.detail td { background: rgba(255,255,255,.025); }
</style>
