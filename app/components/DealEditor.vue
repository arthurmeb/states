<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CLAUSES, describe, type Clause, type ClauseKind } from '~~/shared/deals'
import { POLICIES, type ChoicePolicy } from '~~/shared/policies'
import { SECTORS } from '~~/shared/sectors'
import { useGame } from '~/composables/useGame'

const props = defineProps<{ to: number }>()
const emit = defineEmits<{ done: [] }>()
const { ui, send, me, nations, snap, provinces } = useGame()
const other = computed(() => nations.value.get(props.to))
const text = ref(''), title = ref(''), notes = ref('')
const clauses = ref<Clause[]>([])
const drafting = ref(false)
const addKind = ref<ClauseKind>('payment')
const policies = POLICIES.filter((p): p is ChoicePolicy => p.kind === 'choice' && p.id !== 'government')
const sectors = SECTORS.filter(s => s.tradable)
const provsOf = (id: number | undefined) => (snap.value?.prov.owner ?? []).map((o, pid) => (o === id ? provinces.value[pid]?.name : null)).filter(Boolean) as string[]

function draft() { drafting.value = true; send({ t: 'dealCompile', to: props.to, text: text.value }) }
watch(() => ui.draft, d => {
  if (!d || d.to !== props.to) return
  drafting.value = false
  title.value = d.title; notes.value = d.notes; clauses.value = d.clauses
  ui.draft = null
})
function add() {
  const k = addKind.value
  const base: Record<ClauseKind, Clause> = {
    payment: { kind: 'payment', from: 'a', amount: 5, monthly: false, months: 12 },
    loan: { kind: 'loan', from: 'a', amount: 20, rate: 4, years: 5 },
    tariff: { kind: 'tariff', from: 'a', rate: 0, years: 5 },
    supply: { kind: 'supply', from: 'a', sector: 'oil', share: 0.1, discount: 0.2, years: 5 },
    tech: { kind: 'tech', from: 'a', years: 5 },
    province: { kind: 'province', from: 'a', province: provsOf(me.value?.id)[1] ?? '' },
    policy: { kind: 'policy', from: 'b', policy: policies[0].id, option: policies[0].options[0].id, years: 5 },
    nonaggression: { kind: 'nonaggression', years: 10 },
    alliance: { kind: 'alliance' }, pact: { kind: 'pact' }, peace: { kind: 'peace' },
    aid: { kind: 'aid', from: 'a', years: 5 },
    promise: { kind: 'promise', from: 'a', text: '', years: 5 },
  }
  clauses.value.push(structuredClone(base[k]))
}
function propose() {
  send({ t: 'dealPropose', to: props.to, title: title.value || 'Agreement', text: text.value, clauses: clauses.value as unknown as Record<string, unknown>[], notes: notes.value })
  emit('done')
}
const sideName = (s: 'a' | 'b') => (s === 'a' ? me.value?.name : other.value?.name)
const optionsOf = (id: string) => policies.find(p => p.id === id)?.options ?? []
</script>

<template>
  <div class="ed">
    <h3>📜 Deal with {{ other?.name }}</h3>
    <div v-if="ui.llm" class="free">
      <textarea v-model="text" class="field" rows="3" maxlength="1500" placeholder="Write anything: “You get Basra and $40B over five years. In return you cap tariffs on our cars at 5%, share your chip technology and vote with us at the Committee.”" />
      <div class="row">
        <button class="btn primary" :disabled="drafting || text.trim().length < 8" @click="draft">{{ drafting ? '⚖ Drafting…' : '⚖ Draft it' }}</button>
        <span class="muted small">Your lawyers turn it into enforceable clauses. Anything the game can't enforce becomes a public promise.</span>
      </div>
    </div>
    <p v-else class="muted small">Build your deal clause by clause. (Free-text drafting appears when the server has a language model.)</p>

    <input v-model="title" class="field" maxlength="60" placeholder="Treaty name">
    <p v-if="notes" class="notes">💡 {{ notes }}</p>

    <div class="clauses scroll">
      <div v-for="(c, i) in clauses" :key="i" class="cl">
        <div class="row between">
          <b>{{ CLAUSES[c.kind].icon }} {{ CLAUSES[c.kind].label }}</b>
          <button class="x" @click="clauses.splice(i, 1)">✕</button>
        </div>
        <div class="fields">
          <label v-if="'from' in c">By <select v-model="c.from" class="field"><option value="a">{{ sideName('a') }}</option><option value="b">{{ sideName('b') }}</option></select></label>
          <label v-if="'amount' in c">$B <input v-model.number="c.amount" type="number" min="0.1" step="0.5" class="field"></label>
          <label v-if="c.kind === 'payment'"><input v-model="c.monthly" type="checkbox"> monthly</label>
          <label v-if="c.kind === 'payment' && c.monthly">months <input v-model.number="c.months" type="number" min="1" class="field"></label>
          <label v-if="'rate' in c">{{ c.kind === 'loan' ? 'interest %' : 'max tariff %' }} <input v-model.number="c.rate" type="number" min="0" class="field"></label>
          <label v-if="c.kind === 'supply'">sector <select v-model="c.sector" class="field"><option v-for="s in sectors" :key="s.id" :value="s.id">{{ s.icon }} {{ s.label }}</option></select></label>
          <label v-if="c.kind === 'supply'">share % <input :value="Math.round(c.share * 100)" type="number" min="1" max="50" class="field" @input="c.share = +($event.target as HTMLInputElement).value / 100"></label>
          <label v-if="c.kind === 'supply'">discount % <input :value="Math.round(c.discount * 100)" type="number" min="0" max="100" class="field" @input="c.discount = +($event.target as HTMLInputElement).value / 100"></label>
          <label v-if="c.kind === 'province'">province <select v-model="c.province" class="field"><option v-for="p in provsOf(c.from === 'a' ? me?.id : props.to)" :key="p" :value="p">{{ p }}</option></select></label>
          <label v-if="c.kind === 'policy'">policy <select v-model="c.policy" class="field" @change="c.option = optionsOf(c.policy)[0]?.id ?? ''"><option v-for="p in policies" :key="p.id" :value="p.id">{{ p.label }}</option></select></label>
          <label v-if="c.kind === 'policy'">option <select v-model="c.option" class="field"><option v-for="o in optionsOf(c.policy)" :key="o.id" :value="o.id">{{ o.label }}</option></select></label>
          <label v-if="c.kind === 'promise'" class="wide">promise <input v-model="c.text" class="field" maxlength="200" placeholder="What is promised"></label>
          <label v-if="'years' in c">years <input v-model.number="c.years" type="number" min="1" max="30" class="field"></label>
        </div>
        <div class="muted small">{{ describe(c, me?.name ?? 'You', other?.name ?? 'They') }}</div>
      </div>
      <div v-if="!clauses.length" class="muted small">No clauses yet.</div>
    </div>

    <div class="row">
      <select v-model="addKind" class="field addk"><option v-for="(v, k) in CLAUSES" :key="k" :value="k">{{ v.icon }} {{ v.label }}</option></select>
      <button class="btn" @click="add">+ Add clause</button>
      <span class="grow" />
      <button class="btn" @click="emit('done')">Cancel</button>
      <button class="btn primary" :disabled="!clauses.length" @click="propose">Send proposal</button>
    </div>
  </div>
</template>

<style scoped>
.ed { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 1; }
h3 { margin: 0; }
.free { display: grid; gap: 6px; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.between { justify-content: space-between; }
.grow { flex: 1; }
.small { font-size: 11.5px; }
.notes { font-size: 12px; color: #ffe8a1; margin: 0; }
.clauses { flex: 1; min-height: 0; display: grid; gap: 6px; align-content: start; }
.cl { border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; display: grid; gap: 5px; font-size: 12.5px; }
.fields { display: flex; flex-wrap: wrap; gap: 8px; }
.fields label { display: flex; gap: 4px; align-items: center; font-size: 11.5px; color: var(--muted); }
.fields .field { padding: 3px 6px; font-size: 12px; width: auto; max-width: 180px; }
.fields input[type=number] { width: 70px; }
.fields .wide { flex: 1; }
.fields .wide .field { max-width: none; flex: 1; }
.x { background: none; border: 0; color: var(--muted); }
.addk { width: auto; }
</style>
