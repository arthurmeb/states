<script setup lang="ts">
import { computed, ref } from 'vue'
import { POLICIES, type PolicyCategory, type ChoicePolicy } from '~~/shared/policies'
import { DAYS_PER_MONTH } from '~~/shared/rules'
import { useGame } from '~/composables/useGame'
import { effectChips } from '~/utils/effects'

const props = defineProps<{ category: PolicyCategory }>()
const { me, snap, send } = useGame()
const list = computed(() => POLICIES.filter((p): p is ChoicePolicy => p.kind === 'choice' && p.category === props.category))
const preview = ref<Record<string, string>>({})
const cooldown = (id: string) => Math.max(0, Math.ceil(((me.value?.cooldowns[id] ?? 0) - (snap.value?.tick ?? 0)) / DAYS_PER_MONTH))
function choose(p: ChoicePolicy, id: string) {
  if (me.value?.policy[p.id] === id) return
  if (p.id === 'government' && !confirm('A new constitution costs 12 stability and locks reform for 3 years. Proceed?')) return
  if (p.cooldown && !confirm(`${p.label} can only be changed every ${p.cooldown} months. Proceed?`)) return
  send({ t: 'policy', id: p.id, value: id })
}
const INTRO: Record<string, string> = {
  welfare: 'Public services and the safety net shape health, education, inequality, poverty and the long arc of human development.',
  society: 'Rights, identity and belonging. These choices move factions sharply — and shape how the world sees you.',
  governance: 'The machinery of state: who rules, who watches, who judges. Institutions compound over decades.',
  environment: 'Pollution, carbon and energy. Clean air extends lives and wins progressive and global goodwill; dirty energy is cheap now.',
}
</script>

<template>
  <div v-if="me">
    <p class="intro">{{ INTRO[category] }} Hover an option to preview its effects.</p>
    <div class="cards">
      <div v-for="p in list" :key="p.id" class="card stat">
        <div class="row between">
          <b>{{ p.label }}</b>
          <span v-if="cooldown(p.id)" class="tag warn">locked {{ cooldown(p.id) }} mo</span>
        </div>
        <div class="muted tiny">{{ p.desc }}</div>
        <div class="opts">
          <button v-for="o in p.options" :key="o.id" class="opt" :class="{ on: me.policy[p.id] === o.id }" :disabled="!!cooldown(p.id) && me.policy[p.id] !== o.id"
            @mouseenter="preview[p.id] = o.id" @mouseleave="delete preview[p.id]" @click="choose(p, o.id)">
            {{ o.label }}
          </button>
        </div>
        <template v-for="o in [p.options.find(x => x.id === (preview[p.id] ?? me!.policy[p.id]))!]" :key="o.id">
          <div class="desc"><b>{{ o.label }}</b><span v-if="o.desc"> — {{ o.desc }}</span></div>
          <div class="chips"><span v-for="c in effectChips(o.mods)" :key="c.text" class="chip" :class="c.good ? 'g' : 'b'">{{ c.text }}</span><span v-if="!Object.keys(o.mods).length" class="muted tiny">Baseline.</span></div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.intro { font-size: 12px; color: var(--muted); margin: 0 0 12px; line-height: 1.5; max-width: 900px; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 10px; }
.card { padding: 11px 13px; }
.tiny { font-size: 11px; margin-top: 2px; }
.opts { display: flex; flex-wrap: wrap; gap: 4px; margin: 8px 0 6px; }
.opt { background: rgba(255,255,255,.05); border: 1px solid var(--line-strong); border-radius: 6px; padding: 5px 9px; font-size: 12px; font-weight: 600; color: #cbd2dc; }
.opt:hover:not(:disabled) { border-color: var(--accent); }
.opt.on { background: rgba(255, 212, 59, .15); border-color: var(--accent); color: var(--accent); }
.opt:disabled { opacity: .35; }
.desc { font-size: 11.5px; color: #c5cbd6; margin-bottom: 5px; }
</style>
