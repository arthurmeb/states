// Generates the world's province grid from real geography.
// Provinces are H3 resolution-2 hexes (~86k km²) over real land, tagged with
// terrain, resources, population and coast/strait access derived from real-world data.
// Output: public/world/{provinces,cities,countries}.json (shared by client + server)
// Requires data/raw from scripts/fetch-data.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as h3 from 'h3-js'
import { feature } from 'topojson-client'

const require = createRequire(import.meta.url)
const RES = 2

const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-50m.json'), 'utf8'))
const land = feature(topo, topo.objects.land)
// Planar point-in-polygon with per-polygon bounding boxes (d3's spherical test is far too slow here).
const polys = []
for (const f of land.features ?? [land]) {
  const g = f.geometry
  const list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  for (const rings of list) {
    let [x0, y0, x1, y1] = [180, 90, -180, -90]
    for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    if (y1 < -58) continue // Antarctica
    polys.push({ rings, bbox: [x0, y0, x1, y1] })
  }
}
function inRing(x, y, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
function isLand(lat, lon) {
  for (const { rings, bbox } of polys) {
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue
    if (inRing(lon, lat, rings[0]) && !rings.slice(1).some(h => inRing(lon, lat, h))) return true
  }
  return false
}

// ---------- geo helpers ----------
const R = 6371
const toRad = d => (d * Math.PI) / 180
function distKm(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
const inBox = (lat, lon, [a, b, c, d]) => lat >= a && lat <= b && lon >= c && lon <= d
// strongest level among [lat, lon, radiusKm, level] points that cover this location
function levelAt(lat, lon, pts) {
  let best = 0
  for (const [la, lo, r, lvl] of pts) if (lvl > best && distKm(lat, lon, la, lo) <= r) best = lvl
  return best
}
function unwrapRing(ring) {
  const lons = ring.map(p => p[0])
  if (Math.max(...lons) - Math.min(...lons) > 180) return ring.map(([x, y]) => [x < 0 ? x + 360 : x, y])
  return ring
}

// ---------- real-world geography tables ----------
const DESERTS = [
  [16, 30, -14, 30], [16, 30, 37, 56], [30, 34, 37, 42], [26, 33, 55, 68], [24, 29, 69, 74],
  [37, 41, 76, 90], [40, 46, 95, 111], [37, 44, 53, 66], [-31, -19, 118, 142], [-27, -19, 13, 24],
  [-27, -17, -71, -68.5], [27, 37, -117, -109],
]
const ARID = [[-50, -40, -71, -65], [43, 50, 46, 60], [30, 40, -112, -100], [20, 30, -112, -102], [12, 16, -16, 40]]
const JUNGLE = [[-12, 4, -74, -50], [-5, 4, 12, 29], [-10, 8, 95, 152], [7, 18, -92, -77], [4, 8, -12, -2]]
const MOUNTAINS = [
  [30, 82, 500], [32, 90, 600], [35, 96, 500], [28, 87, 300], [36, 74, 300], [39, 72, 300], [42, 80, 300],
  [5, -75, 250], [-2, -78, 250], [-10, -76, 250], [-16, -69, 300], [-23, -67, 250], [-30, -69.5, 200], [-38, -71, 200], [-46, -72, 200],
  [38, -106, 350], [44, -110, 350], [50, -117, 330], [56, -124, 300], [62, -135, 350],
  [46.5, 10, 200], [42.5, 44, 200], [32, 50, 220], [39, 41, 250], [9, 38.5, 300], [31.5, -6, 180],
  [64, 13, 250], [60, 59, 180], [35, 69, 250], [27, 101, 300], [-5, 141, 250], [49, 88, 250],
].map(p => [...p, 1])
const FERTILE = [
  [41, -92, 600, 3], [40, -99, 400, 2], [37, -120, 200, 2], [-34, -61, 450, 3], [-23, -50, 400, 2], [49, 32, 500, 3],
  [51, 42, 500, 2], [47, 2, 400, 2], [45, 10, 150, 2], [52, 15, 450, 2], [36, 116, 450, 3], [30, 115, 450, 3],
  [30, 105, 200, 2], [26, 84, 550, 3], [31, 74, 300, 3], [27, 31, 180, 3], [30.5, 31, 150, 3], [33, 44, 250, 2],
  [-7, 110, 250, 3], [15, 102, 350, 2], [23.5, 90, 250, 3], [52, 68, 500, 1], [51, -106, 450, 2], [-31, 149, 300, 1],
  [-32, 117, 150, 1], [10, 8, 350, 1], [0, 32, 300, 2], [20, -101, 250, 1], [36, 139, 200, 1], [36, 127.5, 200, 1],
  [39, 33, 300, 1], [39, -4, 350, 1], [52.5, -1, 250, 2], [15, 121, 200, 1], [37, 50, 150, 1], [40.8, 71.5, 150, 2],
  [11, 106, 200, 2], [21, 106, 150, 2], [-38, 145, 200, 1], [44, -79, 250, 1], [34, -84, 400, 1],
]
const OIL = [
  [27, 49.5, 450, 3], [30.5, 47.5, 250, 3], [31, 49, 200, 3], [24, 54, 250, 3], [25.3, 51.2, 150, 3], [61, 72, 600, 3],
  [54, 53, 350, 2], [46, 52, 300, 2], [40.4, 49.9, 150, 2], [31.5, -102, 300, 2], [29.5, -94, 300, 2], [48, -103, 200, 1],
  [56, -113, 350, 2], [70, -150, 300, 2], [9, -66, 300, 3], [19, -93, 250, 2], [5, 6, 250, 2], [29, 19, 350, 2],
  [31, 6, 300, 2], [-8, 13.5, 200, 1], [58, 2, 350, 2], [-22, -41, 150, 1], [1, 101.5, 250, 1], [2, 114, 250, 1],
  [46.5, 125, 200, 1], [42, 85, 250, 1], [21, 57, 250, 1], [35.5, 44.4, 150, 2], [-1, -77, 150, 1], [7, -73, 150, 1],
]
const METALS = [
  [-24, -69, 350, 3], [-12, -76, 300, 2], [-11, 27, 300, 3], [-13, 28, 200, 2], [-26, 28, 300, 3], [-22, 119, 400, 3],
  [-30, 121, 250, 2], [58, 60, 350, 2], [69, 88, 250, 2], [41.8, 110, 250, 3], [25.5, 115, 200, 2], [48, 72, 350, 2],
  [47, -81, 350, 2], [53, -67, 300, 2], [-19.5, -44, 300, 3], [-6, -50, 250, 2], [11, -12, 250, 2], [33, -111, 300, 2],
  [67.8, 20.2, 200, 2], [43.5, 106, 250, 2], [-4, 137, 200, 2], [62, 129, 400, 2], [-19.6, -65.7, 200, 2],
  [-1.5, 29, 200, 2], [-19, 30, 250, 1], [32, -7, 200, 1],
]
const CHOKEPOINTS = [
  ['Strait of Hormuz', 26.5, 56.3], ['Strait of Malacca', 2.5, 101.5], ['Singapore Strait', 1.3, 103.8],
  ['Suez', 30.5, 32.3], ['Gibraltar', 36, -5.5], ['Bosporus', 41.1, 29], ['Panama', 9, -79.6],
  ['Bab-el-Mandeb', 12.6, 43.3], ['English Channel', 51, 1.4], ['Danish Straits', 55.5, 11],
  ['Taiwan Strait', 24.5, 119.5], ['Cape of Good Hope', -34, 18.5], ['Strait of Magellan', -53, -70.5],
]
const POP = [
  [35.7, 139.7, 40, 250], [34.7, 135.5, 20, 200], [37.5, 127, 26, 200], [31.2, 121.5, 60, 350], [39.9, 116.4, 50, 350],
  [23.1, 113.3, 70, 300], [30.6, 104, 60, 300], [35, 115, 150, 450], [30, 113, 100, 400], [24, 121, 23, 150],
  [14.6, 121, 40, 300], [-7, 110, 140, 350], [13.7, 100.5, 30, 300], [21, 105.8, 40, 250], [10.8, 106.7, 30, 200],
  [28.6, 77.2, 80, 350], [26, 83, 250, 450], [23.7, 90.4, 200, 300], [19, 73, 60, 300], [12, 78, 180, 450],
  [24.9, 67, 30, 250], [31.5, 74, 100, 300], [35.7, 51.4, 40, 350], [41, 29, 25, 250], [39, 35, 40, 400],
  [30, 31.2, 90, 200], [24.7, 46.7, 15, 300], [25, 51, 12, 250], [33.3, 44.4, 35, 300], [6.5, 3.4, 80, 300],
  [12, 8.5, 60, 350], [-4.3, 15.3, 40, 350], [0, 36, 90, 450], [9, 38.7, 100, 400], [-26, 28, 40, 350],
  [55.7, 37.6, 40, 350], [49, 6, 120, 500], [52.5, -1.5, 60, 300], [42.5, 12.5, 55, 300], [40, -3.7, 45, 350],
  [52, 20, 40, 300], [49, 31, 40, 400], [40.7, -74, 70, 350], [41.8, -87.6, 50, 450], [33.7, -84.4, 60, 450],
  [31, -97, 30, 350], [35, -119, 40, 350], [19.4, -99.1, 90, 400], [4.7, -74, 40, 350], [-12, -77, 30, 300],
  [-23.5, -46.6, 90, 400], [-8, -36, 50, 350], [-34.6, -58.4, 40, 300], [-33.4, -70.6, 18, 200], [-33.9, 151.2, 20, 300],
  [43.7, -79.4, 25, 300], [34, -4, 60, 450], [41, 67, 35, 350], [19, 96, 55, 350], [3, 101.7, 25, 250],
  [45, 126, 40, 350], [6, -1, 50, 350], [14, -15, 30, 350], [-18, 47, 25, 300], [-6, 35, 50, 450],
]
const TERRAIN_BASE_POP = { plains: 1400, farmland: 2600, boreal: 90, tundra: 15, ice: 0, desert: 60, arid: 300, savanna: 900, jungle: 450, mountains: 350 }

function classify(lat, lon) {
  let t
  const a = Math.abs(lat)
  if (inBox(lat, lon, [60, 84, -74, -10])) return 'ice'
  if (a >= 66) t = 'tundra'
  else if (lat >= 58 || (lat >= 52 && (lon < -55 || lon > 60))) t = 'boreal'
  else if (a < 23) t = 'savanna'
  else t = 'plains'
  if (JUNGLE.some(b => inBox(lat, lon, b))) t = 'jungle'
  if (ARID.some(b => inBox(lat, lon, b))) t = 'arid'
  if (DESERTS.some(b => inBox(lat, lon, b))) t = 'desert'
  const fert = levelAt(lat, lon, FERTILE)
  if (fert >= 2 && t !== 'tundra' && t !== 'boreal') t = 'farmland'
  if (levelAt(lat, lon, MOUNTAINS)) t = 'mountains'
  return t
}

// ---------- naming ----------
const SYL = {
  euro: [['Al', 'Bre', 'Cor', 'Dal', 'Ev', 'Fal', 'Gal', 'Hel', 'Lor', 'Mar', 'Nor', 'Os', 'Rav', 'Sel', 'Tor', 'Val', 'Wes'], ['an', 'en', 'ia', 'or', 'il', 'ar', 'es', 'ond', 'ing'], ['', 'ia', 'land', 'mark', 'shire', 'heim', 'onne', 'ica', 'mont']],
  slavic: [['Bor', 'Vla', 'Kra', 'Mir', 'Novo', 'Sve', 'Yar', 'Zel', 'Dob', 'Ros', 'Vol', 'Tver', 'Kaz'], ['o', 'a', 'e', 'i', 'ov', 'en'], ['grad', 'sk', 'ovia', 'ava', 'ny', 'mir', 'slav', 'ets']],
  north: [['Tai', 'Yak', 'Oro', 'Ner', 'Khan', 'Alt', 'Ury', 'Evo', 'Kol', 'Ang', 'Lena'], ['ga', 'ar', 'yn', 'ul', 'ir', 'ek'], ['sk', 'ai', 'kan', 'ga', 'ya', 'tur', '']],
  mena: [['Al', 'Bas', 'Dar', 'Fa', 'Ha', 'Ja', 'Kha', 'Ma', 'Na', 'Qa', 'Ra', 'Sa', 'Ta', 'Za'], ['bir', 'dar', 'har', 'lid', 'mar', 'sir', 'wad', 'rab', 'zan'], ['', 'a', 'iya', 'an', 'is', 'ah', 'abad']],
  steppe: [['Ak', 'Kar', 'Tash', 'Bal', 'Kyz', 'Sar', 'Tur', 'Ust', 'Er', 'Ord'], ['a', 'yl', 'ken', 'ar', 'ma'], ['stan', 'tau', 'kent', 'kol', 'su', 'abad']],
  southasia: [['Ra', 'Su', 'Ma', 'Ka', 'Vi', 'Ja', 'Pa', 'Go', 'Ha', 'De', 'Ba'], ['ja', 'ra', 'na', 'ha', 'la', 'da', 'ma'], ['pur', 'nagar', 'abad', 'garh', 'desh', 'pat', 'i']],
  eastasia: [['Shan', 'Hu', 'Lin', 'Jin', 'Kai', 'Tai', 'Han', 'Yun', 'Dong', 'Nan', 'Xi', 'Ka', 'Mi', 'Hok', 'Sei'], ['an', 'ling', 'zhou', 'yang', 'ma', 'sa', 'ko', 'ji'], ['', 'shan', 'hai', 'ning', 'do', 'kawa', 'su']],
  seasia: [['Ban', 'Su', 'Ma', 'Lu', 'Ka', 'Si', 'Pa', 'Ta', 'Bo', 'Ja', 'Min'], ['la', 'wa', 'ra', 'na', 'ya', 'ma', 'ba'], ['ng', 'pura', 'yan', 'kok', 'tra', 'nao', 'i']],
  africa: [['Ka', 'Ma', 'Nya', 'Zu', 'Ba', 'Ki', 'Lu', 'Mo', 'Ndo', 'Se', 'To', 'Wa', 'Ga'], ['ba', 'nga', 'li', 'mbe', 'si', 'la', 'wa', 'ko'], ['', 'ni', 'ra', 'nda', 'go', 'le', 'mbo']],
  oceania: [['Wa', 'Kur', 'Bun', 'Yar', 'Mun', 'Ger', 'Ala', 'Tar'], ['ra', 'ga', 'lin', 'ru', 'na'], ['ga', 'ra', 'dah', 'oo', 'ong', 'ie']],
  northam: [['Ash', 'Bel', 'Cedar', 'Clear', 'Fair', 'Green', 'High', 'Iron', 'Lake', 'Maple', 'Red', 'Silver', 'Stone', 'Wolf', 'Elk', 'Pine', 'Black', 'Bright', 'Cold', 'Oak', 'Bear', 'Eagle', 'Copper', 'Cotton'], ['', '', 'en', 'er', 'ing'], ['field', 'ford', 'ton', 'wood', 'ridge', 'vale', 'haven', 'brook', ' Plains', 'mont', ' Falls', 'burg', 'ville', ' Springs', ' Hills', 'wick']],
  latam: [['San', 'Santa', 'Al', 'Bel', 'Cor', 'Las', 'Mar', 'Rio', 'Ter', 'Val', 'Mon'], [' ', 'a', 'o', 'e'], ['dova', 'rosa', 'verde', 'mar', 'tierra', 'luz', 'alta', 'nera', 'sierra']],
}
function cultureOf(lat, lon) {
  if (lon < -30) return lat > 15 ? 'northam' : 'latam'
  if (lat < -11 && lon > 110) return 'oceania'
  if (lat < 12 && lon < 52) return 'africa'
  if (lat < 37 && lon < 63) return 'mena'
  if (lat >= 35 && lon < 25) return 'euro'
  if (lat >= 45 && lon < 60) return 'slavic'
  if (lat >= 50) return 'north'
  if (lat >= 35 && lon < 90) return 'steppe'
  if (lon < 92) return 'southasia'
  if (lat < 20) return 'seasia'
  return 'eastasia'
}
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
function nameFor(cell, culture, used) {
  const [p, m, s] = SYL[culture]
  let h = hashStr(cell)
  for (let attempt = 0; attempt < 20; attempt++) {
    const pick = arr => { const v = arr[h % arr.length]; h = Math.imul(h ^ (h >>> 13), 2654435761) >>> 0; return v }
    let n = pick(p) + pick(m) + pick(s)
    n = n.replace(/\s+/g, ' ').trim()
    n = n.charAt(0).toUpperCase() + n.slice(1)
    if (!used.has(n)) { used.add(n); return n }
  }
  const prefix = ['North ', 'South ', 'East ', 'West ', 'Upper ', 'Lower ', 'New ', 'Great ', 'Inner ', 'Outer ']
  const bases = [...used].filter(b => !/^(North|South|East|West|Upper|Lower|New|Great|Inner|Outer) /.test(b))
  for (let attempt = 0; attempt < 400; attempt++) {
    const n = prefix[(h + attempt) % prefix.length] + bases[(h + attempt * 7919) % bases.length]
    if (!used.has(n)) { used.add(n); return n }
  }
  return `${p[0]}${cell.slice(3, 6)}`
}

// ---------- build ----------
console.log('Scanning H3 cells…')
const cells = h3.getRes0Cells().flatMap(c => h3.cellToChildren(c, RES))
const landCells = []
for (const cell of cells) {
  const [lat, lon] = h3.cellToLatLng(cell)
  if (lat < -58) continue
  let ok = isLand(lat, lon)
  if (!ok) {
    const ring = unwrapRing(h3.cellToBoundary(cell, true))
    let hits = 0
    for (const [x, y] of ring) {
      if (isLand(y, x > 180 ? x - 360 : x)) hits++
      const mx = (x + (lon < 0 && x > 180 ? lon + 360 : lon)) / 2
      const my = (y + lat) / 2
      if (isLand(my, mx > 180 ? mx - 360 : mx)) hits++
    }
    ok = hits >= 2
  }
  if (ok) landCells.push(cell)
}
console.log(`${landCells.length} land provinces`)
const index = new Map(landCells.map((c, i) => [c, i]))

// ---------- real countries ----------
const countries = JSON.parse(readFileSync('data/raw/countries.json', 'utf8'))
const isoLib = require('i18n-iso-countries')
const ctopo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-50m.json'), 'utf8'))
const cfeat = feature(ctopo, ctopo.objects.countries)
const NAME_ISO = { Somaliland: 'SOM', Kosovo: 'XKX', 'N. Cyprus': 'CYP', 'Siachen Glacier': 'IND', 'Indian Ocean Ter.': 'AUS', Taiwan: 'TWN' }
const cpolys = []
for (const f of cfeat.features) {
  const iso = NAME_ISO[f.properties.name] ?? isoLib.numericToAlpha3(String(f.id).padStart(3, '0'))
  if (!iso) continue
  const g = f.geometry
  if (!g) continue
  for (const rings of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) {
    let [x0, y0, x1, y1] = [180, 90, -180, -90]
    for (const [x, y] of rings[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    cpolys.push({ iso, rings, bbox: [x0, y0, x1, y1] })
  }
}
function countryAt(lat, lon) {
  for (const { iso, rings, bbox } of cpolys) {
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue
    if (inRing(lon, lat, rings[0]) && !rings.slice(1).some(h => inRing(lon, lat, h))) return iso
  }
  return null
}

// Taiwan is not covered by the World Bank; public estimates (IMF WEO / DGBAS / Ministry of Education).
countries.TWN ??= {
  iso3: 'TWN', iso2: 'TW', name: 'Taiwan', region: 'East Asia & Pacific', income: 'High income', lat: 25.04, lon: 121.56, estimated: true,
  data: { gdppc_ppp: 73300, gdp_usd: 790e9, gdp_growth: 3.5, inflation: 2.2, unemployment: 3.4, agri_va: 1.5, industry_va: 37, manuf_va: 33, services_va: 61.5,
    exports_gdp: 65, imports_gdp: 55, hightech_exports: 60, resource_rents: 0.1, oil_rents: 0, mineral_rents: 0, tax_rev: 12, debt_gdp: 27, fdi_in: 1.5, rnd: 3.8,
    labor_part: 59, female_labor: 51, population: 23.4e6, pop_growth: -0.2, life_exp: 80.2, fertility: 0.87, urban: 80, age65: 18, age014: 12, literacy: 98.8,
    tertiary: 84, secondary: 99, edu_spend: 4.2, health_spend: 6.6, gini: 33.9, poverty: 0.5, child_mort: 4.4, homicide: 0.8, women_parl: 42, electricity: 100,
    internet: 90, mobile: 125, renewables: 9, tourists: 6.4e6, mil_spend: 2.5, armed_forces: 215000, forest: 60, pm25: 15, co2_pc: 11.5,
    voice: 85, stability: 70, effectiveness: 85, regulatory: 85, rule_of_law: 83, corruption_control: 80, undp_hdi: 0.926 } }

// Impute missing indicators: median of same region+income group → region → world.
const KEYS = [...new Set(Object.values(countries).flatMap(c => Object.keys(c.data)))]
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
for (const c of Object.values(countries)) {
  c.imputed = []
  for (const k of KEYS) {
    if (c.data[k] != null) continue
    const peers = Object.values(countries).filter(o => o.data[k] != null)
    const v = median(peers.filter(o => o.region === c.region && o.income === c.income).map(o => o.data[k]))
      ?? median(peers.filter(o => o.region === c.region).map(o => o.data[k])) ?? median(peers.map(o => o.data[k]))
    if (v != null) { c.data[k] = v; c.imputed.push(k) }
  }
}

// ---------- cities ----------
const rawCities = JSON.parse(readFileSync('data/raw/cities.json', 'utf8'))

// ---------- provinces ----------
const used = new Set()
const provinces = landCells.map((cell, id) => {
  const [lat, lon] = h3.cellToLatLng(cell)
  const ring = unwrapRing(h3.cellToBoundary(cell, true)).map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)])
  const disk = h3.gridDisk(cell, 1).filter(c => c !== cell)
  const nb = disk.filter(c => index.has(c)).map(c => index.get(c))
  // coastal: touches a sea hex, or the hex itself is partly sea (narrow seas like the Gulf or the Bosporus)
  const coastal = disk.some(c => !index.has(c)) || ring.some(([x, y]) => {
    const mx = (x + lon) / 2, my = (y + lat) / 2
    return !isLand(y, x > 180 ? x - 360 : x) || !isLand(my, mx > 180 ? mx - 360 : mx)
  })
  const terrain = classify(lat, lon)
  const area = h3.cellArea(cell, 'km2')
  let iso3 = countryAt(lat, lon)
  if (!iso3) for (const [x, y] of ring) { iso3 = countryAt(y, x > 180 ? x - 360 : x); if (iso3) break }
  const strait = coastal ? (CHOKEPOINTS.find(([, la, lo]) => distKm(lat, lon, la, lo) < 420)?.[0] ?? null) : null
  const culture = cultureOf(lat, lon)
  return {
    id, h3: cell, lat: +lat.toFixed(3), lon: +lon.toFixed(3), area: Math.round(area),
    name: '', region: nameFor(cell, culture, used), culture, terrain, coastal, strait,
    oil: levelAt(lat, lon, OIL), metals: levelAt(lat, lon, METALS), fertility: levelAt(lat, lon, FERTILE),
    iso3, attraction: 0, pop: 0, cities: [], nb, sea: [], ring,
  }
})
// provinces with no country (tiny islands/coast slivers) inherit from neighbours
for (let pass = 0; pass < 6; pass++) for (const p of provinces) if (!p.iso3) p.iso3 = p.nb.map(q => provinces[q].iso3).find(Boolean) ?? null
for (const p of provinces) if (!p.iso3 || !countries[p.iso3]) {
  // nearest country capital
  let best = null, bd = Infinity
  for (const c of Object.values(countries)) if (c.lat != null) { const d = distKm(p.lat, p.lon, c.lat, c.lon); if (d < bd) { bd = d; best = c.iso3 } }
  p.iso3 = best
}

// assign cities to provinces
const cities = []
for (const c of rawCities) {
  let pid = index.get(h3.latLngToCell(c.lat, c.lon, RES))
  if (pid === undefined) {
    let bd = Infinity
    for (const q of h3.gridDisk(h3.latLngToCell(c.lat, c.lon, RES), 2)) { const i = index.get(q); if (i === undefined) continue; const d = distKm(c.lat, c.lon, provinces[i].lat, provinces[i].lon); if (d < bd) { bd = d; pid = i } }
  }
  if (pid === undefined) continue
  const prov = provinces[pid]
  if (prov.cities.length >= 12) continue
  const cid = cities.length
  cities.push({ id: cid, name: c.name, lat: +c.lat.toFixed(3), lon: +c.lon.toFixed(3), pop: Math.round(c.pop / 1000), capital: c.capital, iso3: c.iso3, province: pid })
  prov.cities.push(cid)
}
// province name: its largest city, otherwise a generated regional name
const taken = new Set()
for (const p of provinces) {
  const big = p.cities.map(i => cities[i]).sort((a, b) => b.pop - a.pop).find(c => !taken.has(c.name))
  p.name = big ? big.name : p.region
  taken.add(p.name)
}

// population: real country population spread over its provinces, weighted by cities and terrain
const W = { plains: 1, farmland: 1.6, boreal: 0.08, tundra: 0.01, ice: 0, desert: 0.05, arid: 0.25, savanna: 0.6, jungle: 0.3, mountains: 0.25 }
const weight = p => (W[p.terrain] * (p.area / 86000) * (p.coastal ? 1.2 : 1) * (1 + p.fertility * 0.3)) * 1000 + p.cities.reduce((s, i) => s + cities[i].pop, 0) * 1.4
const byIso = {}
for (const p of provinces) (byIso[p.iso3] ??= []).push(p)
for (const [iso, list] of Object.entries(byIso)) {
  const total = (countries[iso]?.data.population ?? 0) / 1000
  const ws = list.map(weight), sum = ws.reduce((a, b) => a + b, 0) || 1
  list.forEach((p, i) => { p.pop = Math.round(total * ws[i] / sum) })
}
// countries with no province of their own (Singapore, Bahrain…) join the nearest province
for (const c of Object.values(countries)) {
  if (byIso[c.iso3] || c.lat == null || !c.data.population) continue
  let best = null, bd = Infinity
  for (const p of provinces) { const d = distKm(c.lat, c.lon, p.lat, p.lon); if (d < bd) { bd = d; best = p } }
  if (best && bd < 600) { best.pop += Math.round(c.data.population / 1000); best.absorbed = [...(best.absorbed ?? []), c.iso3] }
}

// tourism attraction 0-3: national tourism intensity, coastline, mountains, great cities
for (const p of provinces) {
  const d = countries[p.iso3]?.data ?? {}
  const perCap = (d.tourists ?? 0) / Math.max(1, d.population ?? 1)
  let a = perCap > 1 ? 1.5 : perCap > 0.3 ? 1 : perCap > 0.08 ? 0.5 : 0
  if (p.coastal && Math.abs(p.lat) < 45) a += 0.8
  if (p.terrain === 'mountains') a += 0.6
  if (p.cities.some(i => cities[i].capital || cities[i].pop > 5000)) a += 0.7
  p.attraction = Math.min(3, Math.round(a))
}

// Sea links: coastal provinces within 3 hex rings over water that are far apart by land.
function landDistance(a, b, max) {
  const seen = new Set([a]); let frontier = [a]
  for (let d = 1; d <= max; d++) {
    const next = []
    for (const p of frontier) for (const n of provinces[p].nb) {
      if (n === b) return d
      if (!seen.has(n)) { seen.add(n); next.push(n) }
    }
    frontier = next
  }
  return Infinity
}
for (const p of provinces) {
  if (!p.coastal) continue
  for (const c of h3.gridDisk(p.h3, 3)) {
    const q = index.get(c)
    if (q === undefined || q === p.id || !provinces[q].coastal || p.nb.includes(q)) continue
    if (landDistance(p.id, q, 4) > 4) p.sea.push(q)
  }
}

const usedIso = new Set(provinces.map(p => p.iso3).concat(provinces.flatMap(p => p.absorbed ?? [])))
const countryOut = Object.fromEntries(Object.entries(countries).filter(([k]) => usedIso.has(k)).map(([k, c]) => [k, { iso3: k, name: c.name, region: c.region, income: c.income, imputed: c.imputed, estimated: !!c.estimated, data: c.data }]))

mkdirSync('public/world', { recursive: true })
writeFileSync('public/world/provinces.json', JSON.stringify(provinces))
writeFileSync('public/world/cities.json', JSON.stringify(cities))
writeFileSync('public/world/countries.json', JSON.stringify(countryOut))
const tally = {}
for (const p of provinces) tally[p.terrain] = (tally[p.terrain] || 0) + 1
console.log('terrain', tally)
console.log('countries', Object.keys(countryOut).length, 'cities', cities.length, 'named after cities', provinces.filter(p => p.cities.length).length)
console.log('world pop (M)', Math.round(provinces.reduce((s, p) => s + p.pop, 0) / 1000))
console.log('sample', provinces.filter(p => ['QAT', 'TWN', 'JPN', 'EGY'].includes(p.iso3)).map(p => `${p.name}(${p.iso3}) ${p.pop}k`).join(', '))
