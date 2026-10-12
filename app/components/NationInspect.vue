<script setup lang="ts">
import { computed } from 'vue'
import { GOV_LABEL, STRATEGIES, dateOf } from '~~/shared/rules'
import { INDEX_MAP, formatIndex } from '~~/shared/indices'
import { useGame, fmtPop, fmtTroops, fmtMoney } from '~/composables/useGame'
import { useRanks } from '~/composables/useRanks'

const { ui, nations, me, send, relation, provinces, fly, snap } = useGame()
const { rankOf } = useRanks()
const n = computed(() => nations.value.get(ui.inspectNation!))
const rel = computed(() => (n.value ? relation(n.value.id) : 'neutral'))
const partner = computed(() => me.value?.partners.find(p => p.id === n.value?.id))
const protectedFor = computed(() => (n.value?.protectedUntil ?? 0) > (snap.value?.tick ?? 0))
const names = (ids: number[]) => ids.map(i => nations.value.get(i)?.name).filter(Boolean).join(', ')
const KEYS = ['gdp', 'gdppc', 'hdi', 'happiness', 'democracy', 'softPower', 'military', 'influence', 'cnp']
function locate() { const p = n.value && provinces.value[n.value.capital]; if (p) fly(p.lat, p.lon, 3.5) }
function declare() { if (n.value && confirm(`Declare war on ${n.value.name}? Their allies (${names(n.value.allies) || 'none'}) will join against you.`)) send({ t: 'declare', nation: n.value.id }) }
</script>

<template>
  <div v-if="n" class="insp glass scroll">
    <div class="row between">
      <div class="row"><div class="flag" :style="{ background: n.color }" /><div>
        <h2>{{ n.name }}</h2>
        <div class="muted small">{{ GOV_LABEL[n.gov] }} · {{ n.leader }}</div>
      </div></div>
      <button class="x" @click="ui.inspectNation = null">✕</button>
    </div>
    <div v-if="n.motto" class="motto">“{{ n.motto }}”</div>
    <div class="row" style="gap:4px;margin:6px 0 8px;flex-wrap:wrap">
      <span class="tag" :class="n.ai ? 'ai' : 'player'">{{ n.ai ? 'AI nation' : n.online ? '● Player · online' : 'Player · offline' }}</span>
      <span class="tag">{{ STRATEGIES[n.strategy]?.label }}</span>
      <span v-if="rel !== 'neutral' && rel !== 'self'" class="tag" :class="rel">{{ rel }}</span>
      <span v-if="protectedFor" class="tag">🛡 until {{ dateOf(n.protectedUntil, false) }}</span>
    </div>
    <div class="ig">
      <div v-for="k in KEYS" :key="k"><span>{{ INDEX_MAP[k].label }}</span><b class="mono">{{ formatIndex(INDEX_MAP[k].fmt, n.idx[k]) }}</b><i class="muted">#{{ rankOf(n.id, k).rank }}</i></div>
    </div>
    <div class="small" style="margin-top:8px">
      <div><span class="muted">People:</span> {{ fmtPop(n.pop) }} · <span class="muted">Troops:</span> {{ fmtTroops(n.troops) }}</div>
      <div v-if="n.allies.length"><span class="muted">Allies:</span> {{ names(n.allies) }}</div>
      <div v-if="n.wars.length"><span class="muted">At war with:</span> <span class="bad">{{ names(n.wars) }}</span></div>
      <div v-if="n.bloc != null"><span class="muted">Trade bloc:</span> {{ snap?.tradeBlocs.find(b => b.id === n!.bloc)?.name }}</div>
      <div v-if="n.sanctions.length || n.embargoes.length"><span class="muted">Sanctioning:</span> {{ names([...n.sanctions, ...n.embargoes]) }}</div>
      <div v-if="partner"><span class="muted">Trade with you:</span> {{ fmtMoney((partner.exports + partner.imports) * 12) }}/yr · <span class="muted">your influence</span> {{ Math.round(partner.influenceOver) }} · <span class="muted">theirs</span> {{ Math.round(partner.influenceBy) }}<span v-if="n.ai"> · <span class="muted">attitude</span> <b :class="partner.attitude > 20 ? 'good' : partner.attitude < -20 ? 'bad' : ''">{{ partner.attitude }}</b></span></div>
    </div>
    <div class="actions">
      <div class="grid2"><button class="btn" @click="locate">Locate on globe</button><button v-if="me" class="btn" @click="ui.trajSubject = n.id; ui.gov = 'trajectory'">📈 Trajectory</button></div>
      <template v-if="me && rel !== 'self'">
        <div class="grid2" style="margin-top:6px">
          <template v-if="rel === 'war'"><button class="btn good" @click="send({ t: 'propose', nation: n.id, kind: 'peace' })">Propose peace</button></template>
          <template v-else>
            <button v-if="!me.pacts.includes(n.id)" class="btn" @click="send({ t: 'propose', nation: n.id, kind: 'pact' })">Offer trade pact</button>
            <button v-else class="btn" @click="send({ t: 'cancel', nation: n.id, kind: 'pact' })">Cancel pact</button>
            <button v-if="!me.allies.includes(n.id)" class="btn" @click="send({ t: 'propose', nation: n.id, kind: 'alliance' })">Propose alliance</button>
            <button v-else class="btn" @click="send({ t: 'cancel', nation: n.id, kind: 'alliance' })">Break alliance</button>
          </template>
        </div>
        <button class="btn block" style="margin-top:6px" @click="ui.gov = 'foreign'">Trade, sanctions & aid…</button>
        <button v-if="rel !== 'war' && rel !== 'ally'" class="btn danger block" style="margin-top:6px" :disabled="protectedFor" @click="declare">Declare war</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.insp { padding: 14px; max-height: 64%; flex: none; }
.flag { width: 36px; height: 25px; border-radius: 3px; margin-right: 10px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4); }
h2 { margin: 0; font-size: 17px; }
.small { font-size: 11.5px; line-height: 1.65; }
.motto { font-style: italic; color: #c5cbd6; font-size: 12px; margin-top: 6px; }
.x { background: none; border: 0; color: var(--muted); font-size: 14px; align-self: flex-start; }
.ig { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.ig > div { background: rgba(255,255,255,.035); border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; display: flex; flex-direction: column; position: relative; }
.ig span { font-size: 9px; color: var(--muted); text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ig b { font-size: 12.5px; }
.ig i { position: absolute; right: 5px; top: 3px; font-size: 9px; font-style: normal; }
.actions { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 10px; }
</style>
