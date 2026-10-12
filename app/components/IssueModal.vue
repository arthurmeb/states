<script setup lang="ts">
import { computed } from 'vue'
import { useGame } from '~/composables/useGame'
const { snap, ui, send, me } = useGame()
const issue = computed(() => snap.value?.issue)
function choose(i: number) { send({ t: 'issue', option: i }); ui.showIssue = false }
</script>

<template>
  <div v-if="issue" class="veil" @click.self="ui.showIssue = false">
    <div class="card glass">
      <div class="eyebrow">Cabinet briefing · {{ me?.name }} · decide within {{ issue.expires - (snap?.tick ?? 0) }} months</div>
      <h2>{{ issue.title }}</h2>
      <p class="text">{{ issue.text }}</p>
      <div class="opts">
        <button v-for="(o, i) in issue.options" :key="i" class="opt" @click="choose(i)">
          <b>{{ o.label }}</b>
          <span>{{ o.desc }}</span>
        </button>
      </div>
      <button class="btn small later" @click="ui.showIssue = false">Decide later</button>
    </div>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); z-index: 50; display: grid; place-items: center; padding: 16px; }
.card { width: min(560px, 100%); padding: 22px; background: var(--panel-solid); }
.eyebrow { color: var(--accent); font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 700; }
h2 { margin: 6px 0 10px; font-size: 22px; }
.text { line-height: 1.6; color: #d0d6e0; margin: 0 0 16px; }
.opts { display: grid; gap: 8px; }
.opt { text-align: left; background: rgba(255, 255, 255, 0.04); border: 1px solid var(--line-strong); border-radius: 9px; padding: 11px 13px; display: grid; gap: 3px; transition: border-color 0.15s, background 0.15s; }
.opt:hover { border-color: var(--accent); background: rgba(255, 212, 59, 0.06); }
.opt span { font-size: 12px; color: var(--muted); }
.later { margin-top: 12px; }
@media (max-width: 900px) { .veil { padding: 8px; align-items: end; } .card { max-height: 90dvh; overflow-y: auto; padding: 16px; } .opt { padding: 13px; } }
</style>
