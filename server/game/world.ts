import { writeFileSync, existsSync, mkdirSync, renameSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { BattleResult, Battle, ChatMsg, GamesState, MarketState, NationPrivate, NationPublic, News, NewsKind, ProposalKind, Proposal, ProvinceDetail, StateMsg, TradeBloc, CountryData, City, ProvinceStatic, Budget } from '../../shared/types'
import { SECTORS, NS, SECTOR_IDS, type SectorId } from '../../shared/sectors'
import { POLICY_MAP, BUDGET, LOCAL_POLICIES, DEFAULT_LOCAL, BLOCS, type LocalPolicyId, type BlocId } from '../../shared/policies'
import { PROJECT_MAP, type ProjectDef } from '../../shared/projects'
import { claimCost, DAYS_PER_MONTH, PROTECTION_DAYS, TRUCE_DAYS, DEMOCRATIC, dateOf } from '../../shared/rules'
import { loadWorldData, baselineOf, type Baseline } from './data'
import type { Nation, Prov } from './model'
import { HISTORY_KEYS } from './model'
import { computeMods, defaultBudget, defaultPolicy } from './mods'
import { staticFit, initProvinces, provinceEconomy, statelessCtx, nationCtx, NOFF, type Ctx } from './economy'
import { aggregate, nationDay, calibrateNation } from './nation'
import { politicsDay, politicsMonth, unrestDay, blocWeights } from './politics'
import { nationIndices, relativeIndices } from './indices'
import { tradeWeek, influenceOf } from './trade'
import { GameError, launchAttack, resolveBattles } from './military'
import { ISSUES, worldMonth } from './events'
import { setupAINation, aiWeek, aiAccepts, attitude, revealedIdeology, chooseStrategy, applyStrategy } from './ai'
import { AI_SEEDS, NEW_STATE_COLORS, PERSONA } from './seeds'

export { GameError }
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const r2 = (x: number) => Math.round(x * 100) / 100
const SAVE_VERSION = 3

export class Game {
  P: ProvinceStatic[]
  cities: City[]
  countries: Record<string, CountryData>
  private baselines = new Map<string, Baseline>()
  private stateless = new Map<string, Ctx>()
  fit: Float32Array
  bias: Float32Array
  off: Float32Array
  prov: Prov[] = []
  tick = 0
  nations = new Map<number, Nation>()
  nextId = 1
  seq = 1
  battles: Battle[] = []
  results: BattleResult[] = []
  news: News[] = []
  chat: ChatMsg[] = []
  proposals: Proposal[] = []
  players: Record<string, number | null> = {}
  online = new Set<string>()
  prices: number[] = new Array(NS).fill(1)
  demandShare: number[] = new Array(NS).fill(0)
  sell = new Map<number, number[]>()
  market: MarketState = { prices: this.prices, oilShock: [] }
  trade: { ids: number[]; flows: Float64Array } = { ids: [], flows: new Float64Array() }
  influence = new Map<string, number>()
  aid = new Map<string, number>()
  tradeBlocs: TradeBloc[] = []
  games: GamesState = { edition: 1, nextTick: 48 * DAYS_PER_MONTH, host: null, hostCity: null, bidsOpen: false, bids: [], lastHost: null, lastMedals: [] }
  gamesHosted = new Map<number, number>()
  aggressors = new Map<number, number>()
  worldGdppc = 15000
  avgTradablePrice = 1
  ownedDirty = true
  private ownedCache = new Map<number, number[]>()
  private ctxCache = new Map<number, Ctx>()

  constructor(private dataDir: string, publicDir: string) {
    const d = loadWorldData(publicDir)
    this.P = d.P; this.cities = d.cities; this.countries = d.countries
    const n = this.P.length
    this.fit = new Float32Array(n * NS); this.bias = new Float32Array(n * NS).fill(1); this.off = new Float32Array(n * NOFF)
    for (let i = 0; i < n; i++) for (let s = 0; s < NS; s++) this.fit[i * NS + s] = staticFit(this.P[i], s)
    if (!this.load()) this.newWorld()
    this.ensurePersona()
  }

  // ───────────────────────── helpers ─────────────────────────
  base(iso3: string): Baseline {
    let b = this.baselines.get(iso3)
    if (!b) { b = baselineOf(this.countries[iso3]); this.baselines.set(iso3, b) }
    return b
  }
  ctxFor(pid: number): Ctx {
    const o = this.prov[pid].owner
    if (o >= 0) {
      let c = this.ctxCache.get(o)
      if (!c) { c = nationCtx(this, this.nations.get(o)!); this.ctxCache.set(o, c) }
      return c
    }
    const iso = this.P[pid].iso3
    let c = this.stateless.get(iso)
    if (!c) { c = statelessCtx(this.base(iso)); this.stateless.set(iso, c) }
    return c
  }
  nation(id: number | undefined) { return id == null ? undefined : this.nations.get(id) }
  owned(id: number): number[] {
    if (this.ownedDirty) {
      this.ownedCache.clear()
      for (let i = 0; i < this.prov.length; i++) {
        const o = this.prov[i].owner
        if (o < 0) continue
        const l = this.ownedCache.get(o)
        if (l) l.push(i); else this.ownedCache.set(o, [i])
      }
      this.ownedDirty = false
    }
    return this.ownedCache.get(id) ?? []
  }
  gdppc(n: Nation) { return n.pop > 0 ? Math.max(300, (n.gdp * 12e6) / n.pop) : 1000 }
  urbanShare(n: Nation) {
    let u = 0, p = 0
    for (const pid of this.owned(n.id)) { u += this.prov[pid].urban * this.prov[pid].pop; p += this.prov[pid].pop }
    return p ? u / p : 0.5
  }
  nonCoreShare(n: Nation) {
    let nc = 0, p = 0
    for (const pid of this.owned(n.id)) { const pr = this.prov[pid]; p += pr.pop; if (pr.core !== n.id) nc += pr.pop }
    return p ? nc / p : 0
  }
  meanUnrest(id: number) {
    const l = this.owned(id)
    return l.length ? l.reduce((a, pid) => a + this.prov[pid].unrest, 0) / l.length : 0
  }
  provWeighted(id: number) {
    let h = 0, s = 0, ho = 0, p = 0
    for (const pid of this.owned(id)) { const pr = this.prov[pid]; h += pr.happiness * pr.pop; s += pr.safety * pr.pop; ho += pr.housing * pr.pop; p += pr.pop }
    return p ? { happiness: h / p, safety: s / p, housing: ho / p } : { happiness: 5, safety: 50, housing: 50 }
  }
  neighboursOf(id: number) {
    const set = new Set<number>()
    for (const pid of this.owned(id)) for (const q of [...this.P[pid].nb, ...this.P[pid].sea]) {
      const o = this.prov[q].owner
      if (o >= 0 && o !== id) set.add(o)
    }
    return [...set]
  }
  bordering(id: number, target: number) {
    const P = this.P[target]
    const land = P.nb.filter(q => this.prov[q].owner === id)
    const sea = P.sea.filter(q => this.prov[q].owner === id)
    return { land, sea, all: [...land, ...sea] }
  }
  sanctionPressure(id: number) {
    let s = 0, tot = 0
    for (const n of this.nations.values()) { tot += n.gdp; if (n.sanctions.includes(id) || n.embargoes.includes(id)) s += n.gdp }
    return tot ? clamp((s / tot) * 2.5, 0, 1) : 0
  }
  gamesBonus(id: number) { const t = this.gamesHosted.get(id); return t == null ? 0 : Math.max(0, 25 - (this.tick - t) / 72) }
  isBlocLeader(id: number) {
    const n = this.nations.get(id)
    if (!n || n.tradeBloc == null) return false
    const b = this.tradeBlocs.find(x => x.id === n.tradeBloc)
    if (!b) return false
    return b.members.every(m => (this.nations.get(m)?.gdp ?? 0) <= n.gdp)
  }
  flowBetween(a: number, b: number) {
    const { ids, flows } = this.trade
    const i = ids.indexOf(a), j = ids.indexOf(b)
    return i < 0 || j < 0 ? 0 : flows[i * ids.length + j]
  }
  aggressorRecently(id: number) { const t = this.aggressors.get(id); return t != null && this.tick - t < 720 }
  pushNews(kind: NewsKind, text: string, nations?: number[], province?: number) {
    this.news.unshift({ tick: this.tick, kind, text, nations, province })
    if (this.news.length > 150) this.news.length = 150
  }

  // ───────────────────────── world creation ─────────────────────────
  private newProv(pid: number): Prov {
    const P = this.P[pid], b = this.base(P.iso3)
    const cityPop = P.cities.reduce((a, c) => a + this.cities[c].pop, 0)
    const pop = Math.max(5, P.pop)
    const urban = clamp(0.5 * b.urban + 0.55 * clamp(cityPop / pop, 0, 1), 0.04, 0.98)
    const tilt = (v: number, k: number) => clamp(v * (1 + k * (urban - b.urban)), 1, 100)
    return {
      owner: -1, core: -1, pop, urban, lfp: b.lfp, tfp: 1,
      infra: tilt(b.infra, 0.5), edu: tilt(b.hc, 0.3), health: tilt(b.health, 0.25), safety: clamp(88 - b.homicide * 2.2, 5, 95), housing: 55, pollution: b.pollution,
      jobs: new Array(NS).fill(0), output: new Array(NS).fill(0), gdp: 0, unemployment: b.unemployment, happiness: 5, unrest: 5, garrison: 0, occupiedUntil: 0,
      policy: { ...DEFAULT_LOCAL }, projects: [], since: 0,
    }
  }

  private newWorld() {
    console.log('[states] generating world from real-world data…')
    this.prov = this.P.map((_, i) => this.newProv(i))
    initProvinces(this)
    // world demand shares calibrated so today's markets clear at price 1
    let wgdp = 0
    const wq = new Array(NS).fill(0)
    for (const p of this.prov) { wgdp += p.gdp; for (let s = 0; s < NS; s++) wq[s] += p.output[s] }
    this.demandShare = wq.map(q => q / wgdp)
    this.worldGdppc = (wgdp * 12e6) / this.prov.reduce((a, p) => a + p.pop, 0)
    for (const [name, leader, lat, lon, size, color] of AI_SEEDS) {
      const cap = this.nearestFree(lat, lon)
      if (cap < 0) continue
      this.createNation({ name, leader, color, motto: '', ai: true, token: null }, this.growRegion(cap, size))
    }
    this.ownedDirty = true
    this.ctxCache.clear()
    for (let i = 0; i < 6; i++) { this.dailyEconomy(0); tradeWeek(this) }
    this.pushNews('event', `The world map is drawn on ${dateOf(0)}. ${this.nations.size} powers watch the unclaimed lands.`)
    console.log(`[states] world ready: ${this.P.length} provinces, ${this.nations.size} AI nations, world GDP $${(wgdp * 12 / 1000).toFixed(1)}T`)
  }

  /** Spawn Claude's rival nation once per world (also into existing saves). */
  private ensurePersona() {
    if ([...this.nations.values()].some(n => n.brain?.persona === PERSONA.id)) return
    const cap = this.nearestFree(PERSONA.lat, PERSONA.lon)
    if (cap < 0) return
    const n = this.createNation({ name: PERSONA.name, leader: PERSONA.leader, color: PERSONA.color, motto: PERSONA.motto, ai: true, token: null }, this.growRegion(cap, PERSONA.size))
    const B = n.brain!
    Object.assign(B, { persona: PERSONA.id, locked: PERSONA.strategy, strategy: PERSONA.strategy, aggression: PERSONA.aggression, ambition: PERSONA.ambition, ideology: { ...PERSONA.ideology } })
    Object.assign(n.policy, PERSONA.policy)
    for (const [k, v] of Object.entries(PERSONA.budget)) n.budget[k as keyof typeof n.budget] = v
    applyStrategy(n)
    n.mods = computeMods(n.policy)
    Object.assign(this.prov[n.capital].policy, PERSONA.capital)
    this.ownedDirty = true; this.ctxCache.clear()
    this.pushNews('found', `🧭 ${n.name} is founded on the Strait of Malacca. ${n.leader}: “${n.motto}”`, [n.id])
    this.save()
  }

  private nearestFree(lat: number, lon: number) {
    let best = -1, bd = Infinity
    for (const p of this.P) {
      if (this.prov[p.id].owner !== -1 || p.terrain === 'ice') continue
      const d = (p.lat - lat) ** 2 + ((p.lon - lon) * Math.cos((lat * Math.PI) / 180)) ** 2
      if (d < bd) { bd = d; best = p.id }
    }
    return best
  }
  private growRegion(cap: number, size: number) {
    const region = [cap], seen = new Set(region)
    for (let i = 0; i < region.length && region.length < size; i++) {
      for (const nb of this.P[region[i]].nb) {
        if (region.length >= size) break
        if (seen.has(nb) || this.prov[nb].owner !== -1 || this.P[nb].terrain === 'ice') continue
        seen.add(nb); region.push(nb)
      }
    }
    return region
  }

  createNation(o: { name: string; leader: string; color: string; motto: string; ai: boolean; token: string | null }, region: number[]): Nation {
    const id = this.nextId++
    const capIso = this.P[region[0]].iso3
    // pop-weighted real-world baseline of the territory
    let pop = 0
    const acc: Record<string, number> = {}
    const keys = ['tech', 'inst', 'corruption', 'renewables', 'fertility', 'lifeExp', 'internet', 'gini', 'homicide', 'gdppc', 'milSpend', 'debt', 'unemployment', 'inflation', 'voice', 'taxRev', 'co2'] as const
    let troops = 0
    for (const pid of region) {
      const w = this.prov[pid].pop, b = this.base(this.P[pid].iso3)
      pop += w
      for (const k of keys) acc[k] = (acc[k] ?? 0) + (b[k] as number) * w
      troops += b.armedForces * (w / Math.max(1, b.population))
    }
    for (const k of keys) acc[k] /= Math.max(1, pop)
    const b0 = this.base(capIso)
    const n: Nation = {
      id, name: o.name, leader: o.leader, motto: o.motto, color: o.color, ai: o.ai, token: o.token,
      capital: region[0], founded: this.tick, alive: true, iso3: capIso,
      policy: defaultPolicy(), budget: defaultBudget(), subsidies: [], cooldowns: {},
      treasury: 0,
      stocks: {
        hc: 50, health: 50, infra: 50, tech: acc.tech, inst: acc.inst, corruption: acc.corruption, cohesion: 62,
        culture: 15, sports: 15, brand: 15, diplomacy: 15, milTech: clamp(acc.milSpend * 12 + acc.tech * 0.4, 5, 90),
        navy: 0, air: 0, renewables: acc.renewables, pollution: 30, fertility: acc.fertility,
      },
      stockOff: {}, ref: {}, baseU: clamp(acc.unemployment, 0.02, 0.3), baseRenewables: acc.renewables,
      inflation: clamp(acc.inflation, 0, 40), interest: 4, unemployment: clamp(acc.unemployment, 0.02, 0.3),
      blocs: Object.fromEntries(BLOCS.map(b => [b.id, 55])) as Record<BlocId, number>,
      blocWeights: Object.fromEntries(BLOCS.map(b => [b.id, 1 / BLOCS.length])) as Record<BlocId, number>,
      stability: 62, legitimacy: 55, reserve: 0, manpower: 0, manpowerCap: 0, quality: 1, warWeariness: 0,
      wars: [], allies: [], pacts: [], truces: {}, embargoes: [], sanctions: [], tariffs: {}, blockades: [], aidTargets: [], tradeBloc: null,
      protectedUntil: o.ai ? 0 : this.tick + PROTECTION_DAYS, nextElection: null,
      idx: {}, history: { t: [], series: {} }, gdpMonthly: [],
      ledger: { revenue: {}, spending: {}, net: 0 }, mods: {}, brain: null, issue: null, nextIssue: this.tick + 20,
      gdp: 0, gdpReal: 0, pop: 0, provinces: 0, troops: 0, casualties: 0, sectorOut: new Array(NS).fill(0), sectorJobs: new Array(NS).fill(0),
      exports: new Array(NS).fill(0), imports: new Array(NS).fill(0), aidReceived: 0, tariffRevenue: 0, shortage: 0, projectNational: {},
    }
    this.nations.set(id, n)
    for (const pid of region) {
      const p = this.prov[pid]
      p.owner = id; p.core = id; p.since = this.tick; p.unrest = 5
    }
    this.ownedDirty = true
    this.ctxCache.delete(id)
    if (o.ai) setupAINation(this, n, b0)
    n.mods = computeMods(n.policy)
    aggregate(this, n)
    if (n.brain) { n.brain.strategy = n.brain.locked ?? chooseStrategy(this, n); applyStrategy(n); n.mods = computeMods(n.policy) }
    const annual = n.gdp * 12
    n.treasury = o.ai ? -(acc.debt / 100) * annual : n.gdp * 3
    n.reserve = o.ai ? clamp(troops || pop * 0.003, pop * 0.0005, pop * 0.02) : Math.max(5, pop * 0.0015)
    n.manpower = pop * 0.002
    n.stocks.navy = (o.ai ? annual * acc.milSpend / 100 * 2.5 : annual * 0.004) * 0.3
    n.stocks.air = (o.ai ? annual * acc.milSpend / 100 * 2.5 : annual * 0.004) * 0.35
    n.stocks.culture = clamp(5 + Math.log10(annual + 1) * 8 + (b0.shares.tourismGdp * 200), 5, 60)
    n.stocks.brand = clamp(b0.shares.hightech * 80 + n.stocks.inst * 0.3, 5, 70)
    n.stocks.diplomacy = clamp(10 + Math.log10(annual + 1) * 6, 5, 50)
    n.stocks.sports = clamp(10 + Math.log10(pop / 1000 + 1) * 15 + Math.log10(acc.gdppc) * 5, 5, 60)
    for (const pid of region) this.prov[pid].garrison = n.reserve * 0.5 / region.length
    n.reserve *= 0.5
    this.ctxCache.delete(id)
    n.blocWeights = blocWeights(this, n)
    calibrateNation(this, n)
    politicsDay(this, n, 0)
    nationIndices(this, n)
    // index offsets so founding values match the territory's real data
    // real-world governance heritage: freedom ≈ WGI voice, press ≈ 0.95 × voice, democracy ≈ voice / 10
    const want: Record<string, number> = { lifeExp: acc.lifeExp, internet: acc.internet, gini: acc.gini, freedom: acc.voice, press: acc.voice * 0.95 }
    for (const [k, v] of Object.entries(want)) n.stockOff[k] = v - (n.idx[k] ?? v)
    nationIndices(this, n)
    n.stockOff.democracy = acc.voice / 10.5 - (n.idx.democracy ?? 5)
    n.ref = { growth: this.countries[capIso]?.data.gdp_growth ?? 2, homicide: acc.homicide, safety: n.idx.safety ?? 50, co2: acc.co2, gdppc: this.gdppc(n), renewables: acc.renewables }
    nationIndices(this, n)
    return n
  }

  // ───────────────────────── persistence ─────────────────────────
  get savePath() { return join(this.dataDir, 'world-v2.json') }
  save() {
    mkdirSync(this.dataDir, { recursive: true })
    const data = {
      v: SAVE_VERSION, tick: this.tick, nextId: this.nextId, seq: this.seq,
      prov: this.prov.map(p => ({ ...p, jobs: p.jobs.map(r2), output: p.output.map(x => +x.toPrecision(4)) })),
      bias: Array.from(this.bias, r2), off: Array.from(this.off, r2),
      nations: [...this.nations.values()], battles: this.battles, news: this.news, chat: this.chat, proposals: this.proposals,
      players: this.players, prices: this.prices, demandShare: this.demandShare, sell: [...this.sell], tradeBlocs: this.tradeBlocs,
      games: this.games, gamesHosted: [...this.gamesHosted], aggressors: [...this.aggressors], worldGdppc: this.worldGdppc,
    }
    writeFileSync(this.savePath + '.tmp', JSON.stringify(data))
    renameSync(this.savePath + '.tmp', this.savePath)
  }
  private load() {
    if (!existsSync(this.savePath)) return false
    try {
      const d = JSON.parse(readFileSync(this.savePath, 'utf8'))
      if (d.v !== SAVE_VERSION || d.prov.length !== this.P.length) return false
      this.tick = d.tick; this.nextId = d.nextId; this.seq = d.seq
      this.prov = d.prov
      this.bias = Float32Array.from(d.bias); this.off = Float32Array.from(d.off)
      for (const n of d.nations as Nation[]) { n.ref ??= {}; n.stockOff ??= {}; n.projectNational ??= {}; this.nations.set(n.id, n) }
      Object.assign(this, { battles: d.battles, news: d.news, chat: d.chat, proposals: d.proposals, players: d.players, demandShare: d.demandShare, tradeBlocs: d.tradeBlocs, games: d.games, worldGdppc: d.worldGdppc })
      this.prices.splice(0, NS, ...d.prices)
      this.sell = new Map(d.sell); this.gamesHosted = new Map(d.gamesHosted); this.aggressors = new Map(d.aggressors)
      this.ownedDirty = true
      tradeWeek(this)
      console.log(`[states] loaded world at ${dateOf(this.tick)} with ${this.nations.size} nations`)
      return true
    } catch (e) {
      console.error('[states] failed to load save, starting fresh', e)
      return false
    }
  }

  // ───────────────────────── the daily tick ─────────────────────────
  private dailyEconomy(dt: number) {
    this.ctxCache.clear()
    for (const n of this.nations.values()) n.mods = computeMods(n.policy)
    const revolts: number[] = []
    for (let pid = 0; pid < this.P.length; pid++) {
      const ctx = this.ctxFor(pid)
      provinceEconomy(this, pid, ctx, dt)
      if (dt > 0 && unrestDay(this, pid, dt)) revolts.push(pid)
      if (dt > 0) this.progressProjects(pid, dt)
    }
    for (const n of this.nations.values()) {
      if (!n.alive) continue
      aggregate(this, n)
      n.troops = n.reserve + this.owned(n.id).reduce((a, p) => a + this.prov[p].garrison, 0)
      nationDay(this, n, dt); politicsDay(this, n, dt)
      nationIndices(this, n)
    }
    relativeIndices(this)
    if (revolts.length) this.handleRevolts(revolts)
  }

  step() {
    this.tick++
    const dt = 1 / DAYS_PER_MONTH
    for (const n of this.nations.values()) n.casualties = 0
    resolveBattles(this)
    this.dailyEconomy(dt)
    if (this.tick % 7 === 0) {
      tradeWeek(this)
      let wg = 0, wp = 0
      for (const p of this.prov) { wg += p.gdp; wp += p.pop }
      this.worldGdppc = (wg * 12e6) / wp
      const oilShock = new Set<string>()
      for (const P of this.P) if (P.strait && this.prov[P.id].owner >= 0 && this.nations.get(this.prov[P.id].owner)!.wars.length) oilShock.add(P.strait)
      this.market.oilShock = [...oilShock]
    }
    for (const n of [...this.nations.values()]) if (n.alive && n.ai && (this.tick + n.id) % 7 === 0) aiWeek(this, n)
    this.diplomacyQueue()
    if (this.tick % DAYS_PER_MONTH === 0) this.monthly()
  }

  private monthly() {
    for (const n of [...this.nations.values()]) {
      if (!n.alive) continue
      n.gdpMonthly.push(n.gdpReal || n.gdp)
      if (n.gdpMonthly.length > 25) n.gdpMonthly.shift()
      const h = n.history
      h.t.push(this.tick)
      for (const k of HISTORY_KEYS) (h.series[k] ??= []).push(+(n.idx[k] ?? 0).toPrecision(4))
      if (h.t.length > 240) { h.t.shift(); for (const k of HISTORY_KEYS) h.series[k]?.shift() }
      politicsMonth(this, n)
      if (!n.ai) this.issueTick(n)
      // long-held provinces become heartland
      for (const pid of this.owned(n.id)) { const p = this.prov[pid]; if (p.core !== n.id && this.tick - (p.since ?? 0) > 360 * 15 && p.unrest < 30) p.core = n.id }
    }
    worldMonth(this)
    this.spawnNewStates()
    this.save()
  }

  private issueTick(n: Nation) {
    if (n.issue && n.issue.expires <= this.tick) { n.stability = Math.max(0, n.stability - 3); n.issue = null; n.nextIssue = this.tick + 60 }
    if (!n.issue && this.tick >= n.nextIssue) {
      const pool = ISSUES.filter(t => !t.when || t.when(n, this))
      const tpl = pool[Math.floor(Math.random() * pool.length)]
      if (tpl) n.issue = { key: tpl.key, id: `${tpl.key}-${this.tick}`, title: tpl.title, text: tpl.text(n, this), options: tpl.options.map(o => ({ label: o.label, desc: o.desc })), expires: this.tick + 90 }
    }
  }

  private progressProjects(pid: number, dt: number) {
    const p = this.prov[pid]
    for (const pr of p.projects) {
      if (pr.done) continue
      pr.progress += dt
      const def = PROJECT_MAP[pr.id]
      if (def && pr.progress >= def.months) {
        pr.done = true
        const n = p.owner >= 0 ? this.nations.get(p.owner) : undefined
        if (n && (!n.ai || def.cost >= 6)) this.pushNews('build', `${def.icon} ${n.name} completes the ${def.label.toLowerCase()} in ${this.P[pid].name}.`, [n.id], pid)
      }
    }
  }

  private handleRevolts(pids: number[]) {
    const byOwner = new Map<number, number[]>()
    for (const pid of pids) { const o = this.prov[pid].owner; (byOwner.get(o) ?? byOwner.set(o, []).get(o)!).push(pid) }
    for (const [owner, list] of byOwner) {
      const n = this.nations.get(owner)
      if (!n) continue
      const pid = list[0]
      const p = this.prov[pid]
      const coreNation = p.core >= 0 && p.core !== owner ? this.nations.get(p.core) : undefined
      // irredentism: return to the homeland if it still exists, otherwise a new state is born
      const rebels = [pid, ...this.P[pid].nb.filter(q => this.prov[q].owner === owner && this.prov[q].unrest > 70 && q !== n.capital)].slice(0, 4)
      if (coreNation && !coreNation.wars.includes(owner)) {
        for (const q of rebels) { this.prov[q].owner = coreNation.id; this.prov[q].unrest = 25; this.prov[q].garrison = 0 }
        this.pushNews('revolt', `🔥 ${this.P[pid].name} rises up against ${n.name} and rejoins ${coreNation.name}.`, [n.id, coreNation.id], pid)
      } else {
        for (const q of rebels) { this.prov[q].owner = -1; this.prov[q].garrison = 0 }
        const name = this.newStateName(pid)
        const s = this.createNation({ name, leader: 'Provisional Council', color: NEW_STATE_COLORS[this.nextId % NEW_STATE_COLORS.length], motto: 'Freedom', ai: true, token: null }, rebels)
        s.wars = []
        this.pushNews('revolt', `🔥 ${this.P[pid].name} revolts against ${n.name}: the ${name} declares independence!`, [n.id, s.id], pid)
      }
      this.ownedDirty = true
      if (!this.owned(n.id).length) this.fall(n, `${n.name} collapses as its last provinces break away.`)
    }
  }
  private newStateName(pid: number) {
    const P = this.P[pid]
    const forms = ['Republic of', 'Free State of', 'Federation of', 'Commonwealth of', 'Democratic Republic of']
    let name = `${forms[pid % forms.length]} ${P.name}`
    let i = 2
    while ([...this.nations.values()].some(n => n.name === name)) name = `${forms[(pid + i) % forms.length]} ${P.name} ${i++}`
    return name
  }

  /** Occasionally a new state forms in large stateless lands. */
  private spawnNewStates() {
    if (Math.random() > 0.08) return
    const free = this.P.filter(P => this.prov[P.id].owner === -1 && P.terrain !== 'ice' && this.prov[P.id].pop > 3000 && P.nb.every(q => this.prov[q].owner === -1))
    if (!free.length) return
    const P = free.sort((a, b) => this.prov[b.id].pop - this.prov[a.id].pop)[Math.floor(Math.random() * Math.min(10, free.length))]
    const name = this.newStateName(P.id)
    const n = this.createNation({ name, leader: 'Founding President', color: NEW_STATE_COLORS[this.nextId % NEW_STATE_COLORS.length], motto: '', ai: true, token: null }, this.growRegion(P.id, 3 + Math.floor(Math.random() * 3)))
    this.pushNews('found', `🏳 A new state is born: the ${n.name}.`, [n.id], P.id)
  }

  // ───────────────────────── downfall ─────────────────────────
  fall(n: Nation, text: string) {
    if (!n.alive) return
    n.alive = false
    for (const p of this.prov) if (p.owner === n.id) { p.owner = -1; p.garrison = 0; p.unrest = 10 }
    for (const o of this.nations.values()) {
      o.wars = o.wars.filter(x => x !== n.id); o.allies = o.allies.filter(x => x !== n.id); o.pacts = o.pacts.filter(x => x !== n.id)
      o.embargoes = o.embargoes.filter(x => x !== n.id); o.sanctions = o.sanctions.filter(x => x !== n.id); o.aidTargets = o.aidTargets.filter(x => x !== n.id)
      o.blockades = o.blockades.filter(x => x !== n.id); delete o.tariffs[n.id]
    }
    for (const b of this.tradeBlocs) b.members = b.members.filter(m => m !== n.id)
    this.tradeBlocs = this.tradeBlocs.filter(b => b.members.length > 1)
    this.battles = this.battles.filter(b => b.attacker !== n.id && b.defender !== n.id)
    this.proposals = this.proposals.filter(p => p.from !== n.id && p.to !== n.id)
    if (n.token) this.players[n.token] = null
    this.nations.delete(n.id)
    this.ownedDirty = true
    this.pushNews('fall', `☠ ${text}`, [n.id])
  }
  loseProvince(def: Nation, pid: number) {
    if (pid !== def.capital) return
    const rest = this.owned(def.id).filter(q => q !== pid)
    if (!rest.length) return
    def.capital = rest.reduce((a, b) => (this.prov[a].pop >= this.prov[b].pop ? a : b))
    def.stability = Math.max(0, def.stability - 15)
    this.pushNews('capture', `${def.name}'s capital has fallen! The government flees to ${this.P[def.capital].name}.`, [def.id])
  }

  // ───────────────────────── player actions ─────────────────────────
  playerNation(token: string) { const id = this.players[token]; return id != null ? this.nations.get(id) : undefined }

  found(token: string, province: number, name: string, leader: string, color: string, motto: string) {
    if (this.playerNation(token)) throw new GameError('You already lead a nation.')
    const P = this.P[province]
    if (!P) throw new GameError('Invalid province.')
    if (this.prov[province].owner !== -1) throw new GameError('That land is already claimed.')
    if (P.terrain === 'ice') throw new GameError('Nobody can found a nation on an ice sheet.')
    name = name.trim().slice(0, 40); leader = leader.trim().slice(0, 40); motto = motto.trim().slice(0, 80)
    if (name.length < 3) throw new GameError('Your nation needs a name (3+ characters).')
    if ([...this.nations.values()].some(n => n.name.toLowerCase() === name.toLowerCase())) throw new GameError('A nation with that name already exists.')
    if (!/^#[0-9a-f]{6}$/i.test(color)) color = '#4dabf7'
    const region = [province, ...P.nb.filter(q => this.prov[q].owner === -1 && this.P[q].terrain !== 'ice')]
    const n = this.createNation({ name, leader: leader || 'The People', color, motto, ai: false, token }, region)
    this.players[token] = n.id
    this.pushNews('found', `🏳 ${n.name} declares independence in ${P.name}${motto ? ` — “${motto}”` : ''}.`, [n.id], province)
    return n
  }
  abandon(n: Nation) { this.fall(n, `${n.name} has been dissolved by its own government.`) }

  setPolicy(n: Nation, id: string, value: string | number) {
    const def = POLICY_MAP[id]
    if (!def) throw new GameError('Unknown policy.')
    if ((n.cooldowns[id] ?? 0) > this.tick) throw new GameError(`${def.label} can be changed again in ${Math.ceil((n.cooldowns[id] - this.tick) / DAYS_PER_MONTH)} months.`)
    if (def.kind === 'slider') {
      n.policy[id] = clamp(Math.round((+value || 0) / def.step) * def.step, def.min, def.max)
    } else {
      if (!def.options.some(o => o.id === value)) throw new GameError('Invalid option.')
      if (n.policy[id] === value) return
      n.policy[id] = value
      if (def.cooldown) n.cooldowns[id] = this.tick + def.cooldown * DAYS_PER_MONTH
      if (id === 'government') {
        n.stability = Math.max(0, n.stability - 12)
        this.pushNews('event', `🏛 ${n.name} adopts a new constitution: ${def.options.find(o => o.id === value)?.label}.`, [n.id])
        if (!DEMOCRATIC.has(String(value))) n.nextElection = null
      }
    }
    n.mods = computeMods(n.policy)
  }
  setBudget(n: Nation, budget: Budget) {
    for (const line of BUDGET) if (budget[line.id] != null) n.budget[line.id] = clamp(+budget[line.id] || 0, 0, line.max)
  }
  setSubsidies(n: Nation, sectors: SectorId[]) { n.subsidies = sectors.filter(s => SECTOR_IDS.includes(s)).slice(0, 3) }
  setLocal(n: Nation, pid: number, id: LocalPolicyId, value: string) {
    if (this.prov[pid]?.owner !== n.id) throw new GameError('Not your province.')
    const def = LOCAL_POLICIES.find(l => l.id === id)
    if (!def || !def.options.some(o => o.id === value)) throw new GameError('Invalid local policy.')
    this.prov[pid].policy[id] = value
  }

  projectCost(pid: number, def: ProjectDef) {
    const ctx = this.ctxFor(pid)
    return +(def.cost * clamp(0.35 + ctx.gdppc / 50000, 0.35, 1.6)).toFixed(1)
  }
  canBuild(n: Nation, pid: number, id: string): string | null {
    const def = PROJECT_MAP[id], P = this.P[pid], p = this.prov[pid]
    if (!def) return 'Unknown project.'
    if (p.owner !== n.id) return 'Not your province.'
    if (p.projects.some(x => x.id === id)) return 'Already built here.'
    if (p.projects.filter(x => !x.done).length >= 2) return 'Two projects are already under construction here.'
    if (def.max && this.owned(n.id).some(q => this.prov[q].projects.some(x => x.id === id))) return 'Only one per nation.'
    const r = def.req ?? {}
    if (r.coastal && !P.coastal) return 'Requires a coastline.'
    if (r.oil && !P.oil) return 'Requires oil deposits.'
    if (r.metals && !P.metals) return 'Requires metal deposits.'
    if (r.fertility && !P.fertility) return 'Requires fertile land.'
    if (r.attraction && P.attraction < r.attraction) return 'Requires a natural or cultural attraction.'
    if (r.hc && p.edu < r.hc) return `Requires local education ≥ ${r.hc}.`
    if (r.tech && n.stocks.tech < r.tech) return `Requires national technology ≥ ${r.tech}.`
    if (r.inst && n.stocks.inst < r.inst) return `Requires institutions ≥ ${r.inst}.`
    return null
  }
  build(n: Nation, pid: number, id: string) {
    const err = this.canBuild(n, pid, id)
    if (err) throw new GameError(err)
    const def = PROJECT_MAP[id]
    const cost = this.projectCost(pid, def)
    if (n.treasury - cost < -n.gdp * 12 * 1.5) throw new GameError(`Your creditors refuse to finance a $${cost}B project.`)
    n.treasury -= cost
    this.prov[pid].projects.push({ id, progress: 0, done: false })
    return cost
  }

  claim(n: Nation, pid: number) {
    const P = this.P[pid], p = this.prov[pid]
    if (!P || p.owner !== -1) throw new GameError('That land is not unclaimed.')
    if (P.terrain === 'ice') throw new GameError('The ice sheet cannot be settled.')
    if (!this.bordering(n.id, pid).all.length) throw new GameError('You can only annex land bordering your nation (by land or short sea crossing).')
    const cost = claimCost(n.provinces, p.pop)
    if (n.treasury < cost) throw new GameError(`Annexing ${P.name} costs $${cost}B. Treasury: $${n.treasury.toFixed(1)}B.`)
    n.treasury -= cost
    p.owner = n.id; p.garrison = 0.5; p.unrest = 20; p.since = this.tick
    p.core = P.iso3 === n.iso3 ? n.id : -1
    this.ownedDirty = true
    return cost
  }
  deploy(n: Nation, pid: number, amount: number) {
    if (this.prov[pid].owner !== n.id) throw new GameError('You can only garrison your own provinces.')
    amount = +amount || 0
    if (amount > 0) amount = Math.min(amount, n.reserve)
    else amount = -Math.min(-amount, this.prov[pid].garrison)
    n.reserve -= amount; this.prov[pid].garrison += amount
  }
  autodeploy(n: Nation, keep = 0.25) {
    const mine = this.owned(n.id)
    const weights = mine.map(pid => {
      let w = 0.2
      for (const q of [...this.P[pid].nb, ...this.P[pid].sea]) {
        const o = this.prov[q].owner
        if (o === -1 || o === n.id) continue
        w = Math.max(w, n.wars.includes(o) ? 4 : n.allies.includes(o) ? 0.3 : 1)
      }
      if (pid === n.capital) w += 0.5
      if (this.prov[pid].unrest > 50) w += 1
      return w
    })
    const total = weights.reduce((a, b) => a + b, 0)
    const send = n.reserve * (1 - keep)
    mine.forEach((pid, i) => { this.prov[pid].garrison += (send * weights[i]) / total })
    n.reserve -= send
  }
  attack(n: Nation, target: number, amount: number) { launchAttack(this, n, target, amount) }

  declareWar(a: Nation, b: Nation, joined = false) {
    if (a.id === b.id || a.wars.includes(b.id)) return
    if (!joined) {
      if (a.allies.includes(b.id)) throw new GameError(`${b.name} is your ally. Break the alliance first.`)
      if ((a.truces[b.id] ?? 0) > this.tick) throw new GameError(`A truce with ${b.name} holds until ${dateOf(a.truces[b.id], false)}.`)
      if (b.protectedUntil > this.tick) throw new GameError(`${b.name} is under international protection until ${dateOf(b.protectedUntil, false)}.`)
      this.aggressors.set(a.id, this.tick)
    }
    a.protectedUntil = 0
    a.wars.push(b.id); b.wars.push(a.id)
    a.allies = a.allies.filter(x => x !== b.id); b.allies = b.allies.filter(x => x !== a.id)
    a.pacts = a.pacts.filter(x => x !== b.id); b.pacts = b.pacts.filter(x => x !== a.id)
    if (b.brain) b.brain.grievances[a.id] = (b.brain.grievances[a.id] ?? 0) + 40
    this.proposals = this.proposals.filter(p => !((p.from === a.id && p.to === b.id) || (p.from === b.id && p.to === a.id)) || p.kind === 'peace')
    this.pushNews('war', joined ? `${a.name} honours its alliance and enters the war against ${b.name}.` : `⚔ ${a.name} declares war on ${b.name}!`, [a.id, b.id], b.capital)
    if (!joined) for (const allyId of [...b.allies]) {
      const ally = this.nations.get(allyId)
      if (ally && ally.id !== a.id && !ally.allies.includes(a.id)) this.declareWar(ally, a, true)
    }
  }
  makePeace(a: Nation, b: Nation) {
    a.wars = a.wars.filter(x => x !== b.id); b.wars = b.wars.filter(x => x !== a.id)
    a.blockades = a.blockades.filter(x => x !== b.id); b.blockades = b.blockades.filter(x => x !== a.id)
    a.truces[b.id] = this.tick + TRUCE_DAYS; b.truces[a.id] = this.tick + TRUCE_DAYS
    for (const bt of this.battles) if ((bt.attacker === a.id && bt.defender === b.id) || (bt.attacker === b.id && bt.defender === a.id)) { const n = this.nations.get(bt.attacker); if (n) n.reserve += bt.troops; bt.troops = 0 }
    this.battles = this.battles.filter(bt => bt.troops > 0)
    this.pushNews('peace', `🕊 ${a.name} and ${b.name} sign a peace treaty.`, [a.id, b.id])
  }
  propose(n: Nation, target: Nation, kind: ProposalKind, bloc?: number) {
    if (n.id === target.id) throw new GameError('You cannot negotiate with yourself.')
    if (kind === 'peace' && !n.wars.includes(target.id)) throw new GameError('You are not at war with them.')
    if (kind !== 'peace' && n.wars.includes(target.id)) throw new GameError('Make peace first.')
    if (kind === 'alliance' && n.allies.includes(target.id)) throw new GameError('Already allied.')
    if (kind === 'pact' && n.pacts.includes(target.id)) throw new GameError('A trade pact already exists.')
    if (kind === 'bloc' && target.tradeBloc != null) throw new GameError(`${target.name} already belongs to a trade bloc.`)
    if (this.proposals.some(p => p.from === n.id && p.to === target.id && p.kind === kind)) throw new GameError('Proposal already pending.')
    this.proposals.push({ id: this.seq++, from: n.id, to: target.id, kind, tick: this.tick, bloc })
  }
  proposeOrEnact(n: Nation, o: Nation, kind: ProposalKind, bloc?: number) {
    try {
      if (o.ai) { if (aiAccepts(this, o, n, kind)) this.enact(n, o, kind, bloc) }
      else this.propose(n, o, kind, bloc)
    } catch (e) { if (!(e instanceof GameError)) throw e }
  }
  respond(n: Nation, proposalId: number, accept: boolean) {
    const p = this.proposals.find(x => x.id === proposalId && x.to === n.id)
    if (!p) throw new GameError('That proposal is no longer on the table.')
    this.proposals = this.proposals.filter(x => x !== p)
    const from = this.nations.get(p.from)
    if (from && accept) this.enact(from, n, p.kind, p.bloc)
  }
  enact(a: Nation, b: Nation, kind: ProposalKind, blocId?: number) {
    if (kind === 'peace') { if (a.wars.includes(b.id)) this.makePeace(a, b); return }
    if (a.wars.includes(b.id)) return
    if (kind === 'alliance') {
      if (a.allies.includes(b.id)) return
      a.allies.push(b.id); b.allies.push(a.id)
      this.pushNews('diplo', `🤝 ${a.name} and ${b.name} form a military alliance.`, [a.id, b.id])
    } else if (kind === 'pact') {
      if (a.pacts.includes(b.id)) return
      a.pacts.push(b.id); b.pacts.push(a.id)
      this.pushNews('diplo', `${a.name} and ${b.name} sign a trade pact.`, [a.id, b.id])
    } else if (kind === 'bloc') {
      const bloc = this.tradeBlocs.find(x => x.id === (blocId ?? a.tradeBloc))
      if (!bloc || b.tradeBloc != null) return
      bloc.members.push(b.id); b.tradeBloc = bloc.id
      this.pushNews('trade', `${b.name} joins the ${bloc.name}.`, [a.id, b.id])
    }
  }
  private diplomacyQueue() {
    this.proposals = this.proposals.filter(p => this.tick - p.tick < 90 && this.nations.has(p.from) && this.nations.has(p.to))
    for (const p of [...this.proposals]) {
      const to = this.nations.get(p.to)!, from = this.nations.get(p.from)!
      if (!to.ai) continue
      this.proposals = this.proposals.filter(x => x !== p)
      if (aiAccepts(this, to, from, p.kind)) this.enact(from, to, p.kind, p.bloc)
      else if (!from.ai) this.pushNews('diplo', `${to.name} rejects ${from.name}'s ${p.kind === 'pact' ? 'trade pact' : p.kind === 'bloc' ? 'trade bloc invitation' : p.kind} proposal.`, [to.id, from.id])
    }
  }
  cancel(n: Nation, other: Nation, kind: 'alliance' | 'pact') {
    if (kind === 'alliance') { n.allies = n.allies.filter(x => x !== other.id); other.allies = other.allies.filter(x => x !== n.id); this.pushNews('diplo', `${n.name} breaks its alliance with ${other.name}.`, [n.id, other.id]) }
    else { n.pacts = n.pacts.filter(x => x !== other.id); other.pacts = other.pacts.filter(x => x !== n.id); this.pushNews('diplo', `${n.name} cancels its trade pact with ${other.name}.`, [n.id, other.id]) }
    if (other.brain) other.brain.grievances[n.id] = (other.brain.grievances[n.id] ?? 0) + 10
  }
  setTariff(n: Nation, other: Nation, rate: number | null) {
    if (rate == null) { delete n.tariffs[other.id]; return }
    n.tariffs[other.id] = clamp(Math.round(+rate || 0), 0, 200)
    if (rate >= 25) {
      this.pushNews('trade', `${n.name} imposes ${Math.round(rate)}% tariffs on ${other.name}.`, [n.id, other.id])
      if (other.brain) other.brain.grievances[n.id] = (other.brain.grievances[n.id] ?? 0) + 15
    }
  }
  toggleList(n: Nation, other: Nation, list: 'embargoes' | 'sanctions' | 'blockades' | 'aidTargets', on: boolean) {
    if (list === 'blockades' && on) {
      if (!n.wars.includes(other.id)) throw new GameError('You can only blockade a nation you are at war with.')
      if (n.stocks.navy <= other.stocks.navy * 1.2) throw new GameError(`Your navy is too weak to blockade ${other.name} (needs 120% of theirs).`)
    }
    if (list === 'aidTargets' && on && n.aidTargets.length >= 5) throw new GameError('You can fund at most 5 aid programmes.')
    const has = n[list].includes(other.id)
    if (on && !has) n[list].push(other.id)
    if (!on && has) n[list] = n[list].filter(x => x !== other.id)
    if (on && !has) {
      const verb = { embargoes: '⛔ declares a full trade embargo on', sanctions: 'imposes financial sanctions on', blockades: '⚓ blockades the ports of', aidTargets: 'launches a development aid programme for' }[list]
      this.pushNews(list === 'blockades' ? 'war' : list === 'aidTargets' ? 'diplo' : 'trade', `${n.name} ${verb} ${other.name}.`, [n.id, other.id])
      if (other.brain && list !== 'aidTargets') other.brain.grievances[n.id] = (other.brain.grievances[n.id] ?? 0) + (list === 'embargoes' ? 30 : 20)
    }
  }
  createBloc(n: Nation, name: string, cet: number): TradeBloc {
    if (n.tradeBloc != null) throw new GameError('Leave your current trade bloc first.')
    name = name.trim().slice(0, 50)
    if (name.length < 3) throw new GameError('Name your trade bloc.')
    const colors = ['#ffd43b', '#63e6be', '#ff8787', '#91a7ff', '#ffa94d', '#e599f7']
    const bloc: TradeBloc = { id: this.seq++, name, color: colors[this.tradeBlocs.length % colors.length], founder: n.id, members: [n.id], cet: clamp(+cet || 0, 0, 60) }
    this.tradeBlocs.push(bloc)
    n.tradeBloc = bloc.id
    this.pushNews('trade', `🌐 ${n.name} founds the ${bloc.name}.`, [n.id])
    return bloc
  }
  leaveBloc(n: Nation) {
    const bloc = this.tradeBlocs.find(b => b.id === n.tradeBloc)
    n.tradeBloc = null
    if (!bloc) return
    bloc.members = bloc.members.filter(m => m !== n.id)
    if (bloc.founder === n.id && bloc.members.length) bloc.founder = bloc.members[0]
    if (bloc.members.length < 2) { for (const m of bloc.members) { const x = this.nations.get(m); if (x) x.tradeBloc = null } this.tradeBlocs = this.tradeBlocs.filter(b => b !== bloc) }
    this.pushNews('trade', `${n.name} leaves the ${bloc.name}.`, [n.id])
  }
  bid(n: Nation, amount: number) {
    if (!this.games.bidsOpen) throw new GameError('Bidding for the World Games is not open.')
    amount = clamp(+amount || 0, 1, 500)
    this.games.bids = this.games.bids.filter(b => b.nation !== n.id)
    this.games.bids.push({ nation: n.id, amount })
    this.pushNews('games', `🏅 ${n.name} bids $${amount}B to host the World Games.`, [n.id])
  }
  answerIssue(n: Nation, option: number) {
    const iss = n.issue
    if (!iss) throw new GameError('No issue is pending.')
    const tpl = ISSUES.find(t => t.key === iss.key)
    const opt = tpl?.options[option]
    if (!tpl || !opt) throw new GameError('Invalid choice.')
    opt.apply(n, this)
    n.mods = computeMods(n.policy)
    n.issue = null
    n.nextIssue = this.tick + 45 + Math.floor(Math.random() * 45)
    return opt.label
  }
  moveCapital(n: Nation, pid: number) {
    if (this.prov[pid].owner !== n.id) throw new GameError('Not your province.')
    if (n.treasury < 5) throw new GameError('Relocating the capital costs $5B.')
    n.treasury -= 5; n.capital = pid; n.stability = Math.max(0, n.stability - 4)
  }
  addChat(n: Nation | undefined, text: string) {
    text = text.replace(/\s+/g, ' ').trim().slice(0, 240)
    if (!text) return null
    const msg: ChatMsg = { tick: this.tick, from: n ? n.name : 'Observer', color: n ? n.color : '#888888', text }
    this.chat.push(msg)
    if (this.chat.length > 80) this.chat.shift()
    return msg
  }

  // ───────────────────────── views ─────────────────────────
  publicView(n: Nation): NationPublic {
    const idx: Record<string, number> = {}
    for (const [k, v] of Object.entries(n.idx)) idx[k] = +v.toPrecision(4)
    return {
      id: n.id, name: n.name, leader: n.leader, motto: n.motto, color: n.color, ai: n.ai,
      online: !!n.token && this.online.has(n.token), capital: n.capital, founded: n.founded,
      provinces: n.provinces, pop: Math.round(n.pop), gdp: r2(n.gdp), troops: r2(n.troops), gov: String(n.policy.government),
      strategy: n.brain?.strategy ?? 'player', wars: n.wars, allies: n.allies, pacts: n.pacts, embargoes: n.embargoes, sanctions: n.sanctions,
      bloc: n.tradeBloc, protectedUntil: n.protectedUntil, idx,
    }
  }
  privateView(n: Nation): NationPrivate {
    const partners = [...this.nations.values()].filter(o => o.alive && o.id !== n.id).map(o => ({
      id: o.id, exports: r2(this.flowBetween(n.id, o.id)), imports: r2(this.flowBetween(o.id, n.id)),
      tariffOut: r2(n.tariffs[o.id] ?? -1), tariffIn: r2(o.tariffs[n.id] ?? -1),
      influenceOver: r2(influenceOf(this, n.id, o.id)), influenceBy: r2(influenceOf(this, o.id, n.id)), attitude: o.brain ? Math.round(attitude(this, o, n)) : 0,
    })).sort((a, b) => (b.exports + b.imports) - (a.exports + a.imports))
    return {
      ...this.publicView(n), treasury: r2(n.treasury), policy: n.policy, budget: n.budget, subsidies: n.subsidies, cooldowns: n.cooldowns,
      tariffs: n.tariffs, aidTargets: n.aidTargets, blockades: n.blockades, blocs: n.blocs, blocWeights: n.blocWeights,
      stocks: Object.fromEntries(Object.entries(n.stocks).map(([k, v]) => [k, r2(v)])),
      reserve: r2(n.reserve), manpower: r2(n.manpower), manpowerCap: r2(n.manpowerCap), quality: r2(n.quality), warWeariness: r2(n.warWeariness),
      ledger: { revenue: Object.fromEntries(Object.entries(n.ledger.revenue).map(([k, v]) => [k, r2(v)])), spending: Object.fromEntries(Object.entries(n.ledger.spending).map(([k, v]) => [k, r2(v)])), net: r2(n.ledger.net) },
      sectors: { output: n.sectorOut.map(r2), jobs: n.sectorJobs.map(r2), exports: n.exports.map(r2), imports: n.imports.map(r2) },
      partners, history: n.history, mods: n.mods, nextElection: n.nextElection, ideology: revealedIdeology(n),
    }
  }
  provinceDetail(pid: number): ProvinceDetail {
    const p = this.prov[pid], P = this.P[pid]
    const c = this.countries[P.iso3]
    return {
      id: pid, owner: p.owner, pop: Math.round(p.pop), urban: r2(p.urban), gdp: r2(p.gdp), gdppc: Math.round(p.pop ? (p.gdp * 12e6) / p.pop : 0),
      unemployment: r2(p.unemployment * 100), happiness: r2(p.happiness), unrest: Math.round(p.unrest), garrison: r2(p.garrison),
      stocks: { infra: r2(p.infra), edu: r2(p.edu), health: r2(p.health), safety: r2(p.safety), housing: r2(p.housing), pollution: r2(p.pollution) },
      jobs: p.jobs.map(r2), output: p.output.map(x => +x.toPrecision(3)), policy: p.policy, projects: p.projects.map(x => ({ ...x, progress: r2(x.progress) })),
      core: p.core, occupied: p.occupiedUntil > this.tick, baseline: c ? `${c.name}${c.estimated ? ' (estimates)' : ''}` : 'Unknown',
    }
  }
  snapshot(token: string | null, dayMs: number): StateMsg {
    const me = token ? this.playerNation(token) : undefined
    const owner: number[] = [], pop: number[] = [], garrison: number[] = [], unrest: number[] = [], gdppc: number[] = [], top: number[] = [], dev: number[] = [], build: number[] = []
    for (const p of this.prov) {
      owner.push(p.owner); pop.push(Math.round(p.pop)); garrison.push(Math.round(p.garrison * 10) / 10); unrest.push(Math.round(p.unrest))
      gdppc.push(Math.round(p.pop ? (p.gdp * 12e6) / p.pop : 0))
      let ts = 0, tv = -1
      for (let s = 0; s < NS; s++) if (SECTORS[s].tradable && p.output[s] > tv) { tv = p.output[s]; ts = s }
      top.push(ts)
      dev.push(Math.round((p.infra + p.edu + p.health) / 3))
      build.push(p.projects.filter(x => x.done).length + 10 * p.projects.filter(x => !x.done).length)
    }
    const { ids, flows } = this.trade
    const tr: [number, number, number][] = []
    for (let i = 1; i < ids.length; i++) for (let j = 1; j < ids.length; j++) { const f = flows[i * ids.length + j]; if (f > 0.05) tr.push([ids[i], ids[j], r2(f)]) }
    tr.sort((a, b) => b[2] - a[2])
    return {
      t: 'state', tick: this.tick, dayMs, market: { prices: this.prices.map(r2), oilShock: this.market.oilShock },
      prov: { owner, pop, garrison, unrest, gdppc, top, dev, build },
      nations: [...this.nations.values()].filter(n => n.alive).map(n => this.publicView(n)),
      tradeBlocs: this.tradeBlocs, trade: tr.slice(0, 160), battles: this.battles, results: this.results, news: this.news.slice(0, 60), games: this.games,
      me: me ? this.privateView(me) : null,
      myProvinces: me ? this.owned(me.id).map(pid => this.provinceDetail(pid)) : [],
      proposals: me ? this.proposals.filter(p => p.to === me.id || p.from === me.id) : [],
      issue: me?.issue ? { id: me.issue.id, title: me.issue.title, text: me.issue.text, options: me.issue.options, expires: me.issue.expires } : null,
    }
  }
  newToken() { return randomUUID() }
}
