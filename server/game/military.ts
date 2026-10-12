import { TERRAIN } from '../../shared/rules'
import { PROJECT_MAP } from '../../shared/projects'
import type { Game } from './world'
import type { Nation } from './model'

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const rand = (a: number, b: number) => a + Math.random() * (b - a)

export class GameError extends Error {}

export function provinceDefenseBonus(g: Game, pid: number) {
  let d = 0
  for (const pr of g.prov[pid].projects) if (pr.done) d += PROJECT_MAP[pr.id]?.defense ?? 0
  return d
}

/** Days for an offensive to reach its target. */
export function travelDays(g: Game, from: number, to: number, sea: boolean) {
  const t = TERRAIN[g.P[to].terrain].defense
  return Math.round((sea ? 10 : 5) + t * 3)
}

export function defensePower(g: Game, def: Nation, pid: number) {
  const p = g.prov[pid], P = g.P[pid]
  const militia = p.pop * 0.0006
  return (p.garrison + militia) * def.quality * TERRAIN[P.terrain].defense * (pid === def.capital ? 1.25 : 1) *
    (1 + provinceDefenseBonus(g, pid)) * (p.unrest > 60 ? 0.8 : 1)
}

export function launchAttack(g: Game, n: Nation, target: number, amount: number) {
  const def = g.prov[target].owner
  if (def === -1) throw new GameError('That land is unclaimed — annex it instead.')
  if (def === n.id) throw new GameError('You already hold that province.')
  if (!n.wars.includes(def)) throw new GameError(`You are not at war with ${g.nation(def)?.name}.`)
  const { land, sea, all } = g.bordering(n.id, target)
  if (!all.length) throw new GameError('None of your provinces border that target.')
  const avail = n.reserve + all.reduce((s, q) => s + g.prov[q].garrison, 0)
  amount = Math.min(+amount || 0, avail)
  if (amount < 0.5) throw new GameError('Not enough troops available on that front.')
  let need = amount
  const fromReserve = Math.min(n.reserve, need); n.reserve -= fromReserve; need -= fromReserve
  for (const q of [...all].sort((a, b) => g.prov[b].garrison - g.prov[a].garrison)) {
    if (need <= 0) break
    const take = Math.min(g.prov[q].garrison, need); g.prov[q].garrison -= take; need -= take
  }
  const from = (land.length ? land : sea).reduce((a, b) => (g.prov[a].garrison >= g.prov[b].garrison ? a : b))
  const isSea = !land.length
  const existing = g.battles.find(b => b.attacker === n.id && b.to === target)
  if (existing) existing.troops += amount
  else g.battles.push({ id: g.seq++, attacker: n.id, defender: def, from, to: target, troops: amount, sea: isSea, start: g.tick, arrive: g.tick + travelDays(g, from, target, isSea) })
}

export function resolveBattles(g: Game) {
  const due = g.battles.filter(b => b.arrive <= g.tick)
  g.battles = g.battles.filter(b => b.arrive > g.tick)
  g.results = g.results.filter(r => r.tick >= g.tick - 3)
  for (const b of due) {
    const atk = g.nation(b.attacker)
    if (!atk) continue
    const defId = g.prov[b.to].owner
    const def = g.nation(defId)
    if (!def || !atk.wars.includes(defId)) { atk.reserve += b.troops; continue }
    const P = g.P[b.to], p = g.prov[b.to]
    const airEdge = clamp(((atk.idx.air ?? 0) - (def.idx.air ?? 0)) / 100, -0.6, 0.6)
    const navyRatio = b.sea ? clamp((atk.stocks.navy + 1) / (def.stocks.navy + 1), 0.3, 2) : 1
    const atkPow = b.troops * atk.quality * rand(0.85, 1.15) * (1 + airEdge * 0.4) * (b.sea ? 0.45 + 0.25 * navyRatio : 1)
    const defPow = defensePower(g, def, b.to) * (1 - airEdge * 0.25) * rand(0.85, 1.15) + 0.2
    const won = atkPow > defPow
    if (won) {
      const atkLoss = b.troops * clamp(0.3 * (defPow / atkPow), 0.05, 0.45)
      const defLoss = p.garrison * 0.6
      def.reserve += p.garrison * 0.4
      atk.casualties += atkLoss; def.casualties += defLoss
      g.loseProvince(def, b.to)
      p.owner = atk.id
      p.garrison = b.troops - atkLoss
      p.unrest = 50
      p.occupiedUntil = g.tick + 360 * 2
      p.pop *= 0.98
      g.ownedDirty = true
      g.pushNews('capture', `${atk.name} captures ${P.name} from ${def.name}.`, [atk.id, def.id], b.to)
      if (!g.owned(def.id).length) g.fall(def, `${def.name} has been conquered by ${atk.name}.`)
    } else {
      const atkLoss = b.troops * clamp(0.35 * (defPow / atkPow), 0.2, 0.7)
      const defLoss = p.garrison * clamp(0.3 * (atkPow / defPow), 0.05, 0.5)
      p.garrison -= defLoss
      atk.reserve += b.troops - atkLoss
      atk.casualties += atkLoss; def.casualties += defLoss
      if (b.troops > 5) g.pushNews('war', `${def.name} repels an offensive by ${atk.name} at ${P.name}.`, [atk.id, def.id], b.to)
    }
    g.results.push({ from: b.from, to: b.to, attacker: atk.id, defender: defId, won, tick: g.tick })
  }
}
