<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { dateOf } from '~~/shared/rules'
import { useGame } from '~/composables/useGame'

const { snap, ui, send, provinces, fly, select, me } = useGame()
const filter = ref<'all' | 'mine'>('all')
function goto(n: { province?: number }) { if (n.province == null) return; const p = provinces.value[n.province]; if (p) { fly(p.lat, p.lon, 4.5); select(n.province) } }
const tab = ref<'news' | 'chat'>('news')
const open = ref(true)
const text = ref('')
const chatEl = ref<HTMLDivElement>()
const unread = ref(0)
const ICON: Record<string, string> = { war: '⚔', peace: '🕊', found: '🏳', capture: '🎯', revolt: '🔥', event: '📰', diplo: '🤝', fall: '☠', market: '📈', trade: '🚢', election: '🗳', games: '🏅', disaster: '🌪', build: '🏗' }

watch(() => ui.chat.length, async () => {
  if (tab.value !== 'chat') unread.value++
  await nextTick(); chatEl.value?.scrollTo({ top: chatEl.value.scrollHeight })
})
const newsEl = ref<HTMLDivElement>()
watch(() => snap.value?.news[0], () => { newsEl.value?.scrollTo({ top: 0, behavior: 'smooth' }) })
watch(tab, async t => { if (t === 'chat') { unread.value = 0; await nextTick(); chatEl.value?.scrollTo({ top: chatEl.value.scrollHeight }) } })
function submit() { if (text.value.trim()) { send({ t: 'chat', text: text.value }); text.value = '' } }
</script>

<template>
  <div class="wire glass" :class="{ closed: !open }">
    <div class="tabs">
      <button :class="{ on: tab === 'news' }" @click="tab = 'news'; open = true">World news</button>
      <button :class="{ on: tab === 'chat' }" @click="tab = 'chat'; open = true">Diplomatic channel<span v-if="unread" class="dot">{{ unread }}</span></button>
      <button class="tog" @click="open = !open">{{ open ? '▾' : '▴' }}</button>
    </div>
    <template v-if="open">
      <div v-if="tab === 'news'" ref="newsEl" class="feed scroll">
        <div class="seg mini"><button :class="{ on: filter === 'all' }" @click="filter = 'all'">World</button><button :class="{ on: filter === 'mine' }" :disabled="!me" @click="filter = 'mine'">My nation</button></div>
        <div v-for="(n, i) in (snap?.news ?? []).filter(x => filter === 'all' || x.nations?.includes(me?.id ?? -1))" :key="i" class="item" :class="[n.kind, { link: n.province != null }]" @click="goto(n)">
          <span class="ic">{{ ICON[n.kind] }}</span>
          <div><div class="when mono">{{ dateOf(n.tick) }}</div>{{ n.text }}</div>
        </div>
      </div>
      <template v-else>
        <div ref="chatEl" class="feed scroll">
          <div v-if="!ui.chat.length" class="muted" style="padding:8px">Speak to the world. Threaten, negotiate, form blocs.</div>
          <div v-for="(m, i) in ui.chat" :key="i" class="msg"><b :style="{ color: m.color }">{{ m.from }}</b> <span>{{ m.text }}</span></div>
        </div>
        <form class="say" @submit.prevent="submit">
          <input v-model="text" class="field" maxlength="240" placeholder="Address the world…">
        </form>
      </template>
    </template>
  </div>
</template>

<style scoped>
.wire { height: 270px; display: flex; flex-direction: column; flex: none; }
.wire.closed { height: auto; }
.tabs { display: flex; border-bottom: 1px solid var(--line); }
.tabs button { flex: 1; background: none; border: 0; padding: 8px 4px; font-size: 11.5px; font-weight: 600; color: var(--muted); }
.tabs button.on { color: var(--text); }
.tabs .tog { flex: 0 0 32px; }
.dot { margin-left: 4px; background: var(--accent); color: #000; border-radius: 8px; font-size: 9.5px; padding: 0 5px; font-weight: 800; }
.feed { flex: 1; min-height: 0; padding: 6px 8px; font-size: 12px; }
.item { display: flex; gap: 8px; padding: 5px 2px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); line-height: 1.4; }
.item.war, .item.fall { color: #ffc9c9; }
.item.peace, .item.diplo { color: #c3fae8; }
.item.found { color: #ffec99; }
.item.trade { color: #ffd8a8; }
.item.election, .item.games { color: #d0bfff; }
.item.disaster { color: #ffc078; }
.item.link { cursor: pointer; }
.item.link:hover { background: rgba(255,255,255,.04); }
.seg.mini { margin: 2px 0 4px; }
.seg.mini button { padding: 3px; font-size: 11px; }
.ic { width: 16px; flex: none; text-align: center; }
.when { font-size: 10px; color: var(--muted); }
.msg { padding: 3px 0; line-height: 1.4; word-wrap: break-word; }
.say { padding: 6px 8px 8px; }
.say .field { padding: 6px 9px; font-size: 12px; }
</style>
