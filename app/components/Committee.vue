<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { dateOf } from '~~/shared/rules'
import { RES_DEFS, TABLE_COST, QUORUM, type Resolution, type ResKind, type Vote } from '~~/shared/committee'
import { useGame } from '~/composables/useGame'

const { ui, snap, send, me, nations } = useGame()
type Tab = 'open' | 'force' | 'record'
const tab = ref<Tab>('open')
const tabling = ref(false)

const C = computed(() => snap.value?.committee ?? { council: [], list: [], weights: {} })
const tick = computed(() => snap.value?.tick ?? 0)
const lists = computed(() => ({
  open: C.value.list.filter(r => r.status === 'open').reverse(),
  force: C.value.list.filter(r => r.status === 'passed' && r.until != null && r.until > tick.value).reverse(),
  record: C.value.list.filter(r => r.status !== 'open' && !(r.status === 'passed' && r.until != null && r.until > tick.value)).reverse(),
}))
const res = computed(() => C.value.list.find(r => r.id === ui.resolution) ?? null)
watch(() => ui.committee, open => { if (open && ui.resolution == null) ui.resolution = lists.value.open[0]?.id ?? null })
const governing = computed(() => me.value?.power.office === 'governing')
const name = (id: number | null) => (id == null ? '' : nations.value.get(id)?.name ?? 'a fallen state')
const color = (id: number) => nations.value.get(id)?.color ?? '#495057'
const isCouncil = (id: number) => C.value.council.includes(id)

/** Live tally for an open vote (weights move with influence); the recorded one once closed. */
function tallyOf(r: Resolution) {
  if (r.tally) return r.tally
  const t = { yes: 0, no: 0, abstain: 0, total: 0 }
  for (const [id, w] of Object.entries(C.value.weights)) { t.total += w; t[r.votes[+id] ?? 'abstain'] += w }
  return t
}
const pct = (v: number, tot: number) => (tot ? (v / tot) * 100 : 0)
const vetoes = computed(() => (res.value && RES_DEFS[res.value.kind].security ? C.value.council.filter(id => res.value!.votes[id] === 'no') : []))
const roll = computed(() => {
  const r = res.value
  if (!r) return { yes: [], no: [], abstain: [] } as Record<Vote, number[]>
  const out: Record<Vote, number[]> = { yes: [], no: [], abstain: [] }
  for (const id of Object.keys(C.value.weights).map(Number)) out[r.votes[id] ?? 'abstain'].push(id)
  for (const k of Object.keys(out) as Vote[]) out[k].sort((a, b) => (C.value.weights[b] ?? 0) - (C.value.weights[a] ?? 0))
  return out
})
const STATUS: Record<string, string> = { open: 'Voting', passed: 'Adopted', failed: 'Rejected', vetoed: 'Vetoed', ended: 'Expired' }
function statusLine(r: Resolution) {
  if (r.status === 'open') {
    const days = Math.max(0, r.closes - tick.value), mins = ((snap.value?.dayMs ?? 120000) * days) / 60000
    return `Vote closes ${dateOf(r.closes, false)} · ${days} days (~${mins >= 90 ? `${(mins / 60).toFixed(1)} h` : `${Math.ceil(mins)} min`} real time)`
  }
  if (r.status === 'passed' && r.until) return `In force until ${dateOf(r.until, false)}`
  if (r.status === 'vetoed') return `Vetoed by ${r.vetoBy.map(name).join(' and ')}`
  return `Closed ${dateOf(r.closes, false)}`
}
const castVote = (v: Vote) => res.value && send({ t: 'resVote', id: res.value.id, vote: v })
const speech = ref('')
function speak() { if (res.value && speech.value.trim()) { send({ t: 'resSpeak', id: res.value.id, text: speech.value }); speech.value = '' } }
function pick(r: Resolution) { ui.resolution = r.id; tabling.value = false }

// ── tabling form ──
const kind = ref<ResKind>('sanctions')
const target = ref<number | null>(null), target2 = ref<number | null>(null)
const title = ref(''), text = ref(''), rate = ref(10), years = ref(3)
const def = computed(() => RES_DEFS[kind.value])
watch(kind, k => { years.value = RES_DEFS[k].defaultYears; target.value = null; target2.value = null })
const others = computed(() => [...nations.value.values()].sort((a, b) => a.name.localeCompare(b.name)))
const warring = computed(() => others.value.filter(n => n.wars.length))
const enemiesOf = computed(() => (target.value == null ? [] : others.value.filter(n => nations.value.get(target.value!)?.wars.includes(n.id))))
const canTable = computed(() => governing.value && (me.value?.power.pc ?? 0) >= TABLE_COST && (def.value.target === 'none' || target.value != null) && (def.value.target !== 'two' || target2.value != null) && (kind.value !== 'declaration' || text.value.trim().length >= 8))
function submit() {
  send({ t: 'resTable', kind: kind.value, target: target.value, target2: target2.value, title: title.value, text: text.value, rate: rate.value, years: years.value })
  tabling.value = false; title.value = ''; text.value = ''; tab.value = 'open'
  setTimeout(() => { const mine = C.value.list.filter(r => r.by === me.value?.id).at(-1); if (mine) ui.resolution = mine.id }, 400)
}
const voteLabel: Record<Vote, string> = { yes: '✔ Yes', no: '✖ No', abstain: '— Abstain' }
</script>

<template>
  <div v-if="ui.committee" class="veil" @click.self="ui.committee = false">
    <div class="win glass">
      <header class="bar">
        <b>🌐 World Committee</b>
        <span class="muted small">Every nation has a seat · votes weigh by global influence · the council can veto security resolutions</span>
        <button class="x" @click="ui.committee = false">✕</button>
      </header>
      <div class="council">
        <span class="k">Security council</span>
        <button v-for="id in C.council" :key="id" class="seat" @click="ui.inspectNation = id; ui.committee = false"><i :style="{ background: color(id) }" />{{ name(id) }}</button>
        <span v-if="!C.council.length" class="muted small">forming…</span>
      </div>
      <div class="body">
        <aside class="side" :class="{ hideMobile: res || tabling }">
          <div class="tabs">
            <button :class="{ on: tab === 'open' }" @click="tab = 'open'">🗳 Voting<i v-if="lists.open.length" class="dot">{{ lists.open.length }}</i></button>
            <button :class="{ on: tab === 'force' }" @click="tab = 'force'">⚖ In force</button>
            <button :class="{ on: tab === 'record' }" @click="tab = 'record'">📚 Record</button>
          </div>
          <button class="btn block new" :disabled="!me" @click="tabling = true; ui.resolution = null">+ Table a resolution <span class="muted">⚡{{ TABLE_COST }}</span></button>
          <div class="list scroll">
            <div v-if="!lists[tab].length" class="muted small empty">{{ tab === 'open' ? 'Nothing on the floor. Table the first resolution.' : tab === 'force' ? 'No binding resolutions in force.' : 'No votes on record yet.' }}</div>
            <button v-for="r in lists[tab]" :key="r.id" class="card" :class="[{ on: r.id === ui.resolution }, r.status]" @click="pick(r)">
              <span class="ic">{{ RES_DEFS[r.kind].icon }}</span>
              <span class="meta">
                <b class="title">{{ r.title }}</b>
                <span class="sub muted">{{ STATUS[r.status] }} · {{ r.byName }}<template v-if="me && r.status === 'open'"> · {{ r.votes[me.id] ? `you: ${r.votes[me.id]}` : 'not voted' }}</template></span>
                <span class="mini"><i class="y" :style="{ width: pct(tallyOf(r).yes, tallyOf(r).total) + '%' }" /><i class="n" :style="{ width: pct(tallyOf(r).no, tallyOf(r).total) + '%' }" /></span>
              </span>
              <i v-if="me && r.status === 'open' && !r.votes[me.id] && governing" class="pip" />
            </button>
          </div>
        </aside>

        <main class="main scroll">
          <!-- table a resolution -->
          <form v-if="tabling" class="form" @submit.prevent="submit">
            <button type="button" class="back" @click="tabling = false">‹ Back</button>
            <h3>Table a resolution</h3>
            <div class="kinds">
              <button v-for="d in RES_DEFS" :key="d.kind" type="button" class="kind" :class="{ on: kind === d.kind }" @click="kind = d.kind">
                <b>{{ d.icon }} {{ d.label }}</b><span>{{ d.desc }}</span><small v-if="d.security" class="sec">security · vetoable</small>
              </button>
            </div>
            <label v-if="def.target !== 'none'">{{ def.target === 'two' ? 'First warring nation' : 'Target nation' }}
              <select v-model="target" class="field">
                <option :value="null" disabled>Choose…</option>
                <option v-for="n in def.target === 'two' ? warring : others" :key="n.id" :value="n.id">{{ n.name }}{{ n.id === me?.id ? ' (you)' : '' }}</option>
              </select>
            </label>
            <label v-if="def.target === 'two'">Its enemy
              <select v-model="target2" class="field" :disabled="target == null">
                <option :value="null" disabled>Choose…</option>
                <option v-for="n in enemiesOf" :key="n.id" :value="n.id">{{ n.name }}</option>
              </select>
            </label>
            <label v-if="kind === 'tradeRound'">Tariff cap: <b>{{ rate }}%</b><input v-model.number="rate" type="range" min="0" max="30" step="1"></label>
            <label v-if="def.maxYears">Duration: <b>{{ years }} years</b><input v-model.number="years" type="range" min="1" :max="def.maxYears" step="1"></label>
            <input v-model="title" class="field" maxlength="80" :placeholder="kind === 'declaration' ? 'Title: the Pineapple Accords, the Declaration of Lagos…' : 'Title (optional)'">
            <textarea v-model="text" class="field" rows="4" maxlength="600" :placeholder="kind === 'declaration' ? 'The World Committee declares that…' : 'Preamble: why the world should vote yes (optional, shown to every delegate)'" />
            <div class="row">
              <button class="btn primary" :disabled="!canTable">Table it · ⚡{{ TABLE_COST }}</button>
              <span class="muted small">{{ !me ? 'Found a nation first.' : !governing ? 'Only a government can table resolutions.' : (me.power.pc < TABLE_COST ? 'Not enough political capital.' : 'Voting stays open for a month. AI delegates vote on their interests and ideology.') }}</span>
            </div>
          </form>

          <!-- a resolution -->
          <template v-else-if="res">
            <button class="back" @click="ui.resolution = null">‹ Back</button>
            <div class="rhead">
              <span class="big">{{ RES_DEFS[res.kind].icon }}</span>
              <div>
                <h2>{{ res.title }}</h2>
                <div class="muted small">{{ RES_DEFS[res.kind].label }} · sponsored by <b :style="{ color: color(res.by) }">{{ res.byName }}</b><template v-if="res.targetName"> · target <b>{{ res.targetName }}</b></template><template v-if="res.target2Name"> and <b>{{ res.target2Name }}</b></template></div>
              </div>
              <span class="st" :class="res.status">{{ STATUS[res.status] }}</span>
            </div>
            <div class="muted small line">{{ statusLine(res) }}</div>
            <blockquote v-if="res.text">“{{ res.text }}”</blockquote>
            <p class="effect">{{ RES_DEFS[res.kind].desc }}<template v-if="res.kind === 'tradeRound'"> Cap: <b>{{ res.rate }}%</b>.</template><template v-if="res.years"> Duration: <b>{{ res.years }} years</b>.</template></p>

            <div class="tally">
              <div class="bar3">
                <i class="y" :style="{ width: pct(tallyOf(res).yes, tallyOf(res).total) + '%' }" />
                <i class="n" :style="{ width: pct(tallyOf(res).no, tallyOf(res).total) + '%' }" />
                <span class="q" :style="{ left: QUORUM * 100 + '%' }" title="Quorum: yes must carry at least this share of all votes" />
              </div>
              <div class="legend small">
                <span class="good">Yes {{ pct(tallyOf(res).yes, tallyOf(res).total).toFixed(0) }}%</span>
                <span class="bad">No {{ pct(tallyOf(res).no, tallyOf(res).total).toFixed(0) }}%</span>
                <span class="muted">Abstain / silent {{ pct(tallyOf(res).abstain, tallyOf(res).total).toFixed(0) }}%</span>
                <span class="muted">Passes if yes &gt; no and yes ≥ {{ QUORUM * 100 }}%</span>
              </div>
              <div v-if="res.status === 'open' && vetoes.length" class="warn small">⚠ Council member{{ vetoes.length > 1 ? 's' : '' }} {{ vetoes.map(name).join(' and ') }} vote{{ vetoes.length > 1 ? '' : 's' }} no: as things stand, this would be vetoed.</div>
            </div>

            <div v-if="res.status === 'open' && me" class="vote">
              <span class="k">Your vote{{ isCouncil(me.id) ? ' ⭐ (council: a no is a veto)' : '' }}</span>
              <button v-for="v in (['yes', 'no', 'abstain'] as Vote[])" :key="v" class="btn" :class="[v, { on: res.votes[me.id] === v }]" :disabled="!governing" @click="castVote(v)">{{ voteLabel[v] }}</button>
              <span class="muted small">weight {{ (C.weights[me.id] ?? 0).toFixed(0) }}{{ governing ? '' : ' · only governments vote' }}</span>
            </div>

            <div v-if="res.status === 'passed' && RES_DEFS[res.kind].binding === 'parties'" class="small parties">
              <b>Bound by it:</b> {{ res.parties.map(name).join(', ') || 'nobody' }}<template v-if="res.breached.length"> · <span class="bad">broke it: {{ res.breached.map(name).join(', ') }}</span></template>
            </div>

            <div class="cols">
              <section class="roll">
                <h4>Roll call</h4>
                <div v-for="v in (['yes', 'no', 'abstain'] as Vote[])" :key="v" class="grp">
                  <div class="gk" :class="v">{{ voteLabel[v] }} · {{ roll[v].length }}</div>
                  <span v-for="id in roll[v]" :key="id" class="chip" :title="`weight ${C.weights[id]}`"><i :style="{ background: color(id) }" />{{ isCouncil(id) ? '⭐ ' : '' }}{{ name(id) }}</span>
                </div>
              </section>
              <section class="floor">
                <h4>The floor</h4>
                <div v-if="!res.speeches.length" class="muted small">No speeches yet.{{ res.status === 'open' ? ' Make the case.' : '' }}</div>
                <div v-for="(s, i) in res.speeches" :key="i" class="sp">
                  <div class="who"><b :style="{ color: s.color }">{{ s.name }}</b><span v-if="s.user" class="user">@{{ s.user }}</span><span v-if="s.stance" class="stance" :class="s.stance">{{ s.stance }}</span><span class="muted small">{{ dateOf(s.tick, false) }}</span></div>
                  <div class="txt">{{ s.text }}</div>
                </div>
                <form v-if="res.status === 'open' && me" class="compose" @submit.prevent="speak">
                  <input v-model="speech" class="field" maxlength="500" placeholder="Address the floor…">
                  <button class="btn primary" :disabled="!speech.trim()">Speak</button>
                </form>
              </section>
            </div>
          </template>

          <div v-else class="welcome muted">
            <div class="bigic">🌐</div>
            <p>The <b>World Committee</b> is where the planet argues. Any government can table a resolution: sanctions, condemnations, ceasefires, a climate accord, a development fund, a free-trade round, or a declaration of anything at all.</p>
            <p>Votes weigh by <b>global influence</b>: trade, aid and alliances buy you a louder voice. The five most powerful nations sit on the <b>security council</b> and can veto sanctions, condemnations and ceasefires.</p>
            <p class="small">What passes is enforced: sanctions bite, ceasefires end wars, and nations that break an accord they voted for are named and shamed.</p>
          </div>
        </main>
      </div>
    </div>
  </div>
</template>

<style scoped>
.veil { position: fixed; inset: 0; z-index: 45; background: rgba(2, 4, 8, .55); display: grid; place-items: center; padding: 14px; }
.win { width: min(1140px, 100%); height: min(800px, calc(100vh - 28px)); display: flex; flex-direction: column; background: rgba(10, 14, 22, .97); overflow: hidden; }
.bar { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid var(--line); }
.bar .x { margin-left: auto; background: none; border: 0; color: var(--muted); font-size: 18px; }
.small { font-size: 11.5px; }
.k { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
.council { display: flex; gap: 6px; align-items: center; padding: 7px 14px; border-bottom: 1px solid var(--line); flex-wrap: wrap; background: rgba(255, 212, 59, .03); }
.seat { display: flex; gap: 6px; align-items: center; background: rgba(255,255,255,.04); border: 1px solid rgba(255, 212, 59, .3); border-radius: 6px; padding: 3px 8px; font-size: 12px; }
.seat i, .chip i { width: 9px; height: 9px; border-radius: 2px; flex: none; }
.body { flex: 1; display: grid; grid-template-columns: 330px 1fr; min-height: 0; }
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
.card.vetoed, .card.failed { opacity: .75; }
.ic { font-size: 22px; width: 34px; text-align: center; flex: none; }
.meta { display: flex; flex-direction: column; min-width: 0; gap: 3px; flex: 1; }
.title { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mini { display: flex; height: 4px; border-radius: 2px; background: rgba(255,255,255,.08); overflow: hidden; }
.mini i, .bar3 i { display: block; height: 100%; }
.y { background: #51cf66; } .n { background: #ff6b6b; }
.pip { position: absolute; right: 8px; top: 8px; width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
.empty { padding: 10px 6px; line-height: 1.5; }
.main { min-height: 0; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px; }
.back { display: none; align-self: flex-start; background: none; border: 0; color: var(--muted); font-size: 14px; padding: 0; }
.rhead { display: flex; gap: 12px; align-items: flex-start; }
.rhead h2 { margin: 0 0 3px; font-size: 20px; }
.big { font-size: 34px; line-height: 1; }
.st { margin-left: auto; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; padding: 4px 8px; border-radius: 5px; border: 1px solid var(--line-strong); white-space: nowrap; }
.st.open { color: var(--accent); border-color: rgba(255, 212, 59, .5); }
.st.passed { color: #8ce99a; border-color: rgba(81, 207, 102, .5); }
.st.failed, .st.vetoed { color: #ffa8a8; border-color: rgba(255, 107, 107, .5); }
.line { margin-top: -4px; }
blockquote { margin: 0; padding: 8px 12px; border-left: 3px solid var(--accent); background: rgba(255,255,255,.03); font-style: italic; color: #dde2ea; white-space: pre-wrap; }
.effect { margin: 0; font-size: 13px; color: #c9d1dc; line-height: 1.5; }
.tally { display: grid; gap: 5px; }
.bar3 { position: relative; display: flex; height: 14px; border-radius: 4px; background: rgba(255,255,255,.08); overflow: hidden; }
.q { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #fff; opacity: .7; }
.legend { display: flex; gap: 14px; flex-wrap: wrap; }
.good { color: #8ce99a; } .bad { color: #ffa8a8; } .warn { color: #ffe066; }
.vote { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: rgba(255,255,255,.02); }
.vote .k { margin-right: 4px; }
.vote .btn.on.yes { background: rgba(81, 207, 102, .2); border-color: #51cf66; }
.vote .btn.on.no { background: rgba(255, 107, 107, .2); border-color: #ff6b6b; }
.vote .btn.on.abstain { background: rgba(255,255,255,.12); border-color: var(--line-strong); }
.parties { line-height: 1.5; }
.cols { display: grid; grid-template-columns: 1fr 1.3fr; gap: 14px; }
h4 { margin: 4px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.grp { margin-bottom: 8px; display: flex; flex-wrap: wrap; gap: 4px; }
.gk { width: 100%; font-size: 11.5px; font-weight: 700; }
.gk.yes { color: #8ce99a; } .gk.no { color: #ffa8a8; } .gk.abstain { color: var(--muted); }
.chip { display: inline-flex; gap: 5px; align-items: center; font-size: 11.5px; background: rgba(255,255,255,.04); border: 1px solid var(--line); border-radius: 5px; padding: 2px 6px; }
.floor { display: flex; flex-direction: column; gap: 6px; }
.sp { padding: 7px 9px; border-radius: 8px; background: rgba(255,255,255,.03); border: 1px solid var(--line); }
.who { display: flex; gap: 7px; align-items: baseline; flex-wrap: wrap; font-size: 12.5px; }
.user { font-size: 11.5px; color: #a5d8ff; }
.stance { font-size: 10px; font-weight: 800; text-transform: uppercase; padding: 0 4px; border-radius: 3px; }
.stance.yes { color: #8ce99a; background: rgba(81, 207, 102, .12); } .stance.no { color: #ffa8a8; background: rgba(255, 107, 107, .12); } .stance.abstain { color: var(--muted); }
.txt { font-size: 13px; line-height: 1.5; color: #dde2ea; white-space: pre-wrap; word-break: break-word; margin-top: 2px; }
.compose { display: flex; gap: 8px; margin-top: 4px; }
.compose .field { flex: 1; }
.form { display: flex; flex-direction: column; gap: 9px; }
.form h3 { margin: 0; }
.form label { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--muted); }
.kinds { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 6px; }
.kind { display: flex; flex-direction: column; gap: 3px; text-align: left; background: rgba(255,255,255,.03); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; }
.kind span { font-size: 11.5px; color: var(--muted); line-height: 1.4; }
.kind.on { border-color: var(--accent); background: rgba(255, 212, 59, .07); }
.sec { color: #ffc078; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; }
.row { display: flex; gap: 10px; align-items: center; }
.welcome { margin: auto; max-width: 520px; padding: 20px; font-size: 13px; line-height: 1.6; text-align: center; }
.bigic { font-size: 44px; }
@media (max-width: 900px) {
  .veil { padding: 0; }
  .win { height: 100dvh; border-radius: 0; }
  .body { grid-template-columns: 1fr; }
  .side { border-right: 0; }
  .side.hideMobile { display: none; }
  .main:has(.welcome) { display: none; }
  .back { display: block; }
  .bar .muted { display: none; }
  .cols { grid-template-columns: 1fr; }
  .floor { order: -1; }
}
</style>
