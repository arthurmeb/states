// Procedural isometric province scenes. Everything is derived from the simulated state of the
// province: jobs per sector, wealth, development, pollution, unrest, garrison and built projects.

import { SECTOR_INDEX as S, SECTORS } from '~~/shared/sectors'
import type { ProvinceDetail, ProvinceStatic } from '~~/shared/types'

export const N = 32 // grid size
export const TW = 48, TH = 24

export type Kind =
  | 'grass' | 'sand' | 'water' | 'road' | 'avenue' | 'plaza' | 'park' | 'farm' | 'forest' | 'rock' | 'snow'
  | 'house' | 'apartment' | 'tower' | 'office' | 'shop' | 'factory' | 'heavy' | 'hightech' | 'warehouse' | 'pumpjack' | 'mine'
  | 'port' | 'resort' | 'studio' | 'stadium' | 'university' | 'hospital' | 'airport' | 'spaceport' | 'fab' | 'solar' | 'nuclear'
  | 'refinery' | 'heritage' | 'base' | 'navalbase' | 'airbase' | 'greenhouse' | 'construction' | 'slum' | 'barn'

export interface Cell { kind: Kind; h: number; color: string; seed: number; label?: string; root?: boolean }
export interface Scene {
  cells: Cell[][]
  ground: string
  coast: boolean
  tropical: boolean
  roads: [number, number][]
  plaza: [number, number]
  agents: { x: number; y: number; tx: number; ty: number; color: string; kind: 'person' | 'car' | 'soldier' | 'protester'; speed: number }[]
  smoke: { x: number; y: number; rate: number; color: string }[]
  ships: { x: number; y: number; dir: number }[]
  pumpjacks: [number, number][]
  cranes: [number, number][]
  planes: [number, number][]
  dark: number
  unrest: number
  wealth: number
}

const GROUND: Record<string, string> = {
  plains: '#7fa356', farmland: '#6f9d45', boreal: '#4f7a4a', tundra: '#a9b5ad', ice: '#e8f1f5', desert: '#d8b56f', arid: '#c4a86b',
  savanna: '#b5a955', jungle: '#3f7d3c', mountains: '#8d8170',
}

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000 }
}

export function buildScene(P: ProvinceStatic, d: ProvinceDetail): Scene {
  const r = rng(P.id * 7919 + 17)
  const tropical = Math.abs(P.lat) < 25
  const ground = GROUND[P.terrain] ?? '#7fa356'
  const cells: Cell[][] = Array.from({ length: N }, (_, x) => Array.from({ length: N }, (_, y) => ({ kind: 'grass' as Kind, h: 0, color: ground, seed: (x * 131 + y * 71 + P.id) % 997 })))
  const set = (x: number, y: number, c: Partial<Cell>) => { if (x >= 0 && y >= 0 && x < N && y < N) Object.assign(cells[x][y], c) }
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < N && y < N ? cells[x][y] : null)

  const jobsTot = d.jobs.reduce((a, b) => a + b, 0) || 1
  const share = (s: number) => d.jobs[s] / jobsTot
  const wealth = Math.max(0, Math.min(1, Math.log10(Math.max(500, d.gdppc) / 800) / 2))
  const built = new Set(d.projects.filter(p => p.done).map(p => p.id))
  const building = d.projects.filter(p => !p.done).map(p => p.id)

  // water along the south-east edge if coastal
  const coast = P.coastal
  const shore = coast ? N - 7 - Math.floor(r() * 3) : 999
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    const w = x + y * 0.6 - shore * 1.6 + Math.sin(x * 0.7) * 1.2
    if (coast && w > 0) set(x, y, { kind: 'water', color: '#2b6f9e' })
    else if (coast && w > -1.6) set(x, y, { kind: 'sand', color: '#e3cf98' })
  }
  // mountains/forest/snow texture
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    const c = cells[x][y]
    if (c.kind !== 'grass') continue
    const v = r()
    if (P.terrain === 'mountains' && x + y < 14 && v < 0.55) set(x, y, { kind: 'rock', h: 6 + r() * 26, color: '#857865' })
    else if (['boreal', 'jungle'].includes(P.terrain) && v < 0.45) set(x, y, { kind: 'forest', color: ground })
    else if (P.terrain === 'tundra' && v < 0.3) set(x, y, { kind: 'snow', color: '#dfe7ea' })
    else if (v < 0.07) set(x, y, { kind: 'forest', color: ground })
  }

  // city centre biased toward the coast
  const cx = Math.round(N / 2 + (coast ? 3 : 0)), cy = Math.round(N / 2 + (coast ? 1 : 0))
  const urbanPop = d.pop * d.urban
  const radius = Math.max(3, Math.min(13, 2 + Math.log10(Math.max(10, urbanPop)) * 2.6))
  const plaza: [number, number] = [cx, cy]
  // roads: grid every 4 tiles inside the city + avenues to the edges
  const roads: [number, number][] = []
  const isLand = (x: number, y: number) => { const c = at(x, y); return !!c && c.kind !== 'water' && c.kind !== 'rock' }
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    const dist = Math.hypot(x - cx, y - cy)
    const grid = (x - cx) % 4 === 0 || (y - cy) % 4 === 0
    const avenue = (x === cx || y === cy) && isLand(x, y)
    if (avenue) { set(x, y, { kind: 'avenue', color: '#5d5f63', h: 0 }); roads.push([x, y]) }
    else if (grid && dist < radius + 0.5 && isLand(x, y)) { set(x, y, { kind: 'road', color: '#6d6f73', h: 0 }); roads.push([x, y]) }
  }
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (isLand(cx + dx, cy + dy)) set(cx + dx, cy + dy, { kind: 'plaza', color: '#b9b3a6' })

  // free city lots ordered from centre outward
  const lots: [number, number, number][] = []
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    const c = cells[x][y]
    if (!['grass', 'forest', 'snow', 'sand'].includes(c.kind) || (c.kind === 'sand' && !coast)) continue
    lots.push([x, y, Math.hypot(x - cx, y - cy) + r() * 1.2])
  }
  lots.sort((a, b) => a[2] - b[2])
  const take = (pred: (x: number, y: number, dist: number) => boolean) => {
    const i = lots.findIndex(([x, y, dd]) => pred(x, y, dd))
    if (i < 0) return null
    const [x, y] = lots.splice(i, 1)[0]
    return [x, y] as [number, number]
  }
  const nearWater = (x: number, y: number) => [[1, 0], [0, 1], [-1, 0], [0, -1]].some(([a, b]) => at(x + a, y + b)?.kind === 'water')

  // landmark projects first
  const landmark = (id: string, kind: Kind, h: number, color: string, label: string, where: (x: number, y: number, d: number) => boolean) => {
    if (!built.has(id)) return
    const p = take(where)
    if (p) set(p[0], p[1], { kind, h, color, label, root: true })
  }
  const inCity = (_x: number, _y: number, dd: number) => dd < radius
  const edge = (_x: number, _y: number, dd: number) => dd > radius - 1 && dd < radius + 6
  landmark('university', 'university', 14, '#9c4a3a', 'Research university', inCity)
  landmark('hospital', 'hospital', 16, '#f1f3f5', 'Hospital network', inCity)
  landmark('stadium', 'stadium', 8, '#ced4da', 'Stadium', edge)
  landmark('studios', 'studio', 12, '#495057', 'Film & media city', edge)
  landmark('heritage', 'heritage', 16, '#e9dcc0', 'Museums & heritage', (x, y, dd) => dd < 3.5)
  landmark('financial', 'tower', 70 + wealth * 50, '#7fb3d5', 'Financial district', (x, y, dd) => dd < 2.5)
  landmark('techpark', 'hightech', 16, '#a5d8ff', 'Technology park', edge)
  landmark('fab', 'fab', 18, '#f8f9fa', 'Semiconductor fab', edge)
  landmark('nuclear', 'nuclear', 26, '#dee2e6', 'Nuclear power plant', (x, y, dd) => dd > radius + 2)
  landmark('refinery', 'refinery', 18, '#868e96', 'Refinery', (x, y, dd) => dd > radius + 1)
  landmark('spaceport', 'spaceport', 46, '#f8f9fa', 'Spaceport', (x, y, dd) => dd > radius + 4)
  landmark('airport', 'airport', 4, '#495057', 'International airport', (x, y, dd) => dd > radius + 2 && x < N - 6)
  landmark('base', 'base', 6, '#5c6b3a', 'Military base', (x, y, dd) => dd > radius + 2)
  landmark('airbase', 'airbase', 4, '#5c6b3a', 'Air base', (x, y, dd) => dd > radius + 3)
  landmark('resort', 'resort', 10, '#ffffff', 'Resort district', (x, y) => nearWater(x, y) || !coast)
  landmark('navalbase', 'navalbase', 8, '#5c6b3a', 'Naval base', (x, y) => nearWater(x, y))
  if (built.has('solar')) for (let i = 0; i < 6; i++) { const p = take((x, y, dd) => dd > radius + 2); if (p) set(p[0], p[1], { kind: 'solar', h: 1, color: '#1c3d6e', label: 'Solar farm' }) }
  if (built.has('agritech')) for (let i = 0; i < 5; i++) { const p = take((x, y, dd) => dd > radius + 1); if (p) set(p[0], p[1], { kind: 'greenhouse', h: 5, color: '#d0ebff', label: 'Greenhouses' }) }
  if (built.has('housing')) for (let i = 0; i < 5; i++) { const p = take(inCity); if (p) set(p[0], p[1], { kind: 'apartment', h: 24, color: '#ffd8a8', label: 'Public housing' }) }
  for (const id of building) { const p = take(inCity) ?? take(() => true); if (p) set(p[0], p[1], { kind: 'construction', h: 18, color: '#ffd43b', label: `Building: ${id}` }) }
  const cranes: [number, number][] = []
  // ports and shipping
  const shipsN = coast ? Math.round(2 + (share(S.logistics) * 60) + (built.has('port') ? 4 : 0)) : 0
  if (coast && (share(S.logistics) > 0.01 || built.has('port'))) for (let i = 0; i < (built.has('port') ? 5 : 2); i++) { const q = take((x, y) => nearWater(x, y)); if (q) { set(q[0], q[1], { kind: 'port', h: 22, color: '#e8590c', label: 'Port cranes' }); cranes.push(q) } }

  // zoning by employment
  const dense = Math.round(Math.min(lots.length * 0.75, Math.pow(urbanPop, 0.42) * 2.2))
  const offices = Math.round(dense * Math.min(0.45, (share(S.finance) + share(S.software) + share(S.media)) * 3 + 0.06))
  const industry = Math.round(dense * Math.min(0.45, (share(S.light) + share(S.heavy) + share(S.auto) + share(S.electronics) + share(S.pharma) + share(S.aerospace)) * 1.6))
  const shops = Math.round(dense * 0.12)
  const towerH = 20 + wealth * 90
  for (let i = 0; i < offices; i++) { const p = take(inCity); if (!p) break; const t = Math.hypot(p[0] - cx, p[1] - cy) / radius; set(p[0], p[1], { kind: wealth > 0.45 ? 'tower' : 'office', h: towerH * (1 - t * 0.7) * (0.6 + r() * 0.6), color: wealth > 0.6 ? ['#7fb3d5', '#9ec5e6', '#6c9bc4'][Math.floor(r() * 3)] : '#a9a59c', label: 'Offices' }) }
  for (let i = 0; i < shops; i++) { const p = take(inCity); if (!p) break; set(p[0], p[1], { kind: 'shop', h: 6 + r() * 6, color: ['#f783ac', '#ffa94d', '#74c0fc', '#69db7c'][Math.floor(r() * 4)], label: 'Shops & restaurants' }) }
  const indKinds: [Kind, number, string, string][] = [
    ['factory', share(S.light) + share(S.auto), '#b0a089', 'Factories'],
    ['heavy', share(S.heavy), '#7b6f63', 'Steel & chemicals'],
    ['hightech', share(S.electronics) + share(S.pharma) + share(S.aerospace) + share(S.software) * 0.3, '#d0ebff', 'High-tech plants'],
    ['warehouse', share(S.logistics), '#a68a64', 'Warehouses'],
  ]
  const indTot = indKinds.reduce((a, k) => a + k[1], 0) || 1
  const smoke: Scene['smoke'] = []
  for (const [kind, s, color, label] of indKinds) {
    const count = Math.round(industry * (s / indTot)) + (kind === 'warehouse' && coast ? 1 : 0)
    for (let i = 0; i < count; i++) {
      const p = take((x, y, dd) => dd > radius * 0.55 && (x < cx || dd > radius * 0.85))
      if (!p) break
      set(p[0], p[1], { kind, h: kind === 'heavy' ? 14 : kind === 'hightech' ? 10 : 9, color, label })
      if (kind === 'heavy' || kind === 'factory') smoke.push({ x: p[0], y: p[1], rate: d.stocks.pollution / 25 * (kind === 'heavy' ? 1.8 : 1), color: kind === 'heavy' ? '120,110,100' : '170,170,170' })
    }
  }
  // housing fills the rest of the city; slums when poor and crowded
  const homes = Math.max(0, dense - offices - shops - industry)
  for (let i = 0; i < homes; i++) {
    const p = take((x, y, dd) => dd < radius + 1.5)
    if (!p) break
    const dd = Math.hypot(p[0] - cx, p[1] - cy) / radius
    const poor = wealth < 0.35 && d.stocks.housing < 50 && dd > 0.6
    if (poor) set(p[0], p[1], { kind: 'slum', h: 3 + r() * 2, color: ['#a1887f', '#8d6e63', '#bcaaa4'][Math.floor(r() * 3)], label: 'Informal housing' })
    else if (dd < 0.55 && wealth > 0.3) set(p[0], p[1], { kind: 'apartment', h: 14 + wealth * 30 * (1 - dd) + r() * 8, color: ['#e9ecef', '#dee2e6', '#ffe8cc', '#d3f9d8'][Math.floor(r() * 4)], label: 'Apartments' })
    else set(p[0], p[1], { kind: 'house', h: 5 + r() * 3, color: ['#ffc9c9', '#ffec99', '#d0bfff', '#c5f6fa', '#f8f9fa'][Math.floor(r() * 5)], label: 'Homes' })
  }
  // countryside: farms, oil, mines, resorts
  const farms = Math.round(Math.min(lots.length * 0.8, share(S.agriculture) * 260 + (P.fertility ? 10 : 0)))
  for (let i = 0; i < farms; i++) { const p = take((x, y, dd) => dd > radius + 0.5 && cells[x][y].kind !== 'sand'); if (!p) break; set(p[0], p[1], { kind: r() < 0.08 ? 'barn' : 'farm', h: 0, color: ['#c9b458', '#9bbf4a', '#d4a24c', '#7fae3e'][Math.floor(r() * 4)], label: 'Farmland' }) }
  const pumpjacks: [number, number][] = []
  if (P.oil) for (let i = 0; i < 3 + P.oil * 3; i++) { const p = take((x, y, dd) => dd > radius + 1); if (!p) break; set(p[0], p[1], { kind: 'pumpjack', h: 0, color: ground, label: 'Oil wells' }); pumpjacks.push(p) }
  if (P.metals) for (let i = 0; i < 2 + P.metals * 2; i++) { const p = take((x, y, dd) => dd > radius + 2); if (!p) break; set(p[0], p[1], { kind: 'mine', h: 0, color: '#6b5a48', label: 'Open-pit mine' }) }
  if (share(S.tourism) > 0.02 && coast) for (let i = 0; i < 4; i++) { const p = take((x, y) => nearWater(x, y)); if (!p) break; set(p[0], p[1], { kind: 'resort', h: 10 + wealth * 20, color: '#fff9db', label: 'Hotels' }) }
  // parks
  for (let i = 0; i < Math.round(dense * 0.05) + 1; i++) { const p = take((x, y, dd) => dd < radius); if (!p) break; set(p[0], p[1], { kind: 'park', h: 0, color: '#5c9e4a', label: 'Park' }) }

  // people, cars, soldiers, protesters
  const agents: Scene['agents'] = []
  const nPeople = Math.min(140, Math.round(Math.log10(Math.max(10, d.pop)) * 22 * (0.4 + d.urban)))
  const pick = () => roads[Math.floor(r() * roads.length)] ?? [cx, cy]
  for (let i = 0; i < nPeople; i++) { const [x, y] = pick(); agents.push({ x, y, tx: x, ty: y, color: ['#ffd8a8', '#e599f7', '#74c0fc', '#ffe066', '#f8f9fa', '#ff8787'][Math.floor(r() * 6)], kind: 'person', speed: 0.9 + r() * 0.5 }) }
  const nCars = Math.min(60, Math.round(nPeople * 0.35 * (0.3 + wealth)))
  for (let i = 0; i < nCars; i++) { const [x, y] = pick(); agents.push({ x, y, tx: x, ty: y, color: ['#fa5252', '#f8f9fa', '#228be6', '#343a40', '#fcc419'][Math.floor(r() * 5)], kind: 'car', speed: 2.6 + r() }) }
  const soldiers = Math.min(40, Math.round(d.garrison * 1.2) + (d.policy.security === 'martial' ? 25 : 0))
  for (let i = 0; i < soldiers; i++) { const [x, y] = pick(); agents.push({ x, y, tx: x, ty: y, color: '#5c6b3a', kind: 'soldier', speed: 0.8 }) }
  const protesters = d.unrest > 35 ? Math.min(80, Math.round((d.unrest - 30) * 1.4)) : 0
  for (let i = 0; i < protesters; i++) agents.push({ x: cx + (r() - 0.5) * 3, y: cy + (r() - 0.5) * 3, tx: cx, ty: cy, color: '#ff6b6b', kind: 'protester', speed: 0.3 })
  const ships = Array.from({ length: Math.min(8, shipsN) }, () => ({ x: N - 2 - r() * 4, y: r() * N, dir: r() < 0.5 ? 1 : -1 }))
  const planes = built.has('airport') ? [[0, 0] as [number, number]] : []
  return { cells, ground, coast, tropical, roads, plaza, agents, smoke, ships, pumpjacks, cranes, planes, dark: 0, unrest: d.unrest, wealth }
}

export const iso = (x: number, y: number) => ({ sx: (x - y) * (TW / 2), sy: (x + y) * (TH / 2) })
export const sectorColor = (s: number) => SECTORS[s].color
