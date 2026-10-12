<script setup lang="ts">
import { computed } from 'vue'
import { useGame, fmtTroops, fmtMoney } from '~/composables/useGame'
import { useRanks } from '~/composables/useRanks'

const { me, snap, nations, provinces, send, ui, fly, select } = useGame()
const { rankOf } = useRanks()
const wars = computed(() => (me.value?.wars ?? []).map(id => nations.value.get(id)).filter(Boolean))
const offensives = computed(() => snap.value?.battles.filter(b => b.attacker === me.value?.id || b.defender === me.value?.id) ?? [])
const garrisons = computed(() => [...(snap.value?.myProvinces ?? [])].sort((a, b) => b.garrison - a.garrison))
function go(pid: number) { const p = provinces.value[pid]; ui.gov = null; select(pid); fly(p.lat, p.lon, 4.8) }
</script>

<template>
  <div v-if="me">
    <div class="grid4">
      <div class="stat"><div class="k">Active forces</div><div class="v mono">{{ fmtTroops(me.troops) }}</div><div class="s">reserve {{ fmtTroops(me.reserve) }} · cap {{ fmtTroops(me.manpowerCap) }}</div></div>
      <div class="stat"><div class="k">Quality</div><div class="v mono">{{ me.quality.toFixed(2) }}×</div><div class="s">military tech {{ Math.round(me.stocks.milTech) }}</div></div>
      <div class="stat"><div class="k">Navy · Air</div><div class="v mono">{{ Math.round(me.idx.navy ?? 0) }} · {{ Math.round(me.idx.air ?? 0) }}</div><div class="s">relative to the strongest</div></div>
      <div class="stat"><div class="k">Military strength</div><div class="v mono">{{ Math.round(me.idx.military ?? 0) }}</div><div class="s">#{{ rankOf(me.id, 'military').rank }} worldwide · {{ me.budget.defense.toFixed(1) }}% of GDP</div></div>
    </div>
    <p class="hint">The defence budget pays troop upkeep first ({{ fmtMoney(me.troops * 0.005 * Math.pow(Math.min(2.5, Math.max(0.12, (me.idx.gdppc ?? 20000) / 40000)), 0.6)) }}/mo now); the rest recruits toward the force size your budget implies, buys military technology and builds your navy and air force according to doctrine. War doubles the target size. Air superiority multiplies every battle; naval superiority enables blockades and makes amphibious assaults viable.</p>
    <GovPolicies category="defense" />

    <div class="section-title">Wars</div>
    <div v-if="!wars.length" class="muted">At peace.</div>
    <div v-for="w in wars" :key="w!.id" class="war row between">
      <span><i class="swatch" :style="{ background: w!.color }" /> <b>{{ w!.name }}</b> · {{ fmtTroops(w!.troops) }} troops · military {{ Math.round(w!.idx.military ?? 0) }} · navy {{ Math.round(w!.idx.navy ?? 0) }}</span>
      <span class="row"><button class="btn small" :class="me.blockades.includes(w!.id) ? 'primary' : ''" @click="send({ t: 'blockade', nation: w!.id, on: !me.blockades.includes(w!.id) })">⚓ Blockade</button><button class="btn small good" @click="send({ t: 'propose', nation: w!.id, kind: 'peace' })">Propose peace</button></span>
    </div>
    <template v-if="offensives.length">
      <div class="section-title">Offensives in motion</div>
      <div v-for="b in offensives" :key="b.id" class="row between off clk" @click="go(b.to)">
        <span><span :class="b.attacker === me.id ? 'good' : 'bad'">{{ b.attacker === me.id ? '→ Attacking' : '← Incoming' }}</span> {{ provinces[b.to]?.name }} {{ b.sea ? '(amphibious)' : '' }}</span>
        <span class="mono">{{ fmtTroops(b.troops) }} · arrives in {{ Math.max(0, b.arrive - (snap?.tick ?? 0)) }}d</span>
      </div>
    </template>
    <div class="section-title row between"><span>Garrisons</span><button class="btn small" :disabled="me.reserve < 0.5" @click="send({ t: 'autodeploy' })">Deploy reserves to borders</button></div>
    <table class="tbl">
      <thead><tr><th>Province</th><th class="r">Garrison</th><th class="r">Unrest</th><th>Security</th></tr></thead>
      <tbody>
        <tr v-for="g in garrisons" :key="g.id" class="clk" @click="go(g.id)">
          <td>{{ provinces[g.id]?.name }}{{ g.id === me.capital ? ' ★' : '' }}</td>
          <td class="r mono">{{ fmtTroops(g.garrison) }}</td>
          <td class="r mono" :class="g.unrest > 60 ? 'bad' : g.unrest > 30 ? 'warn' : ''">{{ g.unrest }}%</td>
          <td>{{ g.policy.security }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
.hint { font-size: 12px; color: var(--muted); line-height: 1.5; margin: 10px 0 14px; }
.war { padding: 8px 10px; border: 1px solid rgba(255,80,80,.35); background: rgba(255,80,80,.07); border-radius: 8px; margin-bottom: 6px; font-size: 12.5px; }
.off { padding: 5px 4px; font-size: 12.5px; }
.clk { cursor: pointer; }
</style>
