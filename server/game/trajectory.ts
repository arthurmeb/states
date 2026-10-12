// Weekly trajectory: samples a nation's indices and logs every decision that changed,
// so players can line up "what we did" against "what happened".
import { POLICY_MAP, BUDGET, LOCAL_POLICIES } from '../../shared/policies'
import { PROJECT_MAP } from '../../shared/projects'
import { STRATEGIES } from '../../shared/rules'
import { SECTORS } from '../../shared/sectors'
import type { LogEntry } from '../../shared/types'
import { HISTORY_KEYS, type Nation } from './model'
import type { Game } from './world'

export const HISTORY_CAP = 520 // ten years of weekly samples
const LOG_CAP = 400
const BUDGET_STEP = 0.3 // percentage points of GDP before a budget line counts as a decision

export interface Tracker {
  pol: Record<string, string | number>
  bud: Record<string, number>
  subs: string[]
  strat: string
  local: Record<number, string>
  done: string[]
  wars: number[]; allies: number[]; blocs: string[]
  provs: number
}

const fmtVal = (id: string, v: string | number) => {
  const def = POLICY_MAP[id]
  if (def?.kind === 'choice') return def.options.find(o => o.id === v)?.label ?? String(v)
  return `${typeof v === 'number' ? Math.round(v * 10) / 10 : v}${def && 'unit' in def && def.unit ? def.unit : ''}`
}
const localLabel = (json: string) => {
  const p = JSON.parse(json) as Record<string, string>
  return LOCAL_POLICIES.map(l => [l, p[l.id]] as const)
}

export function snapshotOf(g: Game, n: Nation): Tracker {
  const owned = g.owned(n.id)
  const local: Record<number, string> = {}, done: string[] = []
  for (const pid of owned) {
    const p = g.prov[pid]
    local[pid] = JSON.stringify(p.policy)
    for (const pr of p.projects) if (pr.done) done.push(`${pid}:${pr.id}`)
  }
  return {
    pol: { ...n.policy }, bud: { ...n.budget } as Record<string, number>, subs: [...n.subsidies], strat: n.brain?.strategy ?? 'player',
    local, done, wars: [...n.wars], allies: [...n.allies], blocs: g.tradeBlocs.filter(b => b.members.includes(n.id)).map(b => b.name), provs: owned.length,
  }
}

export function trackWeek(g: Game, n: Nation) {
  // 1. index samples
  const h = n.history
  h.t.push(g.tick)
  for (const k of HISTORY_KEYS) {
    const v = +(n.idx[k] ?? 0).toPrecision(4), arr = (h.series[k] ??= [])
    while (arr.length < h.t.length - 1) arr.unshift(v) // series added after the world started
    arr.push(v)
  }
  while (h.t.length > HISTORY_CAP) { h.t.shift(); for (const k of HISTORY_KEYS) h.series[k]?.shift() }

  // 2. decision log (diff against the last logged state)
  const cur = snapshotOf(g, n)
  const prev = n.tracker
  n.log ??= []
  if (!prev) { n.tracker = cur; return }
  const add = (kind: LogEntry['kind'], text: string) => n.log.push({ t: g.tick, kind, text })
  const name = (id: number) => g.nations.get(id)?.name ?? 'a fallen state'

  for (const [id, v] of Object.entries(cur.pol)) {
    const was = prev.pol[id]
    if (was === v) continue
    const def = POLICY_MAP[id]
    if (!def) continue
    // sliders drift in small AI steps: log once the change adds up to a full point
    if (typeof v === 'number' && typeof was === 'number' && Math.abs(v - was) < Math.max(1, def.kind === 'slider' ? def.step : 1)) { cur.pol[id] = was; continue }
    add(id === 'government' ? 'gov' : 'policy', `${def.label}: ${fmtVal(id, was ?? '—')} → ${fmtVal(id, v)}`)
  }
  const bud = { ...prev.bud }
  for (const line of BUDGET) {
    const a = prev.bud[line.id] ?? 0, b = cur.bud[line.id] ?? 0
    if (Math.abs(b - a) >= BUDGET_STEP) { add('budget', `${line.label} budget: ${a.toFixed(1)}% → ${b.toFixed(1)}% of GDP`); bud[line.id] = b }
  }
  cur.bud = bud // small drifts accumulate until they cross the step
  const sAdd = cur.subs.filter(s => !prev.subs.includes(s)), sDel = prev.subs.filter(s => !cur.subs.includes(s))
  const sl = (id: string) => SECTORS.find(s => s.id === id)?.label ?? id
  if (sAdd.length || sDel.length) add('policy', `Industrial subsidies: ${[...sAdd.map(s => '+' + sl(s)), ...sDel.map(s => '−' + sl(s))].join(', ')}`)
  if (cur.strat !== prev.strat && cur.strat !== 'player') add('strategy', `National strategy → ${STRATEGIES[cur.strat]?.label ?? cur.strat}`)
  for (const [pid, js] of Object.entries(cur.local)) {
    const was = prev.local[+pid]
    if (!was || was === js) continue
    const a = Object.fromEntries(localLabel(was).map(([l, v]) => [l.id, v])), changes: string[] = []
    for (const [l, v] of localLabel(js)) if (a[l.id] !== v) changes.push(`${l.label}: ${l.options.find(o => o.id === a[l.id])?.label ?? a[l.id]} → ${l.options.find(o => o.id === v)?.label ?? v}`)
    if (changes.length) add('local', `${g.P[+pid].name}: ${changes.join('; ')}`)
  }
  for (const d of cur.done) if (!prev.done.includes(d)) { const [pid, id] = d.split(':'); add('build', `Completed ${PROJECT_MAP[id]?.label ?? id} in ${g.P[+pid].name}`) }
  for (const w of cur.wars) if (!prev.wars.includes(w)) add('war', `War with ${name(w)}`)
  for (const w of prev.wars) if (!cur.wars.includes(w)) add('war', `Peace with ${name(w)}`)
  for (const a of cur.allies) if (!prev.allies.includes(a)) add('diplo', `Alliance with ${name(a)}`)
  for (const b of cur.blocs) if (!prev.blocs.includes(b)) add('diplo', `Joined ${b}`)
  for (const b of prev.blocs) if (!cur.blocs.includes(b)) add('diplo', `Left ${b}`)
  if (cur.provs !== prev.provs) add('territory', `Territory ${cur.provs > prev.provs ? '+' : ''}${cur.provs - prev.provs} provinces (${prev.provs} → ${cur.provs})`)
  if (n.log.length > LOG_CAP) n.log.splice(0, n.log.length - LOG_CAP)
  n.tracker = cur
}
