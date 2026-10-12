<script setup lang="ts">
import { computed } from 'vue'
import { useGame, fmtMoney } from '~/composables/useGame'
import { useRanks } from '~/composables/useRanks'

const { me, snap, send } = useGame()
const { rankOf } = useRanks()
const PILLARS = [
  { k: 'spCulture', label: 'Culture & media', icon: '🎬', how: 'Grow the media & entertainment industry (film studios project, media subsidies), fund culture, keep a free press, run a global broadcaster.' },
  { k: 'spBusiness', label: 'Business & brands', icon: '🏷', how: 'High-tech and financial exports, strong institutions, global companies (tech parks, fabs, financial districts).' },
  { k: 'spGovernance', label: 'Governance & values', icon: '⚖', how: 'Freedom, rule of law, low corruption, human rights, welcoming refugees.' },
  { k: 'spEducation', label: 'Education & science', icon: '🎓', how: 'Human capital, R&D, research universities, international student programmes.' },
  { k: 'spDiplomacy', label: 'International relations', icon: '🕊', how: 'Diplomacy & aid budget, alliances, trade pacts, leading a trade bloc, aid programmes.' },
  { k: 'spTourism', label: 'Tourism', icon: '🏖', how: 'Attractions, resorts, heritage, airports, open visas, safety.' },
  { k: 'spSports', label: 'Sport', icon: '🏅', how: 'Sports budget, elite programmes, stadiums, hosting and winning the World Games.' },
]
const games = computed(() => snap.value?.games)
const myBid = computed(() => games.value?.bids.find(b => b.nation === me.value?.id))
function bid() {
  const v = prompt('How much will you bid to host the World Games ($B)? The winner pays on award.', String(Math.round((me.value?.gdp ?? 10) * 1.2)))
  if (v) send({ t: 'bid', amount: +v })
}
function setBudget(id: string, delta: number) {
  const b = { ...me.value!.budget }
  b[id] = Math.max(0, +(b[id] + delta).toFixed(2))
  send({ t: 'budget', budget: b })
}
</script>

<template>
  <div v-if="me">
    <div class="hero stat">
      <div>
        <div class="k">Soft power index</div>
        <div class="big mono">{{ Math.round(me.idx.softPower ?? 0) }}<small>/100</small></div>
        <div class="muted">World rank #{{ rankOf(me.id, 'softPower').rank }} of {{ rankOf(me.id, 'softPower').of }} · Global influence #{{ rankOf(me.id, 'influence').rank }}</div>
      </div>
      <p class="muted txt">Soft power is attraction without coercion. It pulls tourists and audiences to your exports, makes other nations' leaders warmer to you (AI attitudes), attracts investment and migrants, and multiplies your influence over the world's trade network.</p>
    </div>
    <div class="pillars">
      <div v-for="p in PILLARS" :key="p.k" class="stat pillar">
        <div class="row between"><b>{{ p.icon }} {{ p.label }}</b><span class="mono">{{ Math.round(me.idx[p.k] ?? 0) }} <span class="muted tiny">#{{ rankOf(me.id, p.k).rank }}</span></span></div>
        <div class="bar"><i :style="{ width: (me.idx[p.k] ?? 0) + '%', background: '#e599f7' }" /></div>
        <div class="muted tiny">{{ p.how }}</div>
      </div>
    </div>
    <div class="cols">
      <section>
        <div class="section-title">Quick levers</div>
        <div v-for="[id, label] in [['culture', '🎭 Culture & media'], ['sports', '🏟 Sport'], ['diplomacy', '🕊 Diplomacy & aid'], ['rnd', '🔬 Research']]" :key="id" class="row between lever">
          <span>{{ label }}</span>
          <span class="row"><button class="btn small" @click="setBudget(id, -0.1)">−</button><b class="mono">{{ me.budget[id].toFixed(1) }}%</b><button class="btn small" @click="setBudget(id, 0.1)">+</button></span>
        </div>
        <GovPolicies category="culture" />
      </section>
      <section>
        <div class="section-title">🏅 The World Games</div>
        <div v-if="games" class="stat">
          <div>Edition {{ games.edition }} · {{ games.host != null ? `hosted by ${snap!.nations.find(n => n.id === games!.host)?.name} in ${games.hostCity}` : games.bidsOpen ? 'bidding is OPEN' : 'bidding not yet open' }}</div>
          <div v-if="games.bidsOpen" style="margin-top:8px">
            <div v-for="b in games.bids" :key="b.nation" class="row between tiny"><span>{{ snap!.nations.find(n => n.id === b.nation)?.name }}</span><span class="mono">{{ fmtMoney(b.amount) }}</span></div>
            <button class="btn primary" style="margin-top:8px" @click="bid">{{ myBid ? `Raise bid (now ${fmtMoney(myBid.amount)})` : 'Place a bid' }}</button>
          </div>
          <template v-if="games.lastMedals.length">
            <div class="section-title">Last medal table</div>
            <div v-for="(m, i) in games.lastMedals" :key="m.nation" class="row between tiny"><span>{{ i + 1 }}. {{ snap!.nations.find(n => n.id === m.nation)?.name ?? '—' }}</span><span class="mono">🥇 {{ m.gold }} · {{ m.total }}</span></div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.hero { display: grid; grid-template-columns: 260px 1fr; gap: 20px; align-items: center; padding: 14px 16px; }
.big { font-size: 40px; font-weight: 800; }
.big small { font-size: 14px; color: var(--muted); }
.txt { font-size: 12.5px; line-height: 1.55; margin: 0; }
.pillars { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 8px; margin-top: 10px; }
.pillar .bar { margin: 5px 0; }
.tiny { font-size: 10.5px; }
.cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 22px; margin-top: 8px; }
.lever { padding: 4px 0; font-size: 12.5px; }
.lever .row { gap: 6px; }
@media (max-width: 1100px) { .cols, .hero { grid-template-columns: 1fr; } }
</style>
