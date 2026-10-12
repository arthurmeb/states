<script setup lang="ts">
import { computed, ref } from 'vue'
import { GOV_LABEL } from '~~/shared/rules'
import { useGame, fmtMoney } from '~/composables/useGame'

const { me, snap, send, nations, relation, ui } = useGame()
const filter = ref<'all' | 'partners' | 'players' | 'neighbours'>('partners')
const KIND: Record<string, string> = { peace: 'Peace treaty', alliance: 'Military alliance', pact: 'Trade pact', bloc: 'Trade bloc membership' }
const incoming = computed(() => snap.value?.proposals.filter(p => p.to === me.value?.id) ?? [])
const myBloc = computed(() => snap.value?.tradeBlocs.find(b => b.id === me.value?.bloc) ?? null)
const rows = computed(() => {
  const m = me.value!
  let list = m.partners.map(p => ({ p, n: nations.value.get(p.id)! })).filter(x => x.n)
  if (filter.value === 'players') list = list.filter(x => !x.n.ai)
  if (filter.value === 'partners') list = list.slice(0, 20)
  return list
})
function tariff(id: number) {
  const cur = me.value!.tariffs[id]
  const v = prompt('Bilateral tariff (%) on this nation\'s goods. Leave empty to use your general tariff.', cur != null ? String(cur) : '')
  if (v === null) return
  send({ t: 'tariff', nation: id, rate: v.trim() === '' ? null : +v })
}
const toggle = (t: 'embargo' | 'sanction' | 'aid' | 'blockade', id: number, on: boolean) => send({ t, nation: id, on })
function declare(id: number) { if (confirm(`Declare war on ${nations.value.get(id)?.name}? Their allies will join, and democracies may sanction you.`)) send({ t: 'declare', nation: id }) }
function createBloc() {
  const name = prompt('Name your trade bloc (e.g. "Pacific Economic Community")')
  if (!name) return
  const cet = prompt('Common external tariff (%) members charge non-members', '8')
  send({ t: 'createBloc', name, cet: +(cet ?? 8) })
}
const attitudeTone = (a: number) => (a > 30 ? 'good' : a < -30 ? 'bad' : a < 0 ? 'warn' : '')
</script>

<template>
  <div v-if="me">
    <template v-if="incoming.length">
      <div class="section-title">Proposals awaiting your answer</div>
      <div v-for="p in incoming" :key="p.id" class="prop">
        <span><b :style="{ color: nations.get(p.from)?.color }">{{ nations.get(p.from)?.name }}</b> proposes: <b>{{ KIND[p.kind] }}</b><span v-if="p.bloc"> ({{ snap!.tradeBlocs.find(b => b.id === p.bloc)?.name }})</span></span>
        <span class="row"><button class="btn good small" @click="send({ t: 'respond', proposal: p.id, accept: true })">Accept</button><button class="btn small" @click="send({ t: 'respond', proposal: p.id, accept: false })">Decline</button></span>
      </div>
    </template>

    <div class="grid3 top">
      <div class="stat">
        <div class="k">Trade bloc</div>
        <template v-if="myBloc">
          <div class="v" :style="{ color: myBloc.color }">{{ myBloc.name }}</div>
          <div class="s">{{ myBloc.members.length }} members · common external tariff {{ myBloc.cet }}%<span v-if="myBloc.founder === me.id"> · you lead it</span></div>
          <div class="chips" style="margin-top:6px"><span v-for="m in myBloc.members" :key="m" class="chip"><i class="swatch" :style="{ background: nations.get(m)?.color }" /> {{ nations.get(m)?.name }}</span></div>
          <button class="btn small danger" style="margin-top:8px" @click="send({ t: 'leaveBloc' })">Leave bloc</button>
        </template>
        <template v-else>
          <div class="s">Members trade tariff-free (+80% trade intensity) behind a common external tariff. The largest economy leads it and gains influence.</div>
          <button class="btn primary small" style="margin-top:8px" @click="createBloc">Found a trade bloc</button>
          <div class="chips" style="margin-top:8px"><span v-for="b in snap!.tradeBlocs" :key="b.id" class="chip" :style="{ borderColor: b.color }">{{ b.name }} · {{ b.members.length }}</span></div>
        </template>
      </div>
      <div class="stat">
        <div class="k">Global influence</div>
        <div class="v mono">{{ Math.round(me.idx.influence ?? 0) }}</div>
        <div class="s">How much the world depends on you: trade dependence, aid, alliances, bloc leadership and soft power. Shown per nation below.</div>
      </div>
      <div class="stat">
        <div class="k">Coercive tools</div>
        <div class="s">⛔ embargo: no trade at all · 💳 sanctions: halve trade, crush their investment & credit (scales with your share of world GDP) · ⚓ blockade: at war with a navy 20% stronger, their sea trade collapses · 🎁 aid: 60% of your diplomacy budget buys goodwill and dependence.</div>
      </div>
    </div>

    <div class="seg" style="margin:12px 0 8px;max-width:420px">
      <button :class="{ on: filter === 'partners' }" @click="filter = 'partners'">Top partners</button>
      <button :class="{ on: filter === 'all' }" @click="filter = 'all'">All nations</button>
      <button :class="{ on: filter === 'players' }" @click="filter = 'players'">Players</button>
    </div>
    <table class="tbl">
      <thead><tr><th>Nation</th><th class="r">Trade/yr</th><th class="r">Tariffs you / them</th><th class="r">Your influence</th><th class="r">Their influence</th><th class="r">Attitude</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        <tr v-for="{ p, n } in rows" :key="p.id">
          <td class="clk" @click="ui.inspectNation = n.id; ui.gov = null"><i class="swatch" :style="{ background: n.color }" /> <b>{{ n.name }}</b><div class="muted tiny">{{ n.ai ? 'AI' : n.online ? '● player online' : 'player' }} · {{ GOV_LABEL[n.gov] }}</div></td>
          <td class="r mono">{{ fmtMoney((p.exports + p.imports) * 12) }}</td>
          <td class="r mono clk" @click="tariff(n.id)">{{ p.tariffOut >= 0 ? p.tariffOut + '%' : '—' }} / {{ p.tariffIn >= 0 ? p.tariffIn + '%' : '—' }} ✎</td>
          <td class="r mono">{{ Math.round(p.influenceOver) }}</td>
          <td class="r mono">{{ Math.round(p.influenceBy) }}</td>
          <td class="r mono" :class="attitudeTone(p.attitude)">{{ n.ai ? p.attitude : '—' }}</td>
          <td><span class="tag" :class="relation(n.id)">{{ relation(n.id) }}</span></td>
          <td class="acts">
            <template v-if="relation(n.id) === 'war'">
              <button class="btn small good" @click="send({ t: 'propose', nation: n.id, kind: 'peace' })">Peace</button>
              <button class="btn small" :class="me.blockades.includes(n.id) ? 'primary' : ''" @click="toggle('blockade', n.id, !me.blockades.includes(n.id))">⚓</button>
            </template>
            <template v-else>
              <button v-if="!me.pacts.includes(n.id)" class="btn small" title="Propose trade pact" @click="send({ t: 'propose', nation: n.id, kind: 'pact' })">📜</button>
              <button v-if="!me.allies.includes(n.id)" class="btn small" title="Propose alliance" @click="send({ t: 'propose', nation: n.id, kind: 'alliance' })">🤝</button>
              <button v-else class="btn small" title="Break alliance" @click="send({ t: 'cancel', nation: n.id, kind: 'alliance' })">💔</button>
              <button v-if="myBloc && n.bloc == null" class="btn small" title="Invite to your trade bloc" @click="send({ t: 'inviteBloc', nation: n.id })">🌐</button>
              <button class="btn small" :class="me.aidTargets.includes(n.id) ? 'primary' : ''" title="Development aid" @click="toggle('aid', n.id, !me.aidTargets.includes(n.id))">🎁</button>
              <button class="btn small" :class="me.sanctions.includes(n.id) ? 'danger' : ''" title="Financial sanctions" @click="toggle('sanction', n.id, !me.sanctions.includes(n.id))">💳</button>
              <button class="btn small" :class="me.embargoes.includes(n.id) ? 'danger' : ''" title="Trade embargo" @click="toggle('embargo', n.id, !me.embargoes.includes(n.id))">⛔</button>
              <button v-if="!me.allies.includes(n.id)" class="btn small danger" title="Declare war" @click="declare(n.id)">⚔</button>
            </template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.prop { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border: 1px solid rgba(255,212,59,.35); background: rgba(255,212,59,.06); border-radius: 8px; margin-bottom: 6px; font-size: 12.5px; }
.top .v { font-size: 16px; }
.s { font-size: 11.5px; color: var(--muted); line-height: 1.45; margin-top: 3px; }
.tiny { font-size: 10.5px; }
.clk { cursor: pointer; }
.acts { white-space: nowrap; }
.acts .btn { padding: 2px 6px; margin-right: 2px; }
</style>
