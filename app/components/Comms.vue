<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { dateOf } from '~~/shared/rules'
import type { RoomView } from '~~/shared/types'
import { useGame, unread, markRead } from '~/composables/useGame'

const { ui, send, me, nations } = useGame()
type Tab = 'thread' | 'dm' | 'group' | 'deals'
const tab = ref<Tab>('thread')
const mode = ref<'view' | 'newThread' | 'newGroup' | 'newDm' | 'invite' | 'deal'>('view')
const text = ref(''), title = ref(''), search = ref('')
const picked = ref<number[]>([])
const msgsEl = ref<HTMLDivElement>()

const list = computed(() => ui.rooms.filter(r => r.kind === tab.value))
const room = computed(() => ui.rooms.find(r => r.id === ui.room) ?? null)
const msgs = computed(() => (ui.room != null ? ui.msgs[ui.room] ?? [] : []))
const counts = computed(() => Object.fromEntries((['thread', 'dm', 'group'] as Tab[]).map(k => [k, ui.rooms.filter(r => r.kind === k && unread(r)).length])))
const others = computed(() => [...nations.value.values()].filter(n => n.id !== me.value?.id && n.name.toLowerCase().includes(search.value.toLowerCase())).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)))

function openRoom(r: RoomView) {
  ui.room = r.id; mode.value = 'view'
  send({ t: 'history', room: r.id })
  markRead(r.id)
}
watch(() => ui.room, r => { const x = ui.rooms.find(y => y.id === r); if (x && tab.value !== 'deals') tab.value = x.kind })
const dmOther = computed(() => (room.value?.kind === 'dm' ? room.value.members.find(id => id !== me.value?.id) ?? null : null))
const openDeals = computed(() => ui.deals.filter(d => d.status === 'proposed' && d.b === me.value?.id).length)
watch(() => msgs.value.length, async () => { await nextTick(); msgsEl.value?.scrollTo({ top: msgsEl.value.scrollHeight }); if (ui.room != null) markRead(ui.room) })
function submit() {
  if (!text.value.trim() || ui.room == null) return
  send({ t: 'say', room: ui.room, text: text.value }); text.value = ''
}
function createThread() { send({ t: 'thread', title: title.value, text: text.value }); title.value = ''; text.value = ''; mode.value = 'view' }
function createGroup() { send({ t: 'group', title: title.value, members: picked.value }); title.value = ''; picked.value = []; mode.value = 'view' }
function invite() { if (ui.room != null) send({ t: 'groupEdit', room: ui.room, add: picked.value, leave: false }); picked.value = []; mode.value = 'view' }
function leave() { if (ui.room != null && confirm('Leave this group?')) { send({ t: 'groupEdit', room: ui.room, add: [], leave: true }); ui.room = null } }
function startDm(id: number) { send({ t: 'dm', nation: id }); mode.value = 'view' }
const toggle = (id: number) => { picked.value = picked.value.includes(id) ? picked.value.filter(x => x !== id) : [...picked.value, id] }
const when = (ts: number, tick: number) => `${new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${dateOf(tick, false)}`
const memberNames = computed(() => room.value?.members.map(id => nations.value.get(id)?.name).filter(Boolean).join(', ') ?? '')
const FILLER = /^(the|of|and|united|republic|kingdom|federation|federal|commonwealth|free|state|democratic|people's|peoples|islamic|empire|union|league|dominion|crown|confederation)$/i
const initials = (s: string) => { const w = s.split(/\s+/).filter(x => !FILLER.test(x)); return (w.length ? w : s.split(/\s+/)).map(x => x[0]).join('').slice(0, 2).toUpperCase() }
const NEW: Record<Tab, string> = { thread: '+ New thread', dm: '+ New message', group: '+ New group', deals: '+ New deal' }
function startNew() { mode.value = tab.value === 'thread' ? 'newThread' : tab.value === 'dm' || tab.value === 'deals' ? 'newDm' : 'newGroup'; ui.room = null; picked.value = []; search.value = '' }
</script>

<template>
  <div v-if="ui.comms" class="veil" @click.self="ui.comms = false">
    <div class="win glass">
      <header class="bar">
        <b>💬 Comms</b>
        <span class="muted small">Café threads are public · DMs and groups are private</span>
        <button class="x" @click="ui.comms = false">✕</button>
      </header>
      <div class="body">
        <aside class="side" :class="{ hideMobile: ui.room != null || mode !== 'view' }">
          <div class="tabs">
            <button :class="{ on: tab === 'thread' }" @click="tab = 'thread'">☕ Café<i v-if="counts.thread" class="dot">{{ counts.thread }}</i></button>
            <button :class="{ on: tab === 'dm' }" @click="tab = 'dm'">✉ Direct<i v-if="counts.dm" class="dot">{{ counts.dm }}</i></button>
            <button :class="{ on: tab === 'group' }" @click="tab = 'group'">👥 Groups<i v-if="counts.group" class="dot">{{ counts.group }}</i></button>
            <button :class="{ on: tab === 'deals' }" @click="tab = 'deals'">📜 Deals<i v-if="openDeals" class="dot">{{ openDeals }}</i></button>
          </div>
          <button class="btn block new" :disabled="!me" @click="startNew">{{ NEW[tab] }}</button>
          <div v-if="tab === 'deals'" class="list scroll">
            <div v-if="!ui.deals.length" class="muted small empty">No treaties yet. Open a direct conversation and press “📜 Propose a deal”.</div>
            <DealCard v-for="d in [...ui.deals].reverse()" :id="d.id" :key="d.id" full />
          </div>
          <div v-else class="list scroll">
            <div v-if="!list.length" class="muted small empty">{{ tab === 'thread' ? 'No threads yet. Start the first one.' : tab === 'dm' ? 'No conversations yet. Message any nation.' : 'No groups yet. Trade blocs get a room automatically; make your own for coalitions and summits.' }}</div>
            <button v-for="r in list" :key="r.id" class="card" :class="{ on: r.id === ui.room, unread: unread(r) }" @click="openRoom(r)">
              <span class="av" :style="{ background: r.color ?? '#495057' }">{{ r.kind === 'group' ? '👥' : initials(r.kind === 'thread' ? nations.get(r.owner ?? -1)?.name ?? r.title : r.title) }}</span>
              <span class="meta">
                <b class="title">{{ r.title }}</b>
                <span class="sub muted">{{ r.count }} · {{ r.preview || 'No messages yet' }}</span>
              </span>
              <i v-if="unread(r)" class="pip" />
            </button>
          </div>
        </aside>

        <main class="main">
          <DealEditor v-if="mode === 'deal' && dmOther != null" :to="dmOther" @done="mode = 'view'" />
          <!-- new thread -->
          <form v-else-if="mode === 'newThread'" class="form" @submit.prevent="createThread">
            <h3>☕ New café thread</h3>
            <input v-model="title" class="field" maxlength="80" placeholder="Title: a question, a proposal, a provocation…">
            <textarea v-model="text" class="field" rows="4" maxlength="600" placeholder="Opening message (optional)" />
            <div class="row"><button class="btn primary">Post thread</button><button type="button" class="btn" @click="mode = 'view'">Cancel</button></div>
          </form>
          <!-- new DM / group / invite: pick nations -->
          <div v-else-if="mode === 'newDm' || mode === 'newGroup' || mode === 'invite'" class="form">
            <h3>{{ mode === 'newDm' ? '✉ Message a nation' : mode === 'newGroup' ? '👥 New group' : '👥 Invite nations' }}</h3>
            <input v-if="mode === 'newGroup'" v-model="title" class="field" maxlength="60" placeholder="Group name: Coalition of the Willing, Oil Summit…">
            <input v-model="search" class="field" placeholder="Search nations…">
            <div class="pick scroll">
              <button v-for="n in others" :key="n.id" class="pn" :class="{ on: picked.includes(n.id) }" @click="mode === 'newDm' ? startDm(n.id) : toggle(n.id)">
                <i :style="{ background: n.color }" />{{ n.name }}<span class="muted small">{{ n.ai ? 'AI' : n.online ? '● online' : 'player' }}</span>
              </button>
            </div>
            <div v-if="mode !== 'newDm'" class="row">
              <button class="btn primary" :disabled="!picked.length || (mode === 'newGroup' && title.trim().length < 2)" @click="mode === 'newGroup' ? createGroup() : invite()">{{ mode === 'newGroup' ? `Create with ${picked.length}` : `Invite ${picked.length}` }}</button>
              <button class="btn" @click="mode = 'view'">Cancel</button>
            </div>
          </div>
          <!-- conversation -->
          <template v-else-if="room">
            <div class="head">
              <button class="back" @click="ui.room = null">‹</button>
              <div>
                <b>{{ room.title }}</b>
                <div class="muted small">{{ room.kind === 'thread' ? `Public thread · started ${dateOf(room.created, false)}` : room.kind === 'dm' ? 'Private conversation' : memberNames }}</div>
              </div>
              <button v-if="room.kind === 'dm'" class="btn small primary deal-btn" @click="mode = 'deal'">📜 Propose a deal</button>
              <div v-if="room.kind === 'group' && room.bloc == null" class="row">
                <button class="btn small" @click="mode = 'invite'; picked = []; search = ''">Invite</button>
                <button class="btn small" @click="leave">Leave</button>
              </div>
            </div>
            <div ref="msgsEl" class="msgs scroll">
              <div v-if="!msgs.length" class="muted small empty">No messages yet. Say something.</div>
              <div v-for="m in msgs" :key="m.id" class="m" :class="{ bot: m.bot }">
                <span class="av sm" :style="{ background: m.color }">{{ m.bot ? '🏛' : initials(m.nation) }}</span>
                <div>
                  <div class="who"><b :style="{ color: m.color }">{{ m.nation }}</b><span v-if="m.user" class="user">@{{ m.user }}</span><span class="muted small">{{ when(m.ts, m.tick) }}</span></div>
                  <div class="txt">{{ m.text }}</div>
                  <DealCard v-if="m.deal" :id="m.deal" />
                </div>
              </div>
            </div>
            <form class="compose" @submit.prevent="submit">
              <input v-model="text" class="field" maxlength="600" :placeholder="me ? 'Type a message… (try /nation, /compare, /top, /wars, /world)' : 'Found a nation to join the conversation'" :disabled="!me">
              <button class="btn primary" :disabled="!me || !text.trim()">Send</button>
            </form>
          </template>
          <div v-else class="welcome muted">
            <div class="big">💬</div>
            <p><b>Café</b>: public threads anyone can read and join. Ask questions, propose alliances, call out aggressors.</p>
            <p><b>Direct</b>: private conversations between two nations.</p>
            <p><b>Groups</b>: private rooms for coalitions, summits and trade blocs.</p>
            <p class="small">Every message shows the nation and the player behind it. Type <code>/</code> commands to query the world.</p>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 45; background: rgba(2, 4, 8, .55); display: grid; place-items: center; padding: 14px; }
.win { width: min(1100px, 100%); height: min(760px, calc(100vh - 28px)); display: flex; flex-direction: column; background: rgba(10, 14, 22, .97); overflow: hidden; }
.bar { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.bar .x { margin-left: auto; background: none; border: 0; color: var(--muted); font-size: 18px; }
.small { font-size: 11.5px; }
.body { flex: 1; display: grid; grid-template-columns: 310px 1fr; min-height: 0; }
.side { border-right: 1px solid var(--line); display: flex; flex-direction: column; min-height: 0; padding: 8px; gap: 6px; }
.tabs { display: flex; gap: 2px; background: rgba(255,255,255,.04); border-radius: 7px; padding: 2px; }
.tabs button { flex: 1; background: none; border: 0; border-radius: 5px; padding: 6px 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
.tabs button.on { background: rgba(255,255,255,.1); color: var(--text); }
.dot { font-style: normal; margin-left: 4px; background: var(--accent); color: #000; border-radius: 8px; padding: 0 5px; font-size: 10px; font-weight: 800; }
.new { padding: 7px; }
.list { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 5px; }
.card { display: flex; gap: 9px; align-items: center; text-align: left; background: rgba(255,255,255,.03); border: 1px solid var(--line); border-radius: 8px; padding: 7px 8px; position: relative; }
.card:hover { border-color: var(--line-strong); }
.card.on { border-color: var(--accent); background: rgba(255, 212, 59, .07); }
.card.unread .title { color: var(--text); }
.av { width: 40px; height: 40px; border-radius: 7px; flex: none; display: grid; place-items: center; font-weight: 800; font-size: 14px; color: rgba(0,0,0,.65); box-shadow: inset 0 0 0 1px rgba(0,0,0,.3); }
.av.sm { width: 34px; height: 34px; font-size: 12px; }
.meta { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.title { font-size: 13px; color: #cbd2dc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pip { position: absolute; right: 8px; top: 8px; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.empty { padding: 10px 6px; line-height: 1.5; }
.main { display: flex; flex-direction: column; min-height: 0; }
.head { display: flex; gap: 10px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.head .row, .head .deal-btn { margin-left: auto; }
.back { display: none; background: none; border: 0; color: var(--muted); font-size: 22px; }
.msgs { flex: 1; min-height: 0; padding: 10px 14px; display: flex; flex-direction: column; gap: 4px; }
.m { display: flex; gap: 10px; padding: 7px 8px; border-radius: 8px; }
.m:hover { background: rgba(255,255,255,.025); }
.m.bot { background: rgba(255, 212, 59, .05); border: 1px solid rgba(255, 212, 59, .15); }
.who { display: flex; gap: 7px; align-items: baseline; flex-wrap: wrap; font-size: 13px; }
.user { font-size: 11.5px; color: #a5d8ff; }
.txt { font-size: 13px; line-height: 1.5; color: #dde2ea; white-space: pre-wrap; word-break: break-word; }
.compose { display: flex; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--line); }
.compose .field { flex: 1; }
.form { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; min-height: 0; flex: 1; }
.form h3 { margin: 0 0 4px; }
.row { display: flex; gap: 6px; }
.pick { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 4px; align-content: start; }
.pn { display: flex; gap: 7px; align-items: center; background: rgba(255,255,255,.03); border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font-size: 12.5px; text-align: left; }
.pn i { width: 10px; height: 10px; border-radius: 2px; flex: none; }
.pn span { margin-left: auto; }
.pn.on { border-color: var(--accent); background: rgba(255, 212, 59, .08); }
.welcome { margin: auto; max-width: 460px; padding: 20px; font-size: 13px; line-height: 1.6; text-align: center; }
.welcome .big { font-size: 40px; }
code { background: rgba(255,255,255,.08); padding: 1px 4px; border-radius: 3px; }
@media (max-width: 900px) {
  .veil { padding: 0; }
  .win { height: 100dvh; border-radius: 0; }
  .body { grid-template-columns: 1fr; }
  .side { border-right: 0; }
  .side.hideMobile { display: none; }
  .main:has(.welcome) { display: none; }
  .back { display: block; }
  .bar .muted { display: none; }
}
</style>
