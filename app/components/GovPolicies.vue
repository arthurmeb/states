<script setup lang="ts">
import { computed, ref } from 'vue'
import { POLICIES, BLOCS, optionMods, optionNote, type PolicyCategory, type ChoicePolicy } from '~~/shared/policies'
import { ELECTORAL } from '~~/shared/power'
import { DAYS_PER_MONTH } from '~~/shared/rules'
import { useGame } from '~/composables/useGame'
import { effectChips } from '~/utils/effects'
import { policyPC, governing } from '~/utils/power'

const props = defineProps<{ category: PolicyCategory }>()
const { me, snap, send } = useGame()
const list = computed(() => POLICIES.filter((p): p is ChoicePolicy => p.kind === 'choice' && p.category === props.category))
const preview = ref<Record<string, string>>({})
const cooldown = (id: string) => Math.max(0, Math.ceil(((me.value?.cooldowns[id] ?? 0) - (snap.value?.tick ?? 0)) / DAYS_PER_MONTH))
const canAct = computed(() => governing(me.value))
const decree = computed(() => !ELECTORAL.has(String(me.value?.policy.government)))
const cost = (p: ChoicePolicy, id: string) => (me.value && me.value.policy[p.id] !== id ? policyPC(me.value, p.id, id) : 0)
const yrs = (id: string) => me.value?.since[id] ?? 0

function shown(p: ChoicePolicy) {
  const m = me.value!
  const id = preview.value[p.id] ?? String(m.policy[p.id])
  const o = p.options.find(x => x.id === id)!
  const cur = id === m.policy[p.id]
  const age = cur ? yrs(p.id) : 0
  const mods = optionMods(p, id, m.cond, age)
  const note = optionNote(p, id, m.cond, age)
  // what repealing the current option would set off
  const curOpt = p.options.find(x => x.id === m.policy[p.id])
  const leave = !cur && curOpt?.onLeave ? curOpt.onLeave(m.cond, yrs(p.id)) : null
  const leaveText = leave ? Object.entries(leave).map(([k, v]) => `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v))} ${k === 'stability' ? 'stability' : k === 'inflation' ? 'pts inflation' : BLOCS.find(b => b.id === k)?.icon + ' ' + k}`).join(', ') : ''
  return { o, cur, mods, note, leaveText, situational: !!o.ctx }
}
function choose(p: ChoicePolicy, id: string) {
  const m = me.value
  if (!m || m.policy[p.id] === id) return
  const c = cost(p, id)
  if (!decree.value && c > m.power.pc) return
  const shortfall = decree.value && c > m.power.pc ? `\n\nYou only have ${Math.round(m.power.pc)} capital: the rest will be paid in legitimacy and stability (rule by decree).` : ''
  if (p.id === 'government' && !confirm(`A new constitution costs ${c.toFixed(0)} political capital and 12 stability, and locks reform for 3 years. Proceed?${shortfall}`)) return
  if (p.cooldown && p.id !== 'government' && !confirm(`${p.label} can only be changed every ${p.cooldown} months. Spend ${c.toFixed(0)} political capital?${shortfall}`)) return
  if (shortfall && !p.cooldown && !confirm(`This costs ${c.toFixed(0)} political capital.${shortfall}`)) return
  send({ t: 'policy', id: p.id, value: id })
}
const INTRO: Record<string, string> = {
  economy: 'The rules of the economy. Their effects depend heavily on how developed, open, indebted and well-governed you are, and many sour if left in place too long.',
  welfare: 'Public services and the safety net shape health, education, inequality, poverty and the long arc of human development. Pensions grow automatically as your population ages.',
  society: 'Rights, identity and belonging. These choices move factions sharply, and shape how the world sees you.',
  governance: 'The machinery of state: who rules, who watches, who judges. Institutions compound over decades.',
  environment: 'Pollution, carbon, energy and climate. Clean energy gets cheaper every year; the climate gets hotter every year.',
}
</script>

<template>
  <div v-if="me">
    <p class="intro">{{ INTRO[category] }} Hover an option to see what it would do <b>here, now</b>. The ⚡ number is the political capital it costs (you have <b>{{ Math.round(me.power.pc) }}</b>).</p>
    <div v-if="!canAct" class="locked">You are not in government: these are the opposition's policies to criticise, not yours to change.</div>
    <div class="cards">
      <div v-for="p in list" :key="p.id" class="card stat">
        <div class="row between">
          <b>{{ p.label }} <span v-if="p.isNew" class="tag new">new</span></b>
          <span class="row">
            <span class="muted tiny mono" :title="'Years the current option has been in force'">{{ yrs(p.id).toFixed(0) }} yrs</span>
            <span v-if="cooldown(p.id)" class="tag warn">locked {{ cooldown(p.id) }} mo</span>
          </span>
        </div>
        <div class="muted tiny">{{ p.desc }}</div>
        <div class="opts">
          <button v-for="o in p.options" :key="o.id" class="opt" :class="{ on: me.policy[p.id] === o.id, poor: me.policy[p.id] !== o.id && !decree && cost(p, o.id) > me.power.pc }"
            :disabled="!canAct || (!!cooldown(p.id) && me.policy[p.id] !== o.id)"
            @mouseenter="preview[p.id] = o.id" @mouseleave="delete preview[p.id]" @click="choose(p, o.id)">
            {{ o.label }}<small v-if="me.policy[p.id] !== o.id" class="pc">⚡{{ cost(p, o.id).toFixed(0) }}</small>
          </button>
        </div>
        <template v-for="s in [shown(p)]" :key="s.o.id">
          <div class="desc"><b>{{ s.o.label }}</b><span v-if="s.o.desc"> · {{ s.o.desc }}</span></div>
          <div v-if="s.note" class="note">💡 {{ s.note }}</div>
          <div class="chips"><span v-for="c in effectChips(s.mods)" :key="c.text" class="chip" :class="c.good ? 'g' : 'b'">{{ c.text }}</span><span v-if="!Object.keys(s.mods).length" class="muted tiny">Baseline.</span></div>
          <div v-if="s.leaveText" class="leave">⚠ Repealing the current option now: {{ s.leaveText }}</div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intro { font-size: 12px; color: var(--muted); margin: 0 0 12px; line-height: 1.5; max-width: 900px; }
.locked { padding: 7px 10px; border-radius: 7px; background: rgba(252, 196, 25, .08); border: 1px solid rgba(252, 196, 25, .35); color: #ffe8a1; font-size: 12px; margin-bottom: 10px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 10px; }
.card { padding: 11px 13px; }
.tiny { font-size: 11px; margin-top: 2px; }
.row { display: flex; gap: 6px; align-items: center; }
.opts { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0 6px; }
.opt { background: rgba(255,255,255,.05); border: 1px solid var(--line-strong); border-radius: 6px; padding: 5px 9px; font-size: 12px; font-weight: 600; color: #cbd2dc; display: inline-flex; gap: 5px; align-items: baseline; }
.opt:hover:not(:disabled) { border-color: var(--accent); }
.opt.on { background: rgba(255, 212, 59, .15); border-color: var(--accent); color: var(--accent); }
.opt.poor { opacity: .55; }
.opt:disabled { opacity: .35; }
.pc { font-size: 10px; color: var(--muted); font-weight: 600; }
.desc { font-size: 11.5px; color: #c5cbd6; margin-bottom: 5px; }
.note { font-size: 11.5px; color: #ffe8a1; margin-bottom: 5px; line-height: 1.4; }
.leave { font-size: 11px; color: #ffc9c9; margin-top: 5px; }
.tag.new { background: rgba(116, 192, 252, .18); color: #a5d8ff; font-size: 9.5px; }
</style>
