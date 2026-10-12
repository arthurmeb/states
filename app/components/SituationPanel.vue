<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { INDEX_MAP, formatIndex } from '~~/shared/indices'
import { GOV_LABEL, STRATEGIES, dateOf } from '~~/shared/rules'
import { useGame, deviceLink, toast, fmtMoney, fmtTroops, type GovSection } from '~/composables/useGame'
import { useRanks } from '~/composables/useRanks'

const { me, ui, provinces, fly, snap, send, nations } = useGame()
const { rankOf } = useRanks()
onMounted(() => { const p = me.value && provinces.value[me.value.capital]; if (p) fly(p.lat, p.lon, 3.6) })
const KEYS = ['gdppc', 'growth', 'inflation', 'unemployment', 'approval', 'stability', 'hdi', 'softPower', 'military']
const incoming = computed(() => snap.value?.proposals.filter(p => p.to === me.value?.id) ?? [])
const QUICK: { id: GovSection; label: string; icon: string }[] = [
  { id: 'budget', label: 'Budget', icon: '💰' }, { id: 'economy', label: 'Industry', icon: '🏭' }, { id: 'welfare', label: 'Welfare', icon: '🏥' },
  { id: 'society', label: 'Society', icon: '⚖' }, { id: 'foreign', label: 'Foreign', icon: '🌐' }, { id: 'defense', label: 'Defence', icon: '🎖' },
  { id: 'territories', label: 'Provinces', icon: '🗺' }, { id: 'culture', label: 'Soft power', icon: '🎭' }, { id: 'trajectory', label: 'Trajectory', icon: '📈' },
]
async function shareDevice() {
  const link = deviceLink()
  try { await navigator.clipboard.writeText(link); toast('📱 Link copied. Open it on your other device to keep playing this nation. Keep it secret: it is your key.') }
  catch { prompt('Open this link on your other device (keep it secret, it is your key):', link) }
}
function dissolve() { if (me.value && confirm(`Dissolve ${me.value.name}? All your land becomes unclaimed.`)) send({ t: 'abandon' }) }
const KIND: Record<string, string> = { peace: 'peace', alliance: 'an alliance', pact: 'a trade pact', bloc: 'trade bloc membership' }
</script>

<template>
  <div v-if="me" class="panel glass">
    <div class="head">
      <div class="flag" :style="{ background: me.color }" />
      <div>
        <div class="name">{{ me.name }}</div>
        <div class="sub muted">{{ GOV_LABEL[me.gov] }} · {{ me.leader }}</div>
        <div v-if="me.motto" class="motto">“{{ me.motto }}”</div>
      </div>
    </div>
    <div v-if="me.protectedUntil > (snap?.tick ?? 0)" class="protect">🛡 Protected until {{ dateOf(me.protectedUntil, false) }}</div>
    <div class="body scroll">
      <button class="btn primary block govbtn" @click="ui.gov = 'overview'">🏛 Open the Government</button>
      <div class="kgrid">
        <div v-for="k in KEYS" :key="k" class="kc" @click="ui.gov = 'indices'">
          <span class="k">{{ INDEX_MAP[k].label }}</span>
          <b class="mono">{{ formatIndex(INDEX_MAP[k].fmt, me.idx[k]) }}</b>
          <span class="rk">#{{ rankOf(me.id, k).rank }}</span>
        </div>
      </div>
      <div class="row between line"><span class="muted">Treasury</span><b class="mono" :class="me.treasury < 0 ? 'bad' : ''">{{ fmtMoney(me.treasury) }} <small :class="me.ledger.net < 0 ? 'bad' : 'good'">{{ me.ledger.net >= 0 ? '+' : '' }}{{ fmtMoney(me.ledger.net) }}/mo</small></b></div>
      <div class="row between line"><span class="muted">Forces</span><b class="mono">{{ fmtTroops(me.troops) }} · reserve {{ fmtTroops(me.reserve) }}</b></div>
      <div class="row between line"><span class="muted">Strategy</span><b>{{ STRATEGIES[me.strategy]?.label }}</b></div>

      <template v-if="incoming.length">
        <div class="section-title">Diplomatic cables</div>
        <div v-for="p in incoming" :key="p.id" class="prop">
          <div><b :style="{ color: nations.get(p.from)?.color }">{{ nations.get(p.from)?.name }}</b> offers {{ KIND[p.kind] }}</div>
          <div class="row" style="margin-top:5px"><button class="btn good small" @click="send({ t: 'respond', proposal: p.id, accept: true })">Accept</button><button class="btn small" @click="send({ t: 'respond', proposal: p.id, accept: false })">Decline</button></div>
        </div>
      </template>
      <div v-if="me.wars.length" class="warbox" @click="ui.gov = 'defense'">⚔ At war with {{ me.wars.map(w => nations.get(w)?.name).join(', ') }}</div>

      <div class="section-title">Ministries</div>
      <div class="quick">
        <button v-for="q in QUICK" :key="q.id" class="qb" @click="ui.gov = q.id"><span>{{ q.icon }}</span>{{ q.label }}</button>
      </div>
      <button class="btn small block" style="margin-top:14px" @click="shareDevice">📱 Play on another device</button>
      <button class="btn danger small" style="margin-top:8px" @click="dissolve">Dissolve nation</button>
    </div>
  </div>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; max-height: 100%; min-height: 0; }
.head { display: flex; gap: 12px; padding: 14px 14px 8px; }
.flag { width: 44px; height: 30px; border-radius: 4px; flex: none; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4); }
.name { font-size: 17px; font-weight: 800; line-height: 1.15; }
.sub { font-size: 11.5px; margin-top: 2px; }
.motto { font-size: 11.5px; font-style: italic; color: #c5cbd6; margin-top: 3px; }
.protect { margin: 0 14px 6px; font-size: 11px; color: #a5d8ff; background: rgba(77, 171, 247, 0.1); border: 1px solid rgba(77, 171, 247, 0.25); border-radius: 6px; padding: 5px 8px; }
.body { padding: 4px 14px 14px; min-height: 0; flex: 1; }
.govbtn { padding: 10px; font-size: 13.5px; margin-bottom: 10px; }
.kgrid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; margin-bottom: 8px; }
.kc { background: rgba(255,255,255,.035); border: 1px solid var(--line); border-radius: 7px; padding: 5px 7px; display: flex; flex-direction: column; cursor: pointer; position: relative; }
.kc:hover { border-color: var(--line-strong); }
.kc .k { font-size: 9.5px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kc b { font-size: 13px; }
.rk { position: absolute; top: 4px; right: 6px; font-size: 9.5px; color: var(--muted); }
.line { font-size: 12px; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
.line small { font-size: 10.5px; }
.prop { padding: 8px 10px; border: 1px solid rgba(255,212,59,.35); background: rgba(255,212,59,.06); border-radius: 8px; margin-bottom: 6px; font-size: 12px; }
.warbox { margin-top: 10px; padding: 8px 10px; border: 1px solid rgba(255,80,80,.4); background: rgba(255,80,80,.1); color: #ffc9c9; border-radius: 8px; font-size: 12px; cursor: pointer; }
.quick { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
.qb { background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 7px; padding: 8px 4px; font-size: 11.5px; display: flex; flex-direction: column; align-items: center; gap: 2px; color: #cbd2dc; }
.qb span { font-size: 16px; }
.qb:hover { border-color: var(--accent); }
</style>
