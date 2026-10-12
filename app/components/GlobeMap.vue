<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, ref } from 'vue'
import maplibregl, { type GeoJSONSource, type Map as MLMap, type ExpressionSpecification } from 'maplibre-gl'
import * as h3 from 'h3-js'
import { TERRAIN } from '~~/shared/rules'
import { SECTORS } from '~~/shared/sectors'
import type { ProvinceStatic } from '~~/shared/types'
import type { Feature, FeatureCollection } from 'geojson'
import { useGame, fmtPop, fmtTroops, fmtUsd, type MapMode } from '~/composables/useGame'
import { cityIcon, badge, shield, ship } from '~/utils/sprites'

const { snap, provinces, cities, ui, nations, me, relation, select } = useGame()
const el = ref<HTMLDivElement>()
const hover = ref<{ x: number; y: number; id: number } | null>(null)
let map: MLMap | null = null
let ready = false
let spinning = true
let raf = 0

const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
const NIGHT = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png'
const REL_COLOR: Record<string, string> = { self: '#ffd43b', ally: '#40c057', bloc: '#94d82d', pact: '#22b8cf', war: '#fa5252', hostile: '#e8590c', neutral: '#868e96' }

function unwrap(coords: number[][]) {
  const lons = coords.map(c => c[0])
  if (Math.max(...lons) - Math.min(...lons) > 180) return coords.map(([x, y]) => [x < 0 ? x + 360 : x, y])
  return coords
}
const fc = (features: Feature[]): FeatureCollection => ({ type: 'FeatureCollection', features })
const pt = (lon: number, lat: number, properties: Record<string, unknown> = {}): Feature => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [lon, lat] } })

function provinceGeoJSON(P: ProvinceStatic[]) {
  return fc(P.map(p => ({
    type: 'Feature', id: p.id,
    properties: { terrain: p.terrain, oil: p.oil, metals: p.metals, fertility: p.fertility, strait: !!p.strait },
    geometry: { type: 'Polygon', coordinates: [[...p.ring, p.ring[0]]] },
  } as Feature)))
}

// great-circle arc between two points
function arc(a: [number, number], b: [number, number], n = 48): number[][] {
  const r = Math.PI / 180
  const [lo1, la1] = [a[0] * r, a[1] * r], [lo2, la2] = [b[0] * r, b[1] * r]
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2))
  if (d === 0) return [a, b]
  const out: number[][] = []
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2)
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2)
    const z = A * Math.sin(la1) + B * Math.sin(la2)
    out.push([Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r])
  }
  for (let i = 1; i < out.length; i++) { while (out[i][0] - out[i - 1][0] > 180) out[i][0] -= 360; while (out[i][0] - out[i - 1][0] < -180) out[i][0] += 360 }
  return out
}

// ───────── paint expressions per map mode ─────────
const owned: ExpressionSpecification = ['>=', ['coalesce', ['feature-state', 'owner'], -1], 0]
const hoverBoost: ExpressionSpecification = ['case', ['boolean', ['feature-state', 'hover'], false], 0.2, 0]
function zoomFade(f: (o: number) => ExpressionSpecification | number, hi: number, lo: number): ExpressionSpecification {
  return ['interpolate', ['linear'], ['zoom'], 1, f(hi) as never, 4.5, f(hi * 0.8) as never, 7, f(lo) as never]
}
const ownedOnly = (o: number): ExpressionSpecification => ['+', ['case', owned, o, 0], hoverBoost]
const all = (o: number): ExpressionSpecification => ['+', o, hoverBoost]
function fillPaint(mode: MapMode): { color: ExpressionSpecification | string; opacity: ExpressionSpecification } {
  switch (mode) {
    case 'political': return { color: ['case', owned, ['to-color', ['coalesce', ['feature-state', 'color'], '#000000']], '#ffffff'], opacity: zoomFade(ownedOnly, 0.5, 0.12) }
    case 'diplomatic': return { color: ['match', ['coalesce', ['feature-state', 'rel'], 'none'], ...Object.entries(REL_COLOR).flat(), '#ffffff'] as unknown as ExpressionSpecification, opacity: zoomFade(ownedOnly, 0.6, 0.18) }
    case 'blocs': return { color: ['to-color', ['coalesce', ['feature-state', 'bloc'], '#495057']], opacity: zoomFade(o => ['+', ['case', ['!=', ['coalesce', ['feature-state', 'bloc'], ''], ''], o, ['case', owned, 0.12, 0]], hoverBoost], 0.65, 0.2) }
    case 'terrain': return { color: ['match', ['get', 'terrain'], ...Object.entries(TERRAIN).flatMap(([k, v]) => [k, v.color]), '#888'] as unknown as ExpressionSpecification, opacity: zoomFade(all, 0.72, 0.25) }
    case 'resources': {
      const has: ExpressionSpecification = ['any', ['>', ['get', 'oil'], 0], ['>', ['get', 'metals'], 0], ['get', 'strait'], ['>', ['get', 'fertility'], 0]]
      return {
        color: ['case', ['>', ['get', 'oil'], 0], ['interpolate', ['linear'], ['get', 'oil'], 1, '#d0a2ff', 3, '#8b2fe0'], ['>', ['get', 'metals'], 0], ['interpolate', ['linear'], ['get', 'metals'], 1, '#d9a35b', 3, '#ff6b00'], ['get', 'strait'], '#22d3ee', ['>', ['get', 'fertility'], 0], ['interpolate', ['linear'], ['get', 'fertility'], 1, '#8fd16a', 3, '#2b9a3e'], '#334'],
        opacity: zoomFade(o => ['+', ['case', has, o, 0.1], hoverBoost], 0.8, 0.3),
      }
    }
    case 'industry': return { color: ['match', ['coalesce', ['feature-state', 'top'], -1], ...SECTORS.flatMap((s, i) => [i, s.color]), '#333'] as unknown as ExpressionSpecification, opacity: zoomFade(all, 0.75, 0.3) }
    case 'wealth': return { color: ['interpolate', ['linear'], ['coalesce', ['feature-state', 'gdppc'], 0], 0, '#3b0f0f', 2000, '#7a1f1f', 6000, '#c2410c', 15000, '#eab308', 30000, '#84cc16', 50000, '#22c55e', 80000, '#a5f3fc'], opacity: zoomFade(all, 0.75, 0.3) }
    case 'development': return { color: ['interpolate', ['linear'], ['coalesce', ['feature-state', 'dev'], 0], 0, '#2a0845', 30, '#6441a5', 55, '#2c7be5', 75, '#00d97e', 90, '#e6fffa'], opacity: zoomFade(all, 0.75, 0.3) }
    case 'population': return { color: ['interpolate', ['linear'], ['coalesce', ['feature-state', 'pop'], 0], 0, '#0b1d3a', 500, '#1f4e8c', 3000, '#3f8fd2', 10000, '#f2c14e', 30000, '#f25c54', 80000, '#ffffff'], opacity: zoomFade(all, 0.75, 0.3) }
    case 'unrest': return { color: ['interpolate', ['linear'], ['coalesce', ['feature-state', 'unrest'], 0], 0, '#2b8a3e', 30, '#fab005', 60, '#f76707', 85, '#c92a2a'], opacity: zoomFade(ownedOnly, 0.7, 0.3) }
    case 'influence': return { color: ['case', ['==', ['feature-state', 'rel'], 'self'], '#ffd43b', ['interpolate', ['linear'], ['coalesce', ['feature-state', 'infl'], 0], 0, '#1b1b2f', 10, '#3a0ca3', 25, '#7209b7', 45, '#f72585', 70, '#ffd6ff']], opacity: zoomFade(ownedOnly, 0.7, 0.25) }
  }
}
function applyMode() {
  if (!map || !ready) return
  const { color, opacity } = fillPaint(ui.mapMode)
  map.setPaintProperty('prov-fill', 'fill-color', color)
  map.setPaintProperty('prov-fill', 'fill-opacity', opacity)
}
function applyBasemap() {
  if (!map || !ready) return
  const night = ui.basemap === 'night'
  map.setLayoutProperty('night', 'visibility', night ? 'visible' : 'none')
  map.setPaintProperty('sat', 'raster-opacity', night ? 0 : 1)
  map.setPaintProperty('city-glow', 'circle-opacity', night ? 0.75 : 0.25)
  map.setPaintProperty('prov-grid', 'line-opacity', night ? 0.04 : ['interpolate', ['linear'], ['zoom'], 1, 0.04, 5, 0.12])
}

// ───────── dynamic state → map ─────────
const last = new Map<number, Record<string, unknown>>()
let borderKey = '', cityKey = '', badgeKey = ''
const edgeCache = new Map<string, number[][]>()
let h3Index = new Map<string, number>()
let routes: { coords: number[][]; value: number; color: string; len: number }[] = []

function syncState() {
  const s = snap.value, P = provinces.value
  if (!map || !ready || !s || !P.length) return
  const m = me.value
  const blocColor = new Map<number, string>()
  for (const b of s.tradeBlocs) for (const id of b.members) blocColor.set(id, b.color)
  for (let i = 0; i < P.length; i++) {
    const o = s.prov.owner[i]
    const nat = o >= 0 ? nations.value.get(o) : undefined
    const next: Record<string, unknown> = {
      owner: o, color: nat?.color ?? '', rel: o >= 0 ? relation(o) : 'none', pop: s.prov.pop[i], unrest: s.prov.unrest[i],
      gdppc: s.prov.gdppc[i], dev: s.prov.dev[i], top: s.prov.top[i], bloc: o >= 0 ? blocColor.get(o) ?? '' : '',
      infl: m && o >= 0 && o !== m.id ? m.partners.find(p => p.id === o)?.influenceOver ?? 0 : 0,
    }
    const prev = last.get(i)
    const diff: Record<string, unknown> = {}
    let changed = false
    for (const k in next) if (!prev || prev[k] !== next[k]) { diff[k] = next[k]; changed = true }
    if (changed) { map.setFeatureState({ source: 'prov', id: i }, diff); last.set(i, next) }
  }
  const key = s.prov.owner.join(',') + '|' + s.nations.map(n => n.id + n.color + n.wars.join('.')).join(';')
  if (key !== borderKey) {
    borderKey = key
    ;(map.getSource('borders') as GeoJSONSource).setData(buildBorders())
    ;(map.getSource('labels') as GeoJSONSource).setData(buildLabels())
  }
  if (s.tick % 7 === 0 || !cityKey) updateCities()
  updateBadges()
  ;(map.getSource('capitals') as GeoJSONSource).setData(fc(s.nations.filter(n => P[n.capital]).map(n => pt(P[n.capital].lon, P[n.capital].lat, { color: n.color }))))
  // armies
  ;(map.getSource('armies') as GeoJSONSource).setData(fc(P.filter(p => s.prov.owner[p.id] >= 0 && s.prov.garrison[p.id] >= 5).map(p => {
    const n = nations.value.get(s.prov.owner[p.id])
    return pt(p.lon + 0.6, p.lat - 0.5, { n: fmtTroops(s.prov.garrison[p.id]), color: n?.color ?? '#fff', icon: `army-${s.prov.owner[p.id]}` })
  })))
  for (const n of s.nations) if (!map.hasImage(`army-${n.id}`)) map.addImage(`army-${n.id}`, shield(n.color), { pixelRatio: 2 })
  // trade routes (top flows) between capitals
  const flows = s.trade.slice(0, 70)
  const maxV = flows[0]?.[2] ?? 1
  routes = flows.flatMap(([a, b, v]) => {
    const na = nations.value.get(a), nb = nations.value.get(b)
    if (!na || !nb || !P[na.capital] || !P[nb.capital]) return []
    const coords = arc([P[na.capital].lon, P[na.capital].lat], [P[nb.capital].lon, P[nb.capital].lat])
    return [{ coords, value: v / maxV, color: na.color, len: coords.length }]
  })
  ;(map.getSource('trade') as GeoJSONSource).setData(fc(routes.map(r => ({ type: 'Feature', properties: { w: r.value, color: r.color }, geometry: { type: 'LineString', coordinates: r.coords } }))))
  ;(map.getSource('battles') as GeoJSONSource).setData(fc(s.battles.map(b => ({ type: 'Feature', properties: { color: nations.value.get(b.attacker)?.color ?? '#fff' }, geometry: { type: 'LineString', coordinates: arc([P[b.from].lon, P[b.from].lat], [P[b.to].lon, P[b.to].lat], 12) } }))))
}

function updateCities() {
  const s = snap.value!, P = provinces.value, C = cities.value
  if (!C.length) return
  const capitalCity = new Set<number>()
  for (const n of s.nations) { const p = P[n.capital]; if (p?.cities.length) capitalCity.add(p.cities.reduce((a, b) => (C[a].pop >= C[b].pop ? a : b))) }
  const feats = C.map(c => {
    const gpc = s.prov.gdppc[c.province] || 3000
    const wealth = gpc > 35000 ? 2 : gpc > 9000 ? 1 : 0
    // scale real city size with the province's population change since 2030
    const growth = s.prov.pop[c.province] / Math.max(1, P[c.province].pop)
    const pop = c.pop * growth
    const size = pop > 10000 ? 4 : pop > 3000 ? 3 : pop > 1000 ? 2 : pop > 300 ? 1 : 0
    return pt(c.lon, c.lat, { name: c.name, pop, size, icon: `city-${size}-${wealth}${ui.basemap === 'night' ? 'n' : ''}`, cap: capitalCity.has(c.id) })
  })
  cityKey = String(s.tick)
  ;(map!.getSource('cities') as GeoJSONSource).setData(fc(feats))
}

function updateBadges() {
  const s = snap.value!, P = provinces.value
  const key = s.prov.top.join(',') + s.prov.owner.join(',') + s.prov.build.join(',')
  if (key === badgeKey) return
  badgeKey = key
  const feats: Feature[] = []
  for (const p of P) {
    if (s.prov.owner[p.id] < 0 || s.prov.pop[p.id] < 150) continue
    const t = s.prov.top[p.id]
    feats.push(pt(p.lon - 0.55, p.lat + 0.35, { icon: `ind-${t}` }))
    if (s.prov.build[p.id] >= 10) feats.push(pt(p.lon + 0.55, p.lat + 0.45, { icon: 'crane' }))
  }
  ;(map!.getSource('badges') as GeoJSONSource).setData(fc(feats))
}

function edgeCoords(e: string) {
  let c = edgeCache.get(e)
  if (!c) { c = unwrap(h3.directedEdgeToBoundary(e, true)); edgeCache.set(e, c) }
  return c
}
function buildBorders() {
  const s = snap.value!, P = provinces.value
  const features: Feature[] = []
  for (const p of P) {
    const o = s.prov.owner[p.id]
    if (o < 0) continue
    const n = nations.value.get(o)
    for (const e of h3.originToDirectedEdges(p.h3)) {
      const q = h3Index.get(h3.getDirectedEdgeDestination(e))
      const qo = q === undefined ? -2 : s.prov.owner[q]
      if (qo === o) continue
      features.push({ type: 'Feature', properties: { color: n?.color ?? '#fff', front: qo >= 0 && !!n?.wars.includes(qo) }, geometry: { type: 'LineString', coordinates: edgeCoords(e) } })
    }
  }
  return fc(features)
}
function buildLabels() {
  const s = snap.value!, P = provinces.value
  const groups = new Map<number, number[]>()
  s.prov.owner.forEach((o, i) => { if (o >= 0) (groups.get(o) ?? groups.set(o, []).get(o)!).push(i) })
  const features: Feature[] = []
  for (const [id, list] of groups) {
    const n = nations.value.get(id)
    if (!n) continue
    let x = 0, y = 0, z = 0
    for (const i of list) { const la = (P[i].lat * Math.PI) / 180, lo = (P[i].lon * Math.PI) / 180; x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la) }
    const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI, lon = (Math.atan2(y, x) * 180) / Math.PI
    const anchor = list.reduce((best, i) => { const d = (P[i].lat - lat) ** 2 + (P[i].lon - lon) ** 2; return d < best.d ? { i, d } : best }, { i: list[0], d: Infinity }).i
    features.push(pt(P[anchor].lon, P[anchor].lat, { name: n.name, size: Math.min(22, 10 + Math.sqrt(list.length) * 2.2) }))
  }
  return fc(features)
}

function addSprites() {
  if (!map) return
  for (let s = 0; s < 5; s++) for (let w = 0; w < 3; w++) {
    map.addImage(`city-${s}-${w}`, cityIcon(s, w), { pixelRatio: 2 })
    map.addImage(`city-${s}-${w}n`, cityIcon(s, w, true), { pixelRatio: 2 })
  }
  SECTORS.forEach((sec, i) => map!.addImage(`ind-${i}`, badge(sec.icon, sec.color), { pixelRatio: 2 }))
  map.addImage('crane', badge('🏗', '#ffd43b'), { pixelRatio: 2 })
  map.addImage('ship', ship(), { pixelRatio: 2 })
}

function initLayers() {
  if (!map) return
  const P = provinces.value
  h3Index = new Map(P.map(p => [p.h3, p.id]))
  addSprites()
  map.addSource('prov', { type: 'geojson', data: provinceGeoJSON(P) })
  for (const id of ['borders', 'labels', 'capitals', 'battles', 'battle-heads', 'cities', 'badges', 'armies', 'trade', 'ships']) map.addSource(id, { type: 'geojson', data: fc([]) })

  map.addLayer({ id: 'prov-fill', type: 'fill', source: 'prov', paint: { 'fill-color': '#000', 'fill-opacity': 0 } })
  map.addLayer({ id: 'prov-grid', type: 'line', source: 'prov', paint: { 'line-color': '#ffffff', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.04, 5, 0.12], 'line-width': 0.6 } })
  map.addLayer({ id: 'trade', type: 'line', source: 'trade', layout: { 'line-cap': 'round', visibility: ui.showTrade ? 'visible' : 'none' },
    paint: { 'line-color': ['get', 'color'], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.55, 6, 0.2], 'line-width': ['interpolate', ['linear'], ['get', 'w'], 0, 0.6, 1, 3.5], 'line-dasharray': [0, 4, 3] } })
  map.addLayer({ id: 'ships', type: 'symbol', source: 'ships', layout: { 'icon-image': 'ship', 'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.35, 5, 0.7], 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, visibility: ui.showTrade ? 'visible' : 'none' } })
  map.addLayer({ id: 'borders', type: 'line', source: 'borders', filter: ['!', ['get', 'front']], layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 1.2, 5, 2.6, 8, 4], 'line-opacity': 0.95 } })
  map.addLayer({ id: 'fronts', type: 'line', source: 'borders', filter: ['get', 'front'], paint: { 'line-color': '#ff3b3b', 'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2, 5, 4], 'line-dasharray': [1.5, 1] } })
  map.addLayer({ id: 'prov-hover', type: 'line', source: 'prov', filter: ['==', ['id'], -1], paint: { 'line-color': '#ffffff', 'line-width': 1.5, 'line-opacity': 0.8 } })
  map.addLayer({ id: 'prov-selected', type: 'line', source: 'prov', filter: ['==', ['id'], -1], paint: { 'line-color': '#ffd43b', 'line-width': 3 } })
  map.addLayer({ id: 'city-glow', type: 'circle', source: 'cities', paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, ['*', 0.6, ['^', ['get', 'pop'], 0.33]], 6, ['*', 2.5, ['^', ['get', 'pop'], 0.33]]],
    'circle-color': '#ffcf70', 'circle-blur': 1, 'circle-opacity': 0.25 } })
  // city skylines and names appear progressively: megacities from orbit, towns up close
  for (const [size, iconZoom, labelZoom] of [[4, 2.4, 3.2], [3, 3.2, 4], [2, 4.2, 5], [1, 5.2, 6], [0, 6.2, 7]] as const) {
    map.addLayer({ id: `city-icons-${size}`, type: 'symbol', source: 'cities', minzoom: iconZoom, filter: ['==', ['get', 'size'], size],
      layout: { 'icon-image': ['get', 'icon'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.35, 5, 0.75, 8, 1.3], 'icon-anchor': 'bottom', 'symbol-sort-key': ['-', 0, ['get', 'pop']] } })
    map.addLayer({ id: `city-labels-${size}`, type: 'symbol', source: 'cities', minzoom: labelZoom, filter: ['==', ['get', 'size'], size],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10 + size * 0.8, 'text-offset': [0, 0.6], 'text-anchor': 'top', 'text-optional': true, 'symbol-sort-key': ['-', 0, ['get', 'pop']] },
      paint: { 'text-color': ['case', ['get', 'cap'], '#ffe066', '#e9ecef'], 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.4 } })
  }
  map.addLayer({ id: 'badges', type: 'symbol', source: 'badges', minzoom: 3.3, layout: { 'icon-image': ['get', 'icon'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 3.3, 0.35, 6, 0.6], 'icon-allow-overlap': true } })
  map.addLayer({ id: 'armies', type: 'symbol', source: 'armies', minzoom: 2.8,
    layout: { 'icon-image': ['get', 'icon'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.4, 6, 0.7], 'icon-allow-overlap': true, 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': 10, 'text-offset': [0, 1.5], 'text-allow-overlap': true },
    paint: { 'text-color': '#fff', 'text-halo-color': '#000', 'text-halo-width': 1.2 } })
  map.addLayer({ id: 'battles', type: 'line', source: 'battles', paint: { 'line-color': '#ff4d4d', 'line-width': 3, 'line-dasharray': [2, 1] } })
  map.addLayer({ id: 'battle-heads', type: 'circle', source: 'battle-heads', paint: { 'circle-radius': 7, 'circle-color': '#ff4d4d', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
  map.addLayer({ id: 'capitals', type: 'circle', source: 'capitals', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.5, 6, 6], 'circle-color': '#ffffff', 'circle-stroke-color': ['get', 'color'], 'circle-stroke-width': 2 } })
  map.addLayer({ id: 'nation-labels', type: 'symbol', source: 'labels',
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': ['get', 'size'], 'text-transform': 'uppercase', 'text-letter-spacing': 0.12, 'text-max-width': 8 },
    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.9)', 'text-halo-width': 1.8, 'text-opacity': ['interpolate', ['linear'], ['zoom'], 4.5, 1, 6, 0.25] } })

  map.on('mousemove', 'prov-fill', e => {
    const f = e.features?.[0]
    if (!f || !map) return
    const id = f.id as number
    if (hover.value?.id !== id) {
      if (hover.value) map.setFeatureState({ source: 'prov', id: hover.value.id }, { hover: false })
      map.setFeatureState({ source: 'prov', id }, { hover: true })
      map.setFilter('prov-hover', ['==', ['id'], id])
    }
    hover.value = { x: e.point.x, y: e.point.y, id }
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', 'prov-fill', () => {
    if (hover.value && map) map.setFeatureState({ source: 'prov', id: hover.value.id }, { hover: false })
    hover.value = null
    map?.setFilter('prov-hover', ['==', ['id'], -1])
    if (map) map.getCanvas().style.cursor = ''
  })
  map.on('click', 'prov-fill', e => { const id = e.features?.[0]?.id as number | undefined; if (id != null) select(id) })
  map.on('dblclick', 'prov-fill', e => { const id = e.features?.[0]?.id as number | undefined; if (id != null) { e.preventDefault(); ui.provinceView = id } })

  ready = true
  applyMode(); applyBasemap(); syncState()
  animate()
}

// ───────── animation: trade dashes, ships, advancing armies ─────────
const DASH = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0], [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5], [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5]]
let frame = 0, lastShip = 0
function animate() {
  raf = requestAnimationFrame(animate)
  if (!map || !ready) return
  const now = performance.now()
  if (now - lastShip < 66) return
  lastShip = now
  frame++
  if (ui.showTrade) {
    map.setPaintProperty('trade', 'line-dasharray', DASH[Math.floor(frame / 2) % DASH.length])
    const t = now / 40000
    ;(map.getSource('ships') as GeoJSONSource).setData(fc(routes.slice(0, 45).flatMap((r, i) => {
      const f = (t * (0.6 + (i % 5) * 0.15) + i * 0.137) % 1
      const k = Math.min(r.len - 2, Math.floor(f * (r.len - 1)))
      const a = r.coords[k], b = r.coords[k + 1]
      const rot = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI - 90
      return [pt(a[0] + (b[0] - a[0]) * ((f * (r.len - 1)) % 1), a[1] + (b[1] - a[1]) * ((f * (r.len - 1)) % 1), { rot })]
    })))
  }
  const s = snap.value
  if (s?.battles.length) {
    const dayFrac = Math.min(1, (now - ui.lastTickAt) / (s.dayMs || 1))
    const P = provinces.value
    ;(map.getSource('battle-heads') as GeoJSONSource).setData(fc(s.battles.map(b => {
      const f = Math.min(1, (s.tick - b.start + dayFrac) / Math.max(1, b.arrive - b.start))
      return pt(P[b.from].lon + (P[b.to].lon - P[b.from].lon) * f, P[b.from].lat + (P[b.to].lat - P[b.from].lat) * f)
    })))
  } else if (frame % 30 === 0) (map.getSource('battle-heads') as GeoJSONSource).setData(fc([]))
}

function spin() {
  if (!map || !spinning) return
  const c = map.getCenter()
  map.easeTo({ center: [c.lng + 4, c.lat], duration: 1000, easing: x => x })
}

onMounted(() => {
  map = new maplibregl.Map({
    container: el.value!,
    style: {
      version: 8,
      projection: { type: 'globe' },
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
      sources: {
        sat: { type: 'raster', tiles: [SAT], tileSize: 256, maxzoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
        nightsrc: { type: 'raster', tiles: [NIGHT], tileSize: 256, maxzoom: 8, attribution: 'Night lights © NASA Earth Observatory / VIIRS Black Marble' },
      },
      layers: [
        { id: 'space', type: 'background', paint: { 'background-color': '#03060c' } },
        { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-saturation': -0.3, 'raster-brightness-max': 0.8, 'raster-contrast': 0.1 } },
        { id: 'night', type: 'raster', source: 'nightsrc', layout: { visibility: 'none' }, paint: { 'raster-brightness-max': 1, 'raster-contrast': 0.25 } },
      ],
    },
    center: [45, 25], zoom: 1.6, maxZoom: 12, doubleClickZoom: false,
    attributionControl: { compact: true },
  })
  if (import.meta.dev) (window as unknown as { __map: MLMap }).__map = map
  const stop = () => { spinning = false }
  map.on('mousedown', stop); map.on('touchstart', stop); map.on('wheel', stop)
  map.on('moveend', () => { if (spinning) spin() })
  map.once('style.load', () => { spin(); if (provinces.value.length && cities.value.length) initLayers() })
})

watch([provinces, cities], ([P, C]) => { if (P.length && C.length && map?.style?._loaded && !ready) initLayers() })
watch([snap, () => me.value?.wars.join(), () => me.value?.allies.join(), () => me.value?.pacts.join()], syncState)
watch(() => ui.mapMode, applyMode)
watch(() => ui.basemap, () => { applyBasemap(); if (ready) updateCities() })
watch(() => ui.showTrade, v => { if (!map || !ready) return; map.setLayoutProperty('trade', 'visibility', v ? 'visible' : 'none'); map.setLayoutProperty('ships', 'visibility', v ? 'visible' : 'none') })
watch(() => ui.selected, id => { if (ready) map?.setFilter('prov-selected', ['==', ['id'], id ?? -1]) })
watch(() => ui.flyTo?.seq, () => {
  if (!map || !ui.flyTo) return
  spinning = false
  map.flyTo({ center: [ui.flyTo.lon, ui.flyTo.lat], zoom: ui.flyTo.zoom ?? 4, speed: 1.2, curve: 1.4 })
})
onBeforeUnmount(() => { cancelAnimationFrame(raf); map?.remove(); map = null })

function hoverInfo(id: number) {
  const p = provinces.value[id], s = snap.value
  if (!p || !s) return null
  const o = s.prov.owner[id]
  return { p, owner: o >= 0 ? nations.value.get(o) : null, pop: s.prov.pop[id], garrison: s.prov.garrison[id], gdppc: s.prov.gdppc[id], top: SECTORS[s.prov.top[id]], unrest: s.prov.unrest[id] }
}
</script>

<template>
  <div class="globe-wrap">
    <div ref="el" class="globe" />
    <div v-if="hover && hoverInfo(hover.id)" class="hover-tip" :style="{ left: hover.x + 16 + 'px', top: hover.y + 12 + 'px' }">
      <template v-for="info in [hoverInfo(hover.id)!]" :key="info.p.id">
        <div class="ht-name">{{ info.p.name }} <span class="muted">· {{ info.p.region !== info.p.name ? info.p.region : '' }}</span></div>
        <div class="ht-owner" :style="{ color: info.owner?.color ?? '#adb5bd' }">{{ info.owner?.name ?? 'Unclaimed land' }}</div>
        <div class="ht-row">{{ TERRAIN[info.p.terrain].label }} · {{ fmtPop(info.pop) }} · {{ fmtUsd(info.gdppc) }}/cap</div>
        <div class="ht-row">{{ info.top.icon }} {{ info.top.label }}<span v-if="info.owner"> · {{ fmtTroops(info.garrison) }} troops</span><span v-if="info.unrest > 40" class="bad"> · unrest {{ info.unrest }}%</span></div>
        <div class="ht-tags">
          <span v-if="info.p.oil" class="tag oil">Oil {{ '●'.repeat(info.p.oil) }}</span>
          <span v-if="info.p.metals" class="tag metals">Metals {{ '●'.repeat(info.p.metals) }}</span>
          <span v-if="info.p.fertility" class="tag food">Fertile {{ '●'.repeat(info.p.fertility) }}</span>
          <span v-if="info.p.attraction" class="tag">Attractions {{ '★'.repeat(info.p.attraction) }}</span>
          <span v-if="info.p.strait" class="tag strait">{{ info.p.strait }}</span>
          <span v-else-if="info.p.coastal" class="tag coast">Coastal</span>
        </div>
        <div class="ht-hint muted">Click to inspect · double-click to enter</div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.globe-wrap { position: absolute; inset: 0; }
.globe { position: absolute; inset: 0; background: radial-gradient(ellipse at center, #0b1630 0%, #03060c 70%); }
.hover-tip { position: absolute; pointer-events: none; z-index: 5; min-width: 200px; max-width: 290px; background: rgba(10, 14, 22, 0.94); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 12px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); }
.ht-name { font-weight: 700; font-size: 13px; }
.ht-owner { font-weight: 600; margin: 1px 0 3px; }
.ht-row { color: #c8cfda; margin-top: 1px; }
.ht-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.ht-hint { font-size: 10.5px; margin-top: 5px; }
</style>
