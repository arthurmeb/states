import { SECTORS, NS, SECTOR_INDEX as S } from '../../shared/sectors'
import type { Game } from './world'
import type { Nation } from './model'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const R = 6371
function distKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const t = (x: number) => (x * Math.PI) / 180
  const h = Math.sin(t(b.lat - a.lat) / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(t(b.lon - a.lon) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Tariff (percent) that `importer` charges on goods from `exporter`. id 0 = the unaligned world. */
export function tariffOn(g: Game, importer: Nation | null, exporterId: number): number {
  if (!importer) return 8
  const bloc = importer.tradeBloc != null ? g.tradeBlocs.find(b => b.id === importer.tradeBloc) : undefined
  if (bloc && bloc.members.includes(exporterId)) return 0
  let t = importer.tariffs[exporterId] ?? (bloc ? Math.max(bloc.cet, 0) : +importer.policy.tariff)
  if (importer.pacts.includes(exporterId)) t *= 0.5
  return t
}

export interface TradeResult {
  ids: number[]
  /** bilateral monthly flows [i][j] = exports from ids[i] to ids[j] ($B/month) */
  flows: Float64Array
}

/** Weekly world market clearing, bilateral trade and influence. */
export function tradeWeek(g: Game) {
  const nations = [...g.nations.values()].filter(n => n.alive)
  const ids = [0, ...nations.map(n => n.id)]
  const N = ids.length
  const at = new Map(ids.map((id, i) => [id, i]))
  const nat = (i: number) => (i === 0 ? null : nations[i - 1])

  // Everything is cleared in real terms (base prices) so that price moves don't feed back into demand.
  // Q = potential real supply (undo last week's sell-through and price), gdp = real GDP.
  const Q = Array.from({ length: N }, () => new Array(NS).fill(0))
  const gdp = new Array(N).fill(0), pop = new Array(N).fill(0)
  for (let pid = 0; pid < g.P.length; pid++) {
    const p = g.prov[pid]
    const i = at.get(p.owner === -1 ? 0 : p.owner)
    if (i === undefined) continue
    const sell = g.sell.get(ids[i])
    for (let s = 0; s < NS; s++) {
      const t = SECTORS[s].tradable
      const real = t ? p.output[s] / (Math.max(0.05, sell ? sell[s] : 1) * g.prices[s]) : p.output[s]
      Q[i][s] += real; gdp[i] += real
    }
    pop[i] += p.pop
  }
  const loc = ids.map((id, i) => {
    const n = nat(i)
    const P = n ? g.P[n.capital] : null
    return P ? { lat: P.lat, lon: P.lon } : null
  })
  const worldGdp = gdp.reduce((a, x) => a + x, 0)
  const worldPc = worldGdp / Math.max(1, pop.reduce((a, x) => a + x, 0))
  const shocks = g.market.oilShock.length
  for (let i = 0; i < N; i++) Q[i][S.oil] *= 1 - 0.06 * shocks

  // demand with income elasticity
  const D = Array.from({ length: N }, () => new Array(NS).fill(0))
  for (let s = 0; s < NS; s++) {
    if (!SECTORS[s].tradable) continue
    const e = SECTORS[s].elasticity
    let raw = 0
    const adj = gdp.map((x, i) => { const pc = pop[i] ? x / pop[i] : worldPc; const a = Math.pow(Math.max(0.05, pc / worldPc), e - 1); raw += x * a; return a })
    const scale = raw ? worldGdp / raw : 1
    for (let i = 0; i < N; i++) D[i][s] = g.demandShare[s] * gdp[i] * adj[i] * scale
  }

  // gravity weights between every pair
  const G = new Float64Array(N * N)
  const blockaded = new Set<number>()
  for (const n of nations) for (const t of n.blockades) {
    const tn = g.nation(t)
    if (tn && n.wars.includes(t) && n.stocks.navy > tn.stocks.navy * 1.2) blockaded.add(t)
  }
  const neighbours = new Map(nations.map(n => [n.id, new Set(g.neighboursOf(n.id))]))
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i === j) continue
    const a = nat(i), b = nat(j)
    let w = 1
    const d = loc[i] && loc[j] ? distKm(loc[i]!, loc[j]!) : 4000
    w *= Math.pow(d / 1000 + 0.6, -0.8)
    if (a && b) {
      if (a.wars.includes(b.id) || a.embargoes.includes(b.id) || b.embargoes.includes(a.id)) { G[i * N + j] = 0; continue }
      if (a.sanctions.includes(b.id) || b.sanctions.includes(a.id)) w *= 0.5
      if (a.pacts.includes(b.id)) w *= 1.4
      if (a.tradeBloc != null && a.tradeBloc === b.tradeBloc) w *= 1.8
      if (a.allies.includes(b.id)) w *= 1.15
      const land = neighbours.get(a.id)?.has(b.id)
      if (!land && (blockaded.has(a.id) || blockaded.has(b.id))) w *= 0.25
    }
    w *= Math.pow(1 + tariffOn(g, b, ids[i]) / 100, -3)
    G[i * N + j] = w
  }

  // clear each sector
  const flows = new Float64Array(N * N)
  const exportsBy = Array.from({ length: N }, () => new Array(NS).fill(0))
  const importsBy = Array.from({ length: N }, () => new Array(NS).fill(0))
  const tariffRev = new Array(N).fill(0), shortage = new Array(N).fill(0), demandTot = new Array(N).fill(0)
  for (let s = 0; s < NS; s++) {
    if (!SECTORS[s].tradable) continue
    let supply = 0, demand = 0
    const X = new Array(N).fill(0), Mn = new Array(N).fill(0)
    for (let i = 0; i < N; i++) {
      supply += Q[i][s]; demand += D[i][s]
      const net = Q[i][s] - D[i][s]
      if (net > 0) X[i] = net; else Mn[i] = -net
      demandTot[i] += D[i][s]
    }
    // Gravity seed matrix balanced to both margins (RAS / iterative proportional fitting).
    // Tourists and audiences prefer attractive destinations.
    const pull = (i: number) => (s === S.tourism || s === S.media ? 0.4 + (nat(i)?.idx.softPower ?? 25) / 60 : 1)
    const sumX = X.reduce((a, x) => a + x, 0), sumM = Mn.reduce((a, x) => a + x, 0)
    const T = Math.min(sumX, sumM)
    const F = new Float64Array(N * N)
    if (T > 0) {
      for (let i = 0; i < N; i++) if (X[i]) for (let j = 0; j < N; j++) if (Mn[j]) F[i * N + j] = X[i] * Mn[j] * G[i * N + j] * pull(i)
      const rowT = X.map(x => (x * T) / sumX), colT = Mn.map(m => (m * T) / sumM)
      for (let it = 0; it < 8; it++) {
        for (let i = 0; i < N; i++) {
          if (!X[i]) continue
          let r = 0
          for (let j = 0; j < N; j++) r += F[i * N + j]
          if (r > 0) { const k = rowT[i] / r; for (let j = 0; j < N; j++) F[i * N + j] *= k }
        }
        for (let j = 0; j < N; j++) {
          if (!Mn[j]) continue
          let c = 0
          for (let i = 0; i < N; i++) c += F[i * N + j]
          if (c > 0) { const k = Math.min(colT[j] / c, Mn[j] / c); for (let i = 0; i < N; i++) F[i * N + j] *= k }
        }
      }
    }
    const sold = new Array(N).fill(0)
    const price = g.prices[s]
    for (let j = 0; j < N; j++) {
      let got = 0
      for (let i = 0; i < N; i++) {
        const f = F[i * N + j]
        if (!f) continue
        const v = f * price
        got += f
        flows[i * N + j] += v; sold[i] += f; exportsBy[i][s] += v; importsBy[j][s] += v
        tariffRev[j] += (v * tariffOn(g, nat(j), ids[i])) / 100
      }
      shortage[j] += Math.max(0, Mn[j] - got)
    }
    // sell-through for exporters: unsold surplus is lost output
    for (let i = 0; i < N; i++) {
      const sell = g.sell.get(ids[i]) ?? new Array(NS).fill(1)
      const target = Q[i][s] > 0 ? clamp((Math.min(Q[i][s], D[i][s]) + sold[i]) / Q[i][s], 0.2, 1) : 1
      sell[s] = sell[s] + (target - sell[s]) * 0.5
      g.sell.set(ids[i], sell)
    }
    // world price: excess demand raises it, glut lowers it
    const ratio = supply > 0 ? demand / supply : 1
    g.prices[s] = clamp(g.prices[s] * clamp(Math.pow(ratio, 0.12), 0.97, 1.03), 0.25, 4)
  }
  if (shocks) g.prices[S.oil] = clamp(g.prices[S.oil] * (1 + 0.02 * shocks), 0.25, 4)
  let pw = 0, ws = 0
  for (let s = 0; s < NS; s++) if (SECTORS[s].tradable) { pw += g.prices[s] * g.demandShare[s]; ws += g.demandShare[s] }
  g.avgTradablePrice = ws ? pw / ws : 1

  // write back to nations
  for (let i = 1; i < N; i++) {
    const n = nations[i - 1]
    n.exports = exportsBy[i]; n.imports = importsBy[i]
    n.tariffRevenue = tariffRev[i]
    n.shortage = demandTot[i] ? clamp(shortage[i] / demandTot[i], 0, 1) : 0
  }
  g.trade = { ids, flows }

  // foreign aid: 60% of the diplomacy budget goes to chosen recipients
  for (const n of nations) n.aidReceived = 0
  g.aid = new Map()
  for (const n of nations) {
    const recipients = n.aidTargets.map(id => g.nation(id)).filter((r): r is Nation => !!r && !n.wars.includes(r.id))
    if (!recipients.length) continue
    const pot = (n.gdp * n.budget.diplomacy / 100) * 0.6
    for (const r of recipients) { r.aidReceived += pot / recipients.length; g.aid.set(`${n.id}>${r.id}`, pot / recipients.length) }
  }

  computeInfluence(g, nations, ids, flows, gdp)
}

function computeInfluence(g: Game, nations: Nation[], ids: number[], flows: Float64Array, gdp: number[]) {
  const N = ids.length
  const importsTot = new Array(N).fill(0)
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) importsTot[j] += flows[i * N + j]
  g.influence = new Map()
  const raw = new Map<number, number>()
  const maxSp = Math.max(1, ...nations.map(n => n.idx.softPower ?? 0))
  for (let i = 1; i < N; i++) {
    const a = nations[i - 1]
    let total = 0, wsum = 0
    for (let j = 1; j < N; j++) {
      if (i === j) continue
      const b = nations[j - 1]
      let v = 0
      v += 60 * (flows[j * N + i] / Math.max(0.01, gdp[j]))           // b's exports to a, share of b's GDP
      v += 40 * (flows[i * N + j] / Math.max(0.01, importsTot[j]))     // a's share of b's imports
      v += 300 * ((g.aid.get(`${a.id}>${b.id}`) ?? 0) / Math.max(0.01, gdp[j]))
      if (a.allies.includes(b.id)) v += 12
      if (a.tradeBloc != null && a.tradeBloc === b.tradeBloc) v += g.isBlocLeader(a.id) ? 14 : 6
      v += 15 * Math.pow((a.idx.softPower ?? 0) / maxSp, 1.5)
      if (g.neighboursOf(a.id).includes(b.id)) v += 15 * (a.idx.power ?? 1) / Math.max(1, (a.idx.power ?? 1) + (b.idx.power ?? 1))
      v = clamp(v, 0, 100)
      g.influence.set(`${a.id}>${b.id}`, v)
      const w = Math.sqrt(Math.max(0.01, gdp[j]))
      total += v * w; wsum += w
    }
    raw.set(a.id, wsum ? total / wsum : 0)
  }
  const mx = Math.max(1, ...raw.values())
  for (const n of nations) n.idx.influence = (100 * (raw.get(n.id) ?? 0)) / mx
}

export const influenceOf = (g: Game, a: number, b: number) => g.influence.get(`${a}>${b}`) ?? 0
