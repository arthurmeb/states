<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BLOCS, type BlocId } from '~~/shared/policies'
import { PARTIES, PARTY_MAP, ELECTORAL, OFFICE_LABEL } from '~~/shared/power'
import { GOV_LABEL, dateOf, DAYS_PER_MONTH } from '~~/shared/rules'
import { useGame } from '~/composables/useGame'

const { me, snap, send, ui } = useGame()
const P = computed(() => me.value!.power)
const electoral = computed(() => ELECTORAL.has(String(me.value?.policy.government)))
const tick = computed(() => snap.value?.tick ?? 0)
const monthsTo = computed(() => (me.value?.nextElection != null ? Math.max(0, Math.round((me.value.nextElection - tick.value) / DAYS_PER_MONTH)) : null))
const regen = computed(() => (me.value?.drivers.pc ?? []).reduce((a, [, v]) => a + v, 0))
const pname = (id: string) => (id === P.value.party ? P.value.partyName : id === 'junta' ? 'Military Council' : PARTY_MAP[id]?.name ?? id)
const pcolor = (id: string) => (id === 'junta' ? '#868e96' : PARTY_MAP[id]?.color ?? '#888')
const picon = (id: string) => (id === 'junta' ? '🪖' : PARTY_MAP[id]?.icon ?? '')
const ORDER = ['labour', 'green', 'regional', 'liberal', 'conservative', 'nationalist', 'junta']
const ranked = computed(() => Object.entries(P.value.votes).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]))
const govSeats = computed(() => (P.value.seats[P.value.govParty] ?? 0) + P.value.coalition.reduce((a, c) => a + (P.value.seats[c] ?? 0), 0))

// parliament: 101 seats in a hemicycle, parties ordered left → right
const seatsDots = computed(() => {
  const N = 101, rows = 6
  const alloc: string[] = []
  const parties = ORDER.filter(p => (P.value.seats[p] ?? 0) > 0)
  let given = 0
  const raw = parties.map(p => ({ p, x: (P.value.seats[p] / 100) * N }))
  for (const r of raw) { const k = Math.floor(r.x); for (let i = 0; i < k; i++) alloc.push(r.p); given += k }
  raw.sort((a, b) => (b.x % 1) - (a.x % 1))
  for (let i = 0; given < N && i < raw.length; i++, given++) alloc.splice(alloc.lastIndexOf(raw[i].p) + 1 || alloc.length, 0, raw[i].p)
  const pts: { x: number; y: number; a: number }[] = []
  const radii = Array.from({ length: rows }, (_, r) => 40 + r * 11)
  const total = radii.reduce((a, r) => a + r, 0)
  for (const r of radii) {
    const k = Math.round((N * r) / total)
    for (let i = 0; i < k; i++) { const a = Math.PI - (i / Math.max(1, k - 1)) * Math.PI; pts.push({ x: 110 + r * Math.cos(a), y: 104 - r * Math.sin(a), a }) }
  }
  pts.sort((p, q) => q.a - p.a)
  return pts.slice(0, alloc.length).map((pt, i) => ({ ...pt, c: pcolor(alloc[i]) }))
})

// party
const partyPick = ref(P.value.party)
const partyLabel = ref(P.value.partyName)
watch(() => P.value.party + P.value.partyName, () => { partyPick.value = P.value.party; partyLabel.value = P.value.partyName })
function saveParty() {
  if (partyPick.value !== P.value.party && !confirm(`Re-founding your party on a new platform costs 20 political capital. Proceed?`)) return
  send({ t: 'party', party: partyPick.value, name: partyLabel.value })
}
const myAff = computed(() => PARTY_MAP[P.value.party]?.blocs ?? {})
const campaignOn = (b: BlocId) => { const party = P.value.office === 'governing' ? P.value.govParty : P.value.party; return P.value.campaign[party]?.[b] ?? 0 }

// autocracy pillars
const pillars = computed(() => {
  const m = me.value!
  const list: { id: string; label: string; icon: string; v: number; note: string }[] = [
    { id: 'military', label: 'Armed forces', icon: '🎖', v: m.blocs.military, note: 'Below 40 they plot. Pay, purges and war shape their mood.' },
    { id: 'business', label: 'Business elites', icon: '💼', v: m.blocs.business, note: 'They fund the regime and keep the economy running.' },
    { id: 'security', label: 'Security services', icon: '🕵', v: Math.min(100, m.budget.security * 18 + (m.mods.coupProof ?? 0) * 100), note: 'Police and intelligence budget plus coup-proofing.' },
  ]
  if (m.policy.government === 'theocracy') list.push({ id: 'religious', label: 'Clergy', icon: '⛪', v: m.blocs.religious, note: 'The source of a theocracy’s legitimacy.' })
  if (m.policy.government === 'oneparty') list.push({ id: 'workers', label: 'Party cadres', icon: '☭', v: (m.blocs.workers + m.blocs.middle) / 2, note: 'Workers and the urban middle class fill the party.' })
  return list
})
const bar = (v: number) => (v < 35 ? 'var(--bad)' : v < 50 ? 'var(--warn)' : 'var(--good)')
const ask = (msg: string, act: () => void) => { if (window.confirm(msg)) act() }
const blocLabel = (id: string) => BLOCS.find(x => x.id === id)?.label.toLowerCase() ?? id
const voters = (id: string) => Object.entries(PARTY_MAP[id]?.blocs ?? {}).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).map(([b]) => blocLabel(b)).join(', ')
</script>

<template>
  <div v-if="me" class="power">
    <div v-if="P.office !== 'governing'" class="banner" :class="P.office">
      <b>{{ P.office === 'exile' ? '🪖 You have been ousted by the military.' : `🚪 You are in opposition.` }}</b>
      <span v-if="P.office === 'opposition'">The {{ pname(P.govParty) }} government runs {{ me.name }} until you win back a majority{{ monthsTo != null ? ` at the election in ${monthsTo} months` : '' }}. Campaign among the factions you need; table a motion of no confidence if the government stumbles.</span>
      <span v-else>The Military Council governs. Juntas fall to protests, economic collapse and time; when it does, elections follow and you can return.</span>
    </div>

    <div class="top">
      <div class="stat pcbox">
        <div class="row between"><span class="k">Political capital</span><button class="why" @click="ui.why = 'pc'">why?</button></div>
        <div class="pcrow"><b class="mono big">{{ Math.round(P.pc) }}</b><span class="muted">/ 100</span><span class="mono" :class="regen >= 0 ? 'good' : 'bad'">{{ regen >= 0 ? '+' : '' }}{{ regen.toFixed(1) }}/mo</span></div>
        <div class="bar"><i :style="{ width: P.pc + '%', background: 'var(--accent)' }" /></div>
        <div class="s">Every reform, budget cut and local decree costs capital. Right now each costs <b>×{{ P.costMult.toFixed(2) }}</b><span v-if="tick < P.honeymoonUntil"> (honeymoon)</span>.</div>
      </div>
      <div class="stat">
        <div class="k">Office</div>
        <div class="v">{{ OFFICE_LABEL[P.office] }}</div>
        <div class="s">{{ GOV_LABEL[me.gov] }} · governing: {{ picon(P.govParty) }} {{ pname(P.govParty) }}<span v-if="P.coalition.length"> + {{ P.coalition.map(pname).join(', ') }}</span> since {{ dateOf(P.since, false) }}</div>
      </div>
      <div class="stat">
        <div class="row between"><span class="k">Approval · legitimacy</span><button class="why" @click="ui.why = 'approval'">why?</button></div>
        <div class="v mono">{{ Math.round(me.idx.approval ?? 0) }}% · {{ Math.round(me.idx.legitimacy ?? 0) }}</div>
        <div class="s"><a @click="ui.why = 'legitimacy'">legitimacy drivers</a> · <a @click="ui.why = 'stability'">stability {{ Math.round(me.idx.stability ?? 0) }}</a></div>
      </div>
    </div>

    <!-- ── democracy ── -->
    <template v-if="electoral">
      <div class="cols">
        <section>
          <div class="section-title">Polls <span class="muted tiny">· if an election were held today</span></div>
          <div v-for="[id, v] in ranked" :key="id" class="prow">
            <span class="pn"><i :style="{ background: pcolor(id) }" />{{ picon(id) }} {{ pname(id) }}<span v-if="id === P.party" class="tag player">you</span><span v-if="id === P.govParty" class="tag">govt</span><span v-else-if="P.coalition.includes(id)" class="tag">coalition</span></span>
            <div class="bar"><i :style="{ width: Math.min(100, v * 2) + '%', background: pcolor(id) }" /></div>
            <span class="mono">{{ v.toFixed(1) }}%</span>
            <span class="mono muted seats">{{ Math.round(P.seats[id] ?? 0) }} seats</span>
          </div>
          <div class="elect">
            <div><span class="k">Next election</span><b>{{ me.nextElection ? `${dateOf(me.nextElection, false)} · ${monthsTo} months` : '—' }}</b></div>
            <div><span class="k">Government seats</span><b :class="govSeats >= 50 ? 'good' : 'bad'">{{ Math.round(govSeats) }}/100</b></div>
            <div><span class="k">System</span><b>{{ me.policy.electoralSystem === 'fptp' ? 'First past the post' : me.policy.electoralSystem === 'mixed' ? 'Mixed-member' : 'Proportional' }}</b></div>
          </div>
          <div class="actions">
            <button v-if="P.office === 'governing'" class="btn" :disabled="P.pc < 15" title="Costs 15 political capital" @click="ask('Call a snap election two months from now? Costs 15 political capital.', () => send({ t: 'snapElection' }))">🗳 Call snap election · 15</button>
            <button v-if="P.office === 'opposition'" class="btn" :disabled="P.pc < 25" title="Costs 25 political capital" @click="send({ t: 'noConfidence' })">⚖ Motion of no confidence · 25</button>
          </div>
        </section>
        <section>
          <div class="section-title">Parliament (projection)</div>
          <svg viewBox="0 0 220 110" class="hemi">
            <circle v-for="(d, i) in seatsDots" :key="i" :cx="d.x" :cy="d.y" r="3.4" :fill="d.c" />
            <text x="110" y="100" text-anchor="middle" class="hc">{{ Math.round(govSeats) }} / 100</text>
          </svg>
          <p class="hint">A majority needs 50 seats. Short of one, the largest party looks for like-minded partners; coalition partners make reforms costlier and may walk out if their voters turn on you.</p>
        </section>
      </div>

      <div class="section-title">Campaign <span class="muted tiny">· 8 political capital each; the effect fades over a few months</span></div>
      <div class="camp">
        <div v-for="b in BLOCS" :key="b.id" class="cb">
          <div class="row between"><b>{{ b.icon }} {{ b.label }}</b><span class="mono muted">{{ Math.round((P.electorate[b.id] ?? 0) * 100) }}% of voters</span></div>
          <div class="row between tiny"><span>approve of the government</span><a class="mono" @click="ui.why = 'bloc:' + b.id">{{ Math.round(me.blocs[b.id]) }}%</a></div>
          <div class="row between tiny"><span>lean to your party</span><span class="mono">{{ Math.round(((myAff as any)[b.id] ?? 0) * 100) }}%</span></div>
          <div class="bar"><i :style="{ width: Math.min(100, campaignOn(b.id) * 80) + '%', background: 'var(--accent)' }" /></div>
          <button class="btn small block" :disabled="P.pc < 8" @click="send({ t: 'campaign', bloc: b.id })">Campaign</button>
        </div>
      </div>

      <div class="cols">
        <section>
          <div class="section-title">Your party</div>
          <div class="seg wrap">
            <button v-for="p in PARTIES" :key="p.id" :class="{ on: partyPick === p.id }" @click="partyPick = p.id">{{ p.icon }} {{ p.name }}</button>
          </div>
          <p class="hint">{{ PARTY_MAP[partyPick]?.pitch }} Voters: {{ voters(partyPick) }}. Factions that identify with your party forgive more; hurting them costs extra capital.</p>
          <div class="row">
            <input v-model="partyLabel" class="field" maxlength="40" placeholder="Party name">
            <button class="btn" @click="saveParty">Save{{ partyPick !== P.party ? ' · 20' : '' }}</button>
          </div>
        </section>
        <section>
          <div class="section-title">Past elections</div>
          <div v-if="!P.history.length" class="muted tiny">No elections yet. Democracies vote every four years.</div>
          <div v-for="h in P.history" :key="h.tick" class="hist">
            <span class="mono muted">{{ dateOf(h.tick, false) }}</span>
            <span><i :style="{ background: pcolor(h.gov) }" class="dot" />{{ pname(h.gov) }} {{ (h.votes[h.gov] ?? 0).toFixed(1) }}%<span v-if="h.coalition.length" class="muted"> + {{ h.coalition.map(pname).join(', ') }}</span></span>
          </div>
        </section>
      </div>
    </template>

    <!-- ── autocracy ── -->
    <template v-else>
      <div class="cols">
        <section>
          <div class="section-title">Pillars of the regime</div>
          <div v-for="p in pillars" :key="p.id" class="pillar">
            <div class="row between"><span>{{ p.icon }} {{ p.label }}</span><b class="mono">{{ Math.round(p.v) }}</b></div>
            <div class="bar"><i :style="{ width: p.v + '%', background: bar(p.v) }" /></div>
            <div class="muted tiny">{{ p.note }}</div>
          </div>
        </section>
        <section>
          <div class="section-title">Threats</div>
          <div class="threat"><span>🪖 Coup</span><b class="mono" :class="P.coupRisk > 1 ? 'bad' : P.coupRisk > 0.3 ? 'warn' : 'good'">{{ (P.coupRisk * 12).toFixed(1) }}% / year</b><button class="why" @click="ui.why = 'coup'">why?</button></div>
          <div class="threat"><span>✊ Revolution</span><b class="mono" :class="P.revoRisk > 1 ? 'bad' : P.revoRisk > 0.3 ? 'warn' : 'good'">{{ (P.revoRisk * 12).toFixed(1) }}% / year</b><button class="why" @click="ui.why = 'stability'">why?</button></div>
          <p class="hint">No elections, but no safety either. A coup sends you into exile until the junta falls; a revolution replaces the regime with a democracy in which you must win votes. Repression (security budget, surveillance) buys time; legitimacy and growth buy more.</p>
          <div class="actions">
            <button class="btn" :disabled="P.office !== 'governing' || P.pc < 15 || P.coupShield > tick" @click="ask('Purge the officer corps? Coup-proof for two years, but the army is weakened and resentful. Costs 15 political capital.', () => send({ t: 'purge' }))">🧹 Purge the officers · 15</button>
            <span v-if="P.coupShield > tick" class="muted tiny">Purged: coup-proof until {{ dateOf(P.coupShield, false) }}</span>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.banner { padding: 10px 12px; border-radius: 8px; margin-bottom: 12px; font-size: 12.5px; line-height: 1.5; display: grid; gap: 3px; }
.banner.opposition { background: rgba(252, 196, 25, .1); border: 1px solid rgba(252, 196, 25, .4); color: #ffe8a1; }
.banner.exile { background: rgba(255, 80, 80, .1); border: 1px solid rgba(255, 80, 80, .4); color: #ffc9c9; }
.top { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 8px; margin-bottom: 14px; }
.pcrow { display: flex; align-items: baseline; gap: 8px; margin: 2px 0 5px; }
.big { font-size: 26px; }
.why { background: none; border: 1px solid var(--line); border-radius: 5px; font-size: 10.5px; color: var(--muted); padding: 1px 6px; }
.why:hover { color: var(--accent); border-color: var(--accent); }
.s a, .tiny a, a.mono { cursor: pointer; color: #a5d8ff; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 14px; }
.prow { display: grid; grid-template-columns: 190px 1fr 52px 64px; gap: 8px; align-items: center; font-size: 12.5px; padding: 3px 0; }
.pn { display: flex; align-items: center; gap: 5px; white-space: nowrap; overflow: hidden; }
.pn i, .dot { width: 9px; height: 9px; border-radius: 2px; display: inline-block; flex: none; margin-right: 4px; }
.seats { font-size: 11px; text-align: right; }
.elect { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 10px 0; font-size: 12px; }
.elect > div { display: flex; flex-direction: column; }
.k { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
.hemi { width: 100%; max-width: 380px; display: block; margin: 0 auto; }
.hc { fill: var(--text); font-size: 11px; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
.hint { font-size: 11.5px; color: var(--muted); line-height: 1.5; }
.camp { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 7px; margin-bottom: 14px; }
.cb { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; display: grid; gap: 3px; font-size: 12.5px; }
.tiny { font-size: 11px; }
.seg.wrap { flex-wrap: wrap; }
.seg.wrap button { flex: 1 0 30%; }
.hist { display: flex; gap: 10px; font-size: 12px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
.pillar { margin-bottom: 9px; font-size: 12.5px; display: grid; gap: 3px; }
.threat { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; font-size: 13px; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.05); }
.field { flex: 1; }
@media (max-width: 900px) {
  .top, .cols { grid-template-columns: 1fr; }
  .prow { grid-template-columns: 1fr 70px 48px; }
  .prow .bar { display: none; }
}
</style>
