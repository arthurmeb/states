<script setup lang="ts">
import { computed } from 'vue'
import { GOV_LABEL, STRATEGIES, dateOf } from '~~/shared/rules'
import { useGame, fmtMoney, fmtPop, type GovSection } from '~/composables/useGame'

const { ui, me, snap } = useGame()
const NAV: { id: GovSection; label: string; icon: string; group?: string }[] = [
  { id: 'overview', label: 'Overview', icon: '🏛', group: 'State' },
  { id: 'indices', label: 'All indices', icon: '📊' },
  { id: 'territories', label: 'Territories', icon: '🗺' },
  { id: 'economy', label: 'Industry & markets', icon: '🏭', group: 'Economy' },
  { id: 'budget', label: 'Taxes & budget', icon: '💰' },
  { id: 'welfare', label: 'Welfare & services', icon: '🏥', group: 'Policy' },
  { id: 'society', label: 'Society & rights', icon: '⚖' },
  { id: 'governance', label: 'Governance', icon: '🗳' },
  { id: 'environment', label: 'Environment', icon: '🌱' },
  { id: 'culture', label: 'Culture & soft power', icon: '🎭' },
  { id: 'foreign', label: 'Trade & foreign policy', icon: '🌐', group: 'World' },
  { id: 'defense', label: 'Defence', icon: '🎖' },
  { id: 'world', label: 'World & rankings', icon: '🌍' },
]
const section = computed(() => ui.gov ?? 'overview')
const close = () => { ui.gov = null }
</script>

<template>
  <div class="gov-veil">
    <div v-if="me" class="gov glass">
      <aside class="nav">
        <div class="who">
          <div class="flag" :style="{ background: me.color }" />
          <div>
            <div class="nm">{{ me.name }}</div>
            <div class="muted tiny">{{ GOV_LABEL[me.gov] }} · {{ me.leader }}</div>
          </div>
        </div>
        <div class="kpis">
          <div><span>GDP</span><b>{{ fmtMoney(me.idx.gdp ?? 0) }}</b></div>
          <div><span>People</span><b>{{ fmtPop(me.pop) }}</b></div>
          <div><span>Treasury</span><b :class="me.treasury < 0 ? 'bad' : ''">{{ fmtMoney(me.treasury) }}</b></div>
          <div><span>Approval</span><b>{{ Math.round(me.idx.approval ?? 0) }}%</b></div>
        </div>
        <template v-for="n in NAV" :key="n.id">
          <div v-if="n.group" class="grp">{{ n.group }}</div>
          <button class="item" :class="{ on: section === n.id }" @click="ui.gov = n.id"><span>{{ n.icon }}</span>{{ n.label }}</button>
        </template>
        <div class="foot muted tiny">
          {{ dateOf(snap?.tick ?? 0) }}<br>
          <span v-if="me.nextElection">Next election: {{ dateOf(me.nextElection, false) }}</span>
          <span v-else>No elections</span>
        </div>
      </aside>
      <main class="content scroll">
        <header class="row between head">
          <h2>{{ NAV.find(n => n.id === section)?.icon }} {{ NAV.find(n => n.id === section)?.label }}</h2>
          <div class="row">
            <span class="tag">{{ STRATEGIES[me.strategy]?.label ?? 'Player-led' }}</span>
            <button class="x" @click="close">✕</button>
          </div>
        </header>
        <GovOverview v-if="section === 'overview'" />
        <GovIndices v-else-if="section === 'indices'" />
        <GovTerritories v-else-if="section === 'territories'" />
        <GovEconomy v-else-if="section === 'economy'" />
        <GovBudget v-else-if="section === 'budget'" />
        <GovPolicies v-else-if="['welfare', 'society', 'governance', 'environment'].includes(section)" :category="section as any" />
        <GovSoftPower v-else-if="section === 'culture'" />
        <GovForeign v-else-if="section === 'foreign'" />
        <GovDefense v-else-if="section === 'defense'" />
        <GovWorld v-else-if="section === 'world'" />
      </main>
    </div>
  </div>
</template>

<style scoped>
.gov-veil { position: fixed; inset: 0; z-index: 35; background: rgba(2, 4, 8, 0.55); display: grid; place-items: center; padding: 14px; }
.gov { width: min(1500px, 100%); height: min(940px, calc(100vh - 28px)); display: grid; grid-template-columns: 240px 1fr; background: rgba(10, 14, 22, 0.97); overflow: hidden; }
.nav { border-right: 1px solid var(--line); padding: 14px 10px; display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.who { display: flex; gap: 10px; align-items: center; padding: 0 4px 10px; }
.flag { width: 38px; height: 26px; border-radius: 4px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.4); flex: none; }
.nm { font-weight: 800; font-size: 14px; line-height: 1.2; }
.tiny { font-size: 11px; }
.kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 8px; }
.kpis > div { background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 6px; padding: 4px 7px; display: flex; flex-direction: column; }
.kpis span { font-size: 9.5px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; }
.kpis b { font-size: 12.5px; }
.grp { font-size: 10px; text-transform: uppercase; letter-spacing: .14em; color: var(--muted); font-weight: 700; margin: 10px 6px 3px; }
.item { display: flex; gap: 8px; align-items: center; background: none; border: 0; text-align: left; padding: 6px 8px; border-radius: 6px; font-size: 12.5px; color: #cbd2dc; }
.item:hover { background: rgba(255,255,255,.05); }
.item.on { background: rgba(255, 212, 59, .12); color: var(--accent); font-weight: 600; }
.foot { margin-top: auto; padding: 10px 6px 0; line-height: 1.6; }
.content { padding: 14px 20px 30px; min-height: 0; }
.head { position: sticky; top: -14px; background: rgba(10, 14, 22, 0.97); padding: 8px 0; z-index: 2; margin-bottom: 6px; }
h2 { margin: 0; font-size: 19px; }
.x { background: none; border: 0; color: var(--muted); font-size: 18px; margin-left: 8px; }
@media (max-width: 900px) {
  .gov-veil { padding: 0; }
  .gov { grid-template-columns: 1fr; grid-template-rows: auto 1fr; height: 100dvh; border-radius: 0; }
  .nav { flex-direction: row; overflow-x: auto; overflow-y: hidden; border-right: 0; border-bottom: 1px solid var(--line); padding: 8px; gap: 4px; scrollbar-width: none; }
  .who, .kpis, .grp, .foot { display: none; }
  .item { flex: none; padding: 8px 10px; font-size: 13px; white-space: nowrap; }
  .content { padding: 10px 12px 40px; }
  .x { font-size: 24px; padding: 4px 8px; }
}
</style>
