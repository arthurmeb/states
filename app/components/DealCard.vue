<script setup lang="ts">
import { computed } from 'vue'
import { CLAUSES, describe } from '~~/shared/deals'
import { dateOf } from '~~/shared/rules'
import { useGame } from '~/composables/useGame'

const props = defineProps<{ id: number; full?: boolean }>()
const { ui, send, me, nations } = useGame()
const d = computed(() => ui.deals.find(x => x.id === props.id))
const a = computed(() => nations.value.get(d.value?.a ?? -1)?.name ?? d.value?.names?.[0] ?? 'a fallen state')
const b = computed(() => nations.value.get(d.value?.b ?? -1)?.name ?? d.value?.names?.[1] ?? 'a fallen state')
const LABEL: Record<string, string> = { proposed: 'Awaiting answer', active: 'In force', rejected: 'Rejected', done: 'Completed', broken: 'Broken', cancelled: 'Lapsed', draft: 'Draft' }
const mine = computed(() => d.value?.b === me.value?.id)
function renounce() { if (confirm('Renouncing a treaty is a public breach: you lose legitimacy and diplomatic standing, and they gain a just cause against you. Renounce?')) send({ t: 'dealRenounce', id: props.id }) }
</script>

<template>
  <div v-if="d" class="deal" :class="d.status">
    <div class="row between">
      <b>📜 {{ d.title }}</b>
      <span class="st">{{ LABEL[d.status] }}</span>
    </div>
    <div v-if="full" class="muted small">{{ a }} ⇄ {{ b }} · proposed {{ dateOf(d.created, false) }}<span v-if="d.end"> · until {{ dateOf(d.end, false) }}</span></div>
    <ul>
      <li v-for="(c, i) in d.clauses" :key="i"><span>{{ CLAUSES[c.kind].icon }}</span> {{ describe(c, a, b) }}</li>
    </ul>
    <div v-if="d.notes" class="muted small">💡 {{ d.notes }}</div>
    <div v-if="d.breach" class="breach">💔 Broken by {{ d.breach.by === d.a ? a : b }}: {{ d.breach.what }}</div>
    <div v-if="d.status === 'proposed' && mine" class="row">
      <button class="btn primary small" @click="send({ t: 'dealRespond', id: d.id, accept: true })">Accept</button>
      <button class="btn small" @click="send({ t: 'dealRespond', id: d.id, accept: false })">Reject</button>
    </div>
    <div v-else-if="d.status === 'active' && full" class="row"><button class="btn small danger" @click="renounce">Renounce</button></div>
  </div>
</template>

<style scoped>
.deal { border: 1px solid var(--line-strong); border-radius: 8px; padding: 8px 10px; margin-top: 6px; display: grid; gap: 5px; background: rgba(255,255,255,.03); font-size: 12.5px; }
.deal.active { border-color: rgba(81, 207, 102, .45); }
.deal.proposed { border-color: rgba(255, 212, 59, .5); }
.deal.broken { border-color: rgba(255, 80, 80, .5); }
.row { display: flex; gap: 6px; align-items: center; }
.between { justify-content: space-between; }
.st { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
ul { margin: 0; padding-left: 4px; list-style: none; display: grid; gap: 2px; }
.small { font-size: 11.5px; }
.breach { color: #ffa8a8; font-size: 12px; }
</style>
