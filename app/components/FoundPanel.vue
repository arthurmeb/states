<script setup lang="ts">
import { ref, computed } from 'vue'
import { TERRAIN } from '~~/shared/rules'
import { useGame, fmtPop, fmtUsd } from '~/composables/useGame'

const { ui, snap, provinces, countries, cities, send } = useGame()
const COLORS = ['#ff6b6b', '#f783ac', '#da77f2', '#9775fa', '#748ffc', '#4dabf7', '#3bc9db', '#38d9a9', '#69db7c', '#a9e34b', '#ffd43b', '#ffa94d', '#e8590c', '#ffffff']
const name = ref('')
const leader = ref('')
const motto = ref('')
const color = ref(COLORS[Math.floor(Math.random() * COLORS.length)])

const target = computed(() => {
  const id = ui.selected
  if (id == null || !snap.value) return null
  const p = provinces.value[id]
  if (!p) return null
  const owner = snap.value.prov.owner
  const free = owner[id] === -1 && p.terrain !== 'ice'
  const region = [id, ...p.nb.filter(q => owner[q] === -1 && provinces.value[q].terrain !== 'ice')]
  const rp = region.map(q => provinces.value[q])
  return {
    p, free, size: region.length,
    pop: region.reduce((s, q) => s + snap.value!.prov.pop[q], 0),
    gdppc: region.reduce((s, q) => s + snap.value!.prov.gdppc[q] * snap.value!.prov.pop[q], 0) / Math.max(1, region.reduce((s, q) => s + snap.value!.prov.pop[q], 0)),
    cities: rp.flatMap(q => q.cities.map(i => cities.value[i])).filter(Boolean).sort((a, b) => b.pop - a.pop).slice(0, 5),
    attraction: rp.reduce((s, q) => s + q.attraction, 0),
    oil: rp.reduce((s, q) => s + q.oil, 0), metals: rp.reduce((s, q) => s + q.metals, 0),
    fertility: rp.reduce((s, q) => s + q.fertility, 0), coastal: rp.filter(q => q.coastal).length,
    straits: [...new Set(rp.map(q => q.strait).filter(Boolean))],
    food: rp.reduce((s, q) => s + TERRAIN[q.terrain].food * (1 + 0.4 * q.fertility), 0) / region.length,
  }
})

const traits = computed(() => {
  const t = target.value
  if (!t) return []
  const out: { text: string; good: boolean }[] = []
  if (t.oil >= 4) out.push({ text: 'Major oil reserves: a rentier economy is possible', good: true })
  else if (t.oil) out.push({ text: 'Some oil fields', good: true })
  if (t.metals >= 3) out.push({ text: 'Rich mineral deposits: industry and arms', good: true })
  if (t.straits.length) out.push({ text: `Controls the ${t.straits.join(' & ')}: trade income and leverage`, good: true })
  if (t.coastal >= t.size / 2) out.push({ text: 'Maritime nation: trade bonus, naval invasions', good: true })
  if (t.food < 0.4) out.push({ text: 'Poor farmland: you will have to import food', good: false })
  else if (t.food > 1.2) out.push({ text: 'Breadbasket: food surplus to export', good: true })
  if (t.pop > 60000) out.push({ text: 'Huge population: a vast workforce and army', good: true })
  else if (t.pop < 3000) out.push({ text: 'Sparsely populated: hard to grow', good: false })
  if (t.p.terrain === 'mountains') out.push({ text: 'Mountain fortress: +80% defence', good: true })
  if (t.size < 4) out.push({ text: 'Little free land around: you will start small', good: false })
  if (t.gdppc > 35000) out.push({ text: 'Wealthy, educated population: high-tech industries are within reach', good: true })
  else if (t.gdppc < 6000) out.push({ text: 'Poor region: cheap labour, huge room to grow', good: true })
  if (t.attraction >= 5) out.push({ text: 'Beaches, mountains and heritage: a tourism magnet', good: true })
  const d = countries.value[t.p.iso3]?.data
  if (d && (d.voice ?? 50) < 25) out.push({ text: 'Authoritarian heritage: weak institutions and corruption to overcome', good: false })
  if (d && (d.corruption_control ?? 50) > 75) out.push({ text: 'Clean, capable institutions inherited', good: true })
  return out
})

function found() {
  if (ui.selected == null) return
  send({ t: 'found', province: ui.selected, name: name.value, leader: leader.value, color: color.value, motto: motto.value })
}
const ready = computed(() => name.value.trim().length >= 3 && target.value?.free)
</script>

<template>
  <div class="found glass scroll">
    <div class="hero">
      <div class="eyebrow">A new nation is born</div>
      <h1>Found your state</h1>
      <a class="newhere" href="/guide" target="_blank">📖 New here? Read the guide & watch the demo →</a>
      <p class="muted">Pick any unclaimed land on Earth. Geography is destiny: oil, farmland, straits, mountains and coastline all shape what your nation can become.</p>
    </div>

    <div class="section-title">Identity</div>
    <input v-model="name" class="field" placeholder="Nation name (e.g. Republic of Qadira)" maxlength="40">
    <div class="grid2" style="margin-top:6px">
      <input v-model="leader" class="field" placeholder="Leader name" maxlength="40">
      <input v-model="motto" class="field" placeholder="National motto" maxlength="80">
    </div>
    <div class="colors">
      <button v-for="c in COLORS" :key="c" :class="{ on: c === color }" :style="{ background: c }" @click="color = c" />
    </div>

    <div class="section-title">Homeland</div>
    <div v-if="!target" class="pick muted">🌍 Click a province on the globe to inspect it.</div>
    <div v-else class="target">
      <div class="row between">
        <b>{{ target.p.name }}</b>
        <span :class="target.free ? 'good' : 'bad'">{{ target.free ? 'Unclaimed' : 'Unavailable' }}</span>
      </div>
      <div class="muted" style="margin:2px 0 8px">{{ TERRAIN[target.p.terrain].label }} · starts with {{ target.size }} provinces · {{ fmtPop(target.pop) }} people · {{ fmtUsd(target.gdppc) }}/cap</div>
      <div v-if="countries[target.p.iso3]" class="heritage">
        <div class="hk">Real-world heritage · {{ countries[target.p.iso3].name }}<span v-if="countries[target.p.iso3].estimated"> (estimates)</span></div>
        <div class="hg">
          <span>HDI <b>{{ countries[target.p.iso3].data.undp_hdi?.toFixed(3) ?? '—' }}</b></span>
          <span>Life exp. <b>{{ countries[target.p.iso3].data.life_exp?.toFixed(0) }}</b></span>
          <span>Internet <b>{{ countries[target.p.iso3].data.internet?.toFixed(0) }}%</b></span>
          <span>Voice <b>{{ countries[target.p.iso3].data.voice?.toFixed(0) }}</b></span>
          <span>Graft ctrl <b>{{ countries[target.p.iso3].data.corruption_control?.toFixed(0) }}</b></span>
          <span>Gini <b>{{ countries[target.p.iso3].data.gini?.toFixed(0) }}</b></span>
        </div>
        <div v-if="target.cities.length" class="muted tiny">Cities: {{ target.cities.map(c => c.name).join(', ') }}</div>
      </div>
      <ul class="traits">
        <li v-for="t in traits" :key="t.text" :class="t.good ? 'good' : 'bad'">{{ t.good ? '▲' : '▼' }} <span>{{ t.text }}</span></li>
        <li v-if="!traits.length" class="muted">A balanced, unremarkable land: a blank slate.</li>
      </ul>
    </div>

    <button class="btn primary block go" :disabled="!ready" @click="found">Declare independence</button>
    <p class="muted fine">You inherit this land's real development, institutions and people (World Bank / UNDP / WGI data) and get three years of international protection. After that the world can declare war on you. Other players are out there.</p>
  </div>
</template>

<style scoped>
.found { padding: 18px; max-height: 100%; }
.eyebrow { color: var(--accent); font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; font-weight: 700; }
h1 { margin: 4px 0 6px; font-size: 24px; letter-spacing: -0.01em; }
.hero p { margin: 0; line-height: 1.5; }
.newhere { display: inline-block; margin: 0 0 8px; color: var(--accent); font-size: 12.5px; font-weight: 600; text-decoration: none; }
.colors { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.colors button { width: 22px; height: 22px; border-radius: 6px; border: 2px solid transparent; }
.colors button.on { border-color: #fff; box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3); }
.pick { padding: 14px; border: 1px dashed var(--line-strong); border-radius: 8px; text-align: center; }
.target { padding: 10px 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--line); border-radius: 8px; }
.heritage { background: rgba(255,255,255,.03); border: 1px solid var(--line); border-radius: 7px; padding: 7px 9px; margin-bottom: 8px; }
.hk { font-size: 10.5px; color: var(--accent); text-transform: uppercase; letter-spacing: .08em; font-weight: 700; margin-bottom: 4px; }
.hg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px 8px; font-size: 11.5px; color: var(--muted); }
.hg b { color: var(--text); }
.tiny { font-size: 11px; margin-top: 4px; }
.traits { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 12px; }
.traits span { color: var(--text); }
.go { margin-top: 14px; padding: 11px; font-size: 14px; }
.fine { font-size: 11px; margin-top: 8px; line-height: 1.5; }
</style>
