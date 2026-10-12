<script setup lang="ts">
import { computed, ref } from 'vue'
import { SECTORS } from '~~/shared/sectors'
import { PROJECT_MAP } from '~~/shared/projects'
import { useGame, fmtPop, fmtMoney, fmtUsd } from '~/composables/useGame'

const { snap, provinces, me, ui, openProvince } = useGame()
type Key = 'name' | 'pop' | 'gdp' | 'gdppc' | 'unemployment' | 'happiness' | 'unrest' | 'edu' | 'infra'
const sortKey = ref<Key>('pop')
const desc = ref(true)
const rows = computed(() => {
  const list = (snap.value?.myProvinces ?? []).map(d => {
    const top = d.output.reduce((b, v, i) => (SECTORS[i].tradable && v > d.output[b] ? i : b), 0)
    return { d, P: provinces.value[d.id], top, name: provinces.value[d.id]?.name ?? '', edu: d.stocks.edu, infra: d.stocks.infra }
  })
  const k = sortKey.value
  return list.sort((a, b) => {
    const va = k === 'name' ? a.name : k === 'edu' || k === 'infra' ? a[k] : a.d[k]
    const vb = k === 'name' ? b.name : k === 'edu' || k === 'infra' ? b[k] : b.d[k]
    return (va > vb ? 1 : va < vb ? -1 : 0) * (desc.value ? -1 : 1)
  })
})
const projectIcons = (list: { id: string; done: boolean }[]) => list.map(x => (PROJECT_MAP[x.id]?.icon ?? '') + (x.done ? '' : '…')).join(' ')
const sort = (k: Key) => { if (sortKey.value === k) desc.value = !desc.value; else { sortKey.value = k; desc.value = true } }
const open = (id: number) => { ui.gov = null; openProvince(id) }
const totals = computed(() => {
  const l = snap.value?.myProvinces ?? []
  return { core: l.filter(d => d.core === me.value?.id).length, projects: l.reduce((a, d) => a + d.projects.filter(p => p.done).length, 0), building: l.reduce((a, d) => a + d.projects.filter(p => !p.done).length, 0) }
})
</script>

<template>
  <div v-if="me">
    <div class="grid4">
      <div class="stat"><div class="k">Provinces</div><div class="v mono">{{ me.provinces }}</div><div class="s">{{ totals.core }} heartland · {{ me.provinces - totals.core }} non-core</div></div>
      <div class="stat"><div class="k">Population</div><div class="v mono">{{ fmtPop(me.pop) }}</div><div class="s">{{ Math.round(me.idx.urban ?? 0) }}% urban</div></div>
      <div class="stat"><div class="k">Projects</div><div class="v mono">{{ totals.projects }}</div><div class="s">{{ totals.building }} under construction</div></div>
      <div class="stat"><div class="k">Regional inequality</div><div class="v mono">{{ rows.length ? (Math.max(...rows.map(r => r.d.gdppc)) / Math.max(1, Math.min(...rows.map(r => r.d.gdppc)))).toFixed(1) + '×' : '—' }}</div><div class="s">richest vs poorest province</div></div>
    </div>
    <p class="hint">Every province has its own economy, services, people and policies. Click a row to enter its city view and manage it: development focus, special economic zones, autonomy, investment priority, security and land use — and construction projects.</p>
    <table class="tbl">
      <thead><tr>
        <th class="clk" @click="sort('name')">Province</th><th class="r clk" @click="sort('pop')">People</th><th class="r clk" @click="sort('gdp')">GDP/yr</th><th class="r clk" @click="sort('gdppc')">GDP/cap</th>
        <th>Main industry</th><th class="r clk" @click="sort('unemployment')">Jobless</th><th class="r clk" @click="sort('happiness')">Happy</th><th class="r clk" @click="sort('unrest')">Unrest</th>
        <th class="r clk" @click="sort('edu')">Edu</th><th class="r clk" @click="sort('infra')">Infra</th><th>Projects</th><th>Focus</th>
      </tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.d.id" class="clk" @click="open(r.d.id)">
          <td><b>{{ r.name }}</b>{{ r.d.id === me.capital ? ' ★' : '' }}<div class="muted tiny">{{ r.P?.region }}{{ r.d.core !== me.id ? ' · non-core' : '' }}{{ r.d.occupied ? ' · occupied' : '' }}</div></td>
          <td class="r mono">{{ fmtPop(r.d.pop) }}</td>
          <td class="r mono">{{ fmtMoney(r.d.gdp * 12) }}</td>
          <td class="r mono">{{ fmtUsd(r.d.gdppc) }}</td>
          <td>{{ SECTORS[r.top].icon }} {{ SECTORS[r.top].label.split(' ')[0] }}</td>
          <td class="r mono" :class="r.d.unemployment > 10 ? 'bad' : ''">{{ r.d.unemployment.toFixed(1) }}%</td>
          <td class="r mono">{{ r.d.happiness.toFixed(1) }}</td>
          <td class="r mono" :class="r.d.unrest > 60 ? 'bad' : r.d.unrest > 30 ? 'warn' : ''">{{ r.d.unrest }}%</td>
          <td class="r mono">{{ Math.round(r.edu) }}</td>
          <td class="r mono">{{ Math.round(r.infra) }}</td>
          <td>{{ projectIcons(r.d.projects) }}</td>
          <td class="tiny">{{ r.d.policy.focus }}{{ r.d.policy.sez === 'on' ? ' · SEZ' : '' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.hint { font-size: 12px; color: var(--muted); line-height: 1.5; margin: 10px 0; }
.clk { cursor: pointer; }
.tiny { font-size: 10.5px; }
</style>
