<script setup lang="ts">
import { computed, ref } from 'vue'
import { TERRAIN, claimCost } from '~~/shared/rules'
import { SECTORS } from '~~/shared/sectors'
import { useGame, fmtPop, fmtTroops, fmtMoney, fmtUsd } from '~/composables/useGame'

const { ui, snap, provinces, countries, nations, me, send, relation, openProvince } = useGame()
const id = ui.selected!
const P = computed(() => provinces.value[id])
const d = computed(() => ui.details[id])
const owner = computed(() => { const o = snap.value?.prov.owner[id] ?? -1; return o >= 0 ? nations.value.get(o) ?? null : null })
const mine = computed(() => !!me.value && owner.value?.id === me.value.id)
const border = computed(() => {
  const s = snap.value, m = me.value
  if (!s || !m || !P.value) return { land: [] as number[], sea: [] as number[] }
  return { land: P.value.nb.filter(q => s.prov.owner[q] === m.id), sea: P.value.sea.filter(q => s.prov.owner[q] === m.id) }
})
const borders = computed(() => border.value.land.length + border.value.sea.length > 0)
const atWar = computed(() => !!owner.value && relation(owner.value.id) === 'war')
const available = computed(() => {
  const s = snap.value, m = me.value
  if (!s || !m) return 0
  return m.reserve + [...border.value.land, ...border.value.sea].reduce((t, q) => t + s.prov.garrison[q], 0)
})
const amount = ref(0)
const defense = computed(() => {
  const s = snap.value, o = owner.value
  if (!s || !o || !P.value) return 0
  return (s.prov.garrison[id] + s.prov.pop[id] * 0.0006) * TERRAIN[P.value.terrain].defense * (id === o.capital ? 1.25 : 1)
})
const needed = computed(() => me.value ? (defense.value / me.value.quality) * (border.value.land.length ? 1 : 1.8) : 0)
function attack() { send({ t: 'attack', target: id, amount: amount.value || Math.min(available.value, Math.ceil(needed.value * 1.4)) }) }
function declare() { if (owner.value && confirm(`Declare war on ${owner.value.name}? Their allies will join against you.`)) send({ t: 'declare', nation: owner.value.id }) }
const top = computed(() => {
  const det = d.value
  if (!det) return []
  const tot = det.output.reduce((a, b) => a + b, 0) || 1
  return SECTORS.map((s, i) => ({ s, v: det.output[i] / tot })).sort((a, b) => b.v - a.v).slice(0, 4)
})
</script>

<template>
  <div v-if="P && snap" class="prov glass scroll">
    <div class="row between">
      <div>
        <div class="eyebrow">{{ TERRAIN[P.terrain].label }} · {{ countries[P.iso3]?.name ?? P.iso3 }} heritage</div>
        <h2>{{ P.name }}</h2>
      </div>
      <button class="x" @click="ui.selected = null">✕</button>
    </div>
    <div class="owner" @click="owner && (ui.inspectNation = owner.id)">
      <template v-if="owner"><i class="swatch" :style="{ background: owner.color }" /><b>{{ owner.name }}</b>
        <span v-if="id === owner.capital" class="tag">★ capital</span>
        <span v-if="relation(owner.id) !== 'neutral' && relation(owner.id) !== 'self'" class="tag" :class="relation(owner.id)">{{ relation(owner.id) }}</span>
      </template>
      <span v-else class="muted">Unclaimed land</span>
    </div>
    <button class="btn primary block enter" @click="openProvince(id)">🏙 Enter province view</button>
    <div class="grid3">
      <div class="stat"><div class="k">People</div><div class="v mono">{{ fmtPop(snap.prov.pop[id]) }}</div></div>
      <div class="stat"><div class="k">GDP/cap</div><div class="v mono sm">{{ fmtUsd(snap.prov.gdppc[id]) }}</div></div>
      <div class="stat"><div class="k">Unrest</div><div class="v mono" :class="snap.prov.unrest[id] > 60 ? 'bad' : snap.prov.unrest[id] > 30 ? 'warn' : ''">{{ snap.prov.unrest[id] }}%</div></div>
    </div>
    <div v-if="d" class="econ">
      <div v-for="t in top" :key="t.s.id" class="row between tiny"><span>{{ t.s.icon }} {{ t.s.label }}</span><span class="mono">{{ (t.v * 100).toFixed(0) }}%</span></div>
      <div class="row between tiny muted"><span>Jobless {{ d.unemployment.toFixed(1) }}% · happiness {{ d.happiness.toFixed(1) }}</span><span>dev {{ snap.prov.dev[id] }}</span></div>
    </div>

    <div v-if="me" class="actions">
      <template v-if="!owner">
        <template v-if="P.terrain === 'ice'"><p class="muted tiny">The ice sheet cannot be settled.</p></template>
        <template v-else-if="borders">
          <button class="btn block" :disabled="me.treasury < claimCost(me.provinces, snap.prov.pop[id])" @click="send({ t: 'claim', province: id })">Annex for {{ fmtMoney(claimCost(me.provinces, snap.prov.pop[id])) }}</button>
        </template>
        <p v-else class="muted tiny">Not adjacent to your territory.</p>
      </template>
      <template v-else-if="mine">
        <div class="row between tiny"><span>Garrison {{ fmtTroops(snap.prov.garrison[id]) }}</span><span class="muted">reserve {{ fmtTroops(me.reserve) }}</span></div>
        <div class="grid2" style="margin-top:6px">
          <button class="btn small" :disabled="me.reserve < 0.5" @click="send({ t: 'deploy', province: id, amount: 5 })">+5k troops</button>
          <button class="btn small" :disabled="snap.prov.garrison[id] < 0.5" @click="send({ t: 'deploy', province: id, amount: -5 })">−5k troops</button>
        </div>
      </template>
      <template v-else>
        <template v-if="atWar">
          <div class="section-title">Offensive</div>
          <template v-if="borders">
            <div class="row between tiny"><span class="muted">Est. defence</span><span class="mono">{{ fmtTroops(defense) }}</span></div>
            <div class="row between tiny"><span class="muted">Troops needed ≈</span><span class="mono">{{ fmtTroops(needed) }}</span></div>
            <div class="row between tiny"><span class="muted">Available</span><span class="mono">{{ fmtTroops(available) }}</span></div>
            <div class="row" style="margin-top:6px"><input v-model.number="amount" type="range" min="0" :max="Math.floor(available)"><span class="mono">{{ amount || 'auto' }}</span></div>
            <button class="btn danger block" :disabled="available < 0.5" @click="attack">⚔ Launch offensive{{ border.land.length ? '' : ' (amphibious)' }}</button>
          </template>
          <p v-else class="muted tiny">None of your provinces border this one.</p>
        </template>
        <button v-else-if="borders" class="btn danger block" @click="declare">Declare war on {{ owner.name }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.prov { padding: 14px; max-height: 64%; flex: none; }
.eyebrow { font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
h2 { margin: 2px 0 6px; font-size: 19px; }
.x { background: none; border: 0; color: var(--muted); font-size: 14px; align-self: flex-start; }
.owner { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; cursor: pointer; flex-wrap: wrap; }
.enter { margin-bottom: 8px; }
.v.sm { font-size: 13px; }
.econ { margin-top: 8px; display: grid; gap: 2px; }
.tiny { font-size: 11.5px; }
.actions { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 8px; }
</style>
