<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useGame } from '~/composables/useGame'
const { ui, me, snap } = useGame()
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (ui.provinceView != null) ui.provinceView = null
  else if (ui.gov) ui.gov = null
  else if (ui.showIssue) ui.showIssue = false
  else { ui.selected = null; ui.inspectNation = null }
}
onMounted(() => window.addEventListener('keydown', onKey))
type Sheet = 'nation' | 'wire' | 'modes'
const picked = computed(() => ui.selected != null || ui.inspectNation != null)
/** Phone tabs: tapping the open tab (or Map) closes every sheet. */
function tab(s: Sheet | null) {
  ui.selected = null; ui.inspectNation = null
  ui.sheet = s && ui.sheet !== s ? s : null
}
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="app" :class="['sheet-' + (ui.sheet ?? 'none'), { picked, founding: !me }]">
    <GlobeMap />
    <TopBar />
    <aside class="left" :class="{ collapsed: !ui.panelOpen }">
      <SituationPanel v-if="me" />
      <FoundPanel v-else-if="snap" />
    </aside>
    <aside class="right">
      <NationInspect v-if="ui.inspectNation != null" :key="'n' + ui.inspectNation" />
      <ProvincePanel v-else-if="ui.selected != null" :key="'p' + ui.selected" />
      <div class="spacer" />
      <WirePanel />
    </aside>
    <MapModes />
    <Government v-if="ui.gov && me" />
    <ProvinceView v-if="ui.provinceView != null" :key="'pv' + ui.provinceView" />
    <IssueModal v-if="ui.showIssue && snap?.issue" />
    <Toasts />
    <nav class="tabbar glass">
      <button :class="{ on: !ui.sheet && !picked }" @click="tab(null)"><span>🌍</span>Map</button>
      <button :class="{ on: ui.sheet === 'nation' && !picked }" @click="tab('nation')"><span>🏛</span>{{ me ? 'Nation' : 'Found' }}</button>
      <button v-if="snap?.issue" class="hot" @click="ui.showIssue = true"><span>📜</span>Issue</button>
      <button :class="{ on: ui.sheet === 'wire' && !picked }" @click="tab('wire')"><span>📰</span>News</button>
      <button :class="{ on: ui.sheet === 'modes' && !picked }" @click="tab('modes')"><span>🎨</span>Layers</button>
    </nav>
    <div v-if="!ui.connected" class="offline glass">Connecting to the world server…</div>
  </div>
</template>

<style scoped>
.app { position: fixed; inset: 0; }
.left { position: absolute; top: 66px; left: 12px; bottom: 12px; width: 350px; display: flex; flex-direction: column; pointer-events: none; z-index: 10; transition: transform 0.25s ease; }
.left > * { pointer-events: auto; }
.left.collapsed { transform: translateX(-372px); }
.right { position: absolute; top: 66px; right: 12px; bottom: 12px; width: 330px; display: flex; flex-direction: column; gap: 10px; pointer-events: none; z-index: 10; }
.right > * { pointer-events: auto; }
.spacer { flex: 1; pointer-events: none !important; }
.offline { position: absolute; top: 72px; left: 50%; transform: translateX(-50%); padding: 8px 14px; z-index: 30; color: var(--warn); }
/* ── phones: bottom tab bar + one sheet at a time ── */
.tabbar { display: none; }
@media (max-width: 900px) {
  .tabbar { display: flex; position: absolute; left: 6px; right: 6px; bottom: calc(6px + env(safe-area-inset-bottom)); height: 54px; z-index: 25; padding: 4px; gap: 2px; }
  .tabbar button { flex: 1; background: none; border: 0; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; font-size: 10.5px; font-weight: 600; color: var(--muted); }
  .tabbar button span { font-size: 18px; line-height: 1; }
  .tabbar button.on { background: rgba(255, 212, 59, .12); color: var(--accent); }
  .tabbar button.hot { color: var(--accent); animation: pulse 2s infinite; }
  .left, .right { left: 6px; right: 6px; width: auto; top: auto; bottom: calc(66px + env(safe-area-inset-bottom)); max-height: 62dvh; transform: none; transition: none; }
  .left.collapsed { transform: none; }
  .left { display: none; }
  .sheet-nation:not(.picked) .left, .founding.sheet-none:not(.picked) .left { display: flex; }
  .founding.sheet-none .left { max-height: 46dvh; }
  .right { gap: 0; }
  .right .spacer { display: none; }
  .right :deep(.wire) { display: none; height: 55dvh; }
  .sheet-wire:not(.picked) .right :deep(.wire) { display: flex; }
  .right :deep(.prov), .right :deep(.insp) { max-height: 62dvh; }
  .app:not(.sheet-modes) :deep(.modes) { display: none; }
  .offline { top: 58px; }
}
@keyframes pulse { 50% { background: rgba(255, 212, 59, .15); } }
</style>
