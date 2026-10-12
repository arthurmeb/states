<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { BUDGET, POLICY_MAP, type SliderPolicy } from '~~/shared/policies'
import { formatIndex } from '~~/shared/indices'
import { useGame, fmtMoney } from '~/composables/useGame'
import { effectChips } from '~/utils/effects'

const { me, send } = useGame()
const TAXES = ['incomeTax', 'corporateTax', 'vat', 'tariff'] as const
const tax = reactive<Record<string, number>>({})
const budget = reactive<Record<string, number>>({})
let editing = false
function sync() {
  if (editing || !me.value) return
  for (const t of TAXES) tax[t] = +me.value.policy[t]
  Object.assign(budget, me.value.budget)
}
watch(() => me.value && JSON.stringify([me.value.policy, me.value.budget]), sync, { immediate: true })
const gdpMonthly = computed(() => (me.value?.idx.gdp ?? 0) / 12)
const totalBudget = computed(() => BUDGET.reduce((a, b) => a + (budget[b.id] ?? 0), 0))
const revenue = computed(() => Object.values(me.value?.ledger.revenue ?? {}).reduce((a, b) => a + b, 0))
const spending = computed(() => Object.values(me.value?.ledger.spending ?? {}).reduce((a, b) => a + b, 0))
function commitTax(id: string) { editing = false; send({ t: 'policy', id, value: tax[id] }) }
function commitBudget() { editing = false; send({ t: 'budget', budget: { ...budget } }) }
const REV_LABEL: Record<string, string> = { income: 'Income tax', payroll: 'Social contributions', corporate: 'Corporate tax', vat: 'Sales tax / VAT', tariffs: 'Tariffs', resources: 'Resource rents', stateEnterprise: 'State enterprises', aid: 'Foreign aid received' }
const SP_LABEL: Record<string, string> = Object.fromEntries([...BUDGET.map(b => [b.id, `${b.icon} ${b.label}`]), ['interest', '🏦 Debt interest']])
</script>

<template>
  <div v-if="me">
    <div class="grid5">
      <div class="stat"><div class="k">Revenue</div><div class="v mono">{{ ((revenue / Math.max(0.001, gdpMonthly)) * 100).toFixed(1) }}%</div><div class="s">of GDP · {{ fmtMoney(revenue * 12) }}/yr</div></div>
      <div class="stat"><div class="k">Spending</div><div class="v mono">{{ ((spending / Math.max(0.001, gdpMonthly)) * 100).toFixed(1) }}%</div><div class="s">of GDP · {{ fmtMoney(spending * 12) }}/yr</div></div>
      <div class="stat"><div class="k">Balance</div><div class="v mono" :class="me.ledger.net < 0 ? 'bad' : 'good'">{{ (me.idx.deficit ?? 0).toFixed(1) }}%</div><div class="s">{{ fmtMoney(me.ledger.net * 12) }}/yr</div></div>
      <div class="stat"><div class="k">Public debt</div><div class="v mono" :class="(me.idx.debt ?? 0) > 90 ? 'bad' : ''">{{ (me.idx.debt ?? 0).toFixed(0) }}%</div><div class="s">treasury {{ fmtMoney(me.treasury) }}</div></div>
      <div class="stat"><div class="k">Credit rating</div><div class="v mono">{{ formatIndex('rating', me.idx.credit) }}</div><div class="s">yield {{ (me.idx.interest ?? 0).toFixed(1) }}%</div></div>
    </div>

    <div class="cols">
      <section>
        <div class="section-title">Taxation</div>
        <div v-for="id in TAXES" :key="id" class="slider">
          <div class="row between"><b>{{ POLICY_MAP[id].label }}</b><span class="mono">{{ tax[id] }}%</span></div>
          <input v-model.number="tax[id]" type="range" :min="(POLICY_MAP[id] as SliderPolicy).min" :max="(POLICY_MAP[id] as SliderPolicy).max" step="1" @input="editing = true" @change="commitTax(id)">
          <div class="chips"><span v-for="c in effectChips((POLICY_MAP[id] as SliderPolicy).mods(tax[id]), 6)" :key="c.text" class="chip" :class="c.good ? 'g' : 'b'">{{ c.text }}</span></div>
          <p class="hint">{{ POLICY_MAP[id].desc }}</p>
        </div>

        <div class="section-title">Where the money comes from (monthly)</div>
        <div v-for="(v, k) in me.ledger.revenue" :key="k" class="row between line"><span class="muted">{{ REV_LABEL[k] ?? k }}</span><span class="mono" :class="v < 0 ? 'bad' : 'good'">{{ fmtMoney(v) }}</span></div>
      </section>

      <section>
        <div class="section-title row between"><span>Spending · % of GDP</span><span class="mono">{{ totalBudget.toFixed(1) }}% · {{ fmtMoney(totalBudget / 100 * gdpMonthly * 12) }}/yr</span></div>
        <div v-for="b in BUDGET" :key="b.id" class="slider">
          <div class="row between"><b>{{ b.icon }} {{ b.label }}</b><span class="mono">{{ (budget[b.id] ?? 0).toFixed(1) }}% · {{ fmtMoney((budget[b.id] ?? 0) / 100 * gdpMonthly * 12) }}/yr</span></div>
          <input v-model.number="budget[b.id]" type="range" min="0" :max="b.max" step="0.1" @input="editing = true" @change="commitBudget">
          <p class="hint">{{ b.desc }}</p>
        </div>
        <div class="section-title">Debt service</div>
        <div class="row between line"><span class="muted">Interest this month</span><span class="mono bad">{{ fmtMoney(me.ledger.spending.interest ?? 0) }}</span></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.grid5 { display: grid; grid-template-columns: repeat(5, 1fr); gap: 7px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 6px; }
.slider { margin-bottom: 8px; }
.hint { font-size: 11px; color: var(--muted); margin: 2px 0 0; line-height: 1.4; }
.line { font-size: 12.5px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
@media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } .grid5 { grid-template-columns: repeat(2, 1fr); } }
</style>
