// Downloads open real-world datasets used to seed the simulation. Run once: `npm run fetch:data`
//  - World Bank World Development Indicators (CC BY 4.0)      https://data.worldbank.org
//  - Worldwide Governance Indicators (World Bank, CC BY 4.0)  https://www.worldbank.org/en/publication/worldwide-governance-indicators
//  - UNDP Human Development Report composite indices           https://hdr.undp.org/data-center
//  - Natural Earth populated places (public domain)            https://www.naturalearthdata.com
// Output: data/raw/*.json (parsed + reduced to the latest available value per country)

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'

export const WDI = {
  // economy
  gdppc_ppp: 'NY.GDP.PCAP.PP.KD', gdp_usd: 'NY.GDP.MKTP.CD', gdp_growth: 'NY.GDP.MKTP.KD.ZG', inflation: 'FP.CPI.TOTL.ZG',
  unemployment: 'SL.UEM.TOTL.ZS', agri_va: 'NV.AGR.TOTL.ZS', industry_va: 'NV.IND.TOTL.ZS', manuf_va: 'NV.IND.MANF.ZS',
  services_va: 'NV.SRV.TOTL.ZS', exports_gdp: 'NE.EXP.GNFS.ZS', imports_gdp: 'NE.IMP.GNFS.ZS', hightech_exports: 'TX.VAL.TECH.MF.ZS',
  resource_rents: 'NY.GDP.TOTL.RT.ZS', oil_rents: 'NY.GDP.PETR.RT.ZS', mineral_rents: 'NY.GDP.MINR.RT.ZS', tax_rev: 'GC.TAX.TOTL.GD.ZS',
  debt_gdp: 'GC.DOD.TOTL.GD.ZS', fdi_in: 'BX.KLT.DINV.WD.GD.ZS', rnd: 'GB.XPD.RSDV.GD.ZS', patents: 'IP.PAT.RESD',
  researchers: 'SP.POP.SCIE.RD.P6', lending_rate: 'FR.INR.LEND', labor_part: 'SL.TLF.CACT.ZS', female_labor: 'SL.TLF.CACT.FE.ZS',
  // society
  population: 'SP.POP.TOTL', pop_growth: 'SP.POP.GROW', life_exp: 'SP.DYN.LE00.IN', fertility: 'SP.DYN.TFRT.IN',
  urban: 'SP.URB.TOTL.IN.ZS', age65: 'SP.POP.65UP.TO.ZS', age014: 'SP.POP.0014.TO.ZS', literacy: 'SE.ADT.LITR.ZS',
  tertiary: 'SE.TER.ENRR', secondary: 'SE.SEC.ENRR', edu_spend: 'SE.XPD.TOTL.GD.ZS', health_spend: 'SH.XPD.CHEX.GD.ZS',
  gini: 'SI.POV.GINI', poverty: 'SI.POV.DDAY', child_mort: 'SH.DYN.MORT', homicide: 'VC.IHR.PSRC.P5',
  women_parl: 'SG.GEN.PARL.ZS', net_migration: 'SM.POP.NETM', refugees_origin: 'SM.POP.RHCR.EO',
  // infrastructure & technology
  electricity: 'EG.ELC.ACCS.ZS', internet: 'IT.NET.USER.ZS', mobile: 'IT.CEL.SETS.P2', energy_use: 'EG.USE.PCAP.KG.OE',
  renewables: 'EG.FEC.RNEW.ZS', air_pass: 'IS.AIR.PSGR', tourists: 'ST.INT.ARVL', tourism_receipts: 'ST.INT.RCPT.CD',
  // military
  mil_spend: 'MS.MIL.XPND.GD.ZS', armed_forces: 'MS.MIL.TOTL.P1', arms_exports: 'MS.MIL.XPRT.KD',
  // environment
  forest: 'AG.LND.FRST.ZS', pm25: 'EN.ATM.PM25.MC.M3', water_stress: 'ER.H2O.FWST.ZS', co2_pc: 'EN.GHG.CO2.PC.CE.AR5',
  arable: 'AG.LND.ARBL.ZS', cereal_yield: 'AG.YLD.CREL.KG',
}
export const WGI = {
  voice: 'GOV_WGI_VA.SC', stability: 'GOV_WGI_PV.SC', effectiveness: 'GOV_WGI_GE.SC',
  regulatory: 'GOV_WGI_RQ.SC', rule_of_law: 'GOV_WGI_RL.SC', corruption_control: 'GOV_WGI_CC.SC',
}

mkdirSync('data/raw', { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url)
      if (r.ok) return await r.json()
    } catch { /* retry */ }
    await sleep(1000 * (i + 1))
  }
  throw new Error('failed ' + url)
}

// country metadata (iso3, region, income level, capital coordinates)
const meta = await getJSON('https://api.worldbank.org/v2/country?format=json&per_page=400')
const countries = {}
for (const c of meta[1]) {
  if (c.region.value === 'Aggregates') continue
  countries[c.id] = { iso3: c.id, iso2: c.iso2Code, name: c.name, region: c.region.value, income: c.incomeLevel.value, lat: +c.latitude || null, lon: +c.longitude || null }
}
console.log(Object.keys(countries).length, 'countries')

async function indicator(code, source) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&per_page=20000&date=2010:2025${source ? `&source=${source}` : ''}`
  const j = await getJSON(url)
  const out = {}
  for (const row of j[1] ?? []) {
    const iso = row.countryiso3code || row.country?.id
    if (!iso || !countries[iso] || row.value == null) continue
    const y = +row.date
    if (!out[iso] || y > out[iso].y) out[iso] = { v: row.value, y }
  }
  return Object.fromEntries(Object.entries(out).map(([k, o]) => [k, +(+o.v).toPrecision(5)]))
}

const values = {}
for (const [key, code] of [...Object.entries(WDI), ...Object.entries(WGI)]) {
  const isWgi = code.startsWith('GOV_WGI')
  try {
    values[key] = await indicator(code, isWgi ? 3 : undefined)
    console.log(key.padEnd(18), String(Object.keys(values[key]).length).padStart(4), 'countries')
  } catch (e) {
    console.log(key, 'FAILED', e.message)
    values[key] = {}
  }
}
for (const iso of Object.keys(countries)) {
  countries[iso].data = Object.fromEntries(Object.keys(values).filter(k => values[k][iso] != null).map(k => [k, values[k][iso]]))
}

// UNDP composite indices (HDI, gender inequality, etc.) — latest year columns
try {
  const csv = await (await fetch('https://hdr.undp.org/sites/default/files/2023-24_HDR/HDR23-24_Composite_indices_complete_time_series.csv')).text()
  const lines = csv.split(/\r?\n/).filter(Boolean)
  const head = lines[0].split(',')
  const wanted = { hdi: 'hdi_', gii: 'gii_', mys: 'mys_', eys: 'eys_', gnipc: 'gnipc_' }
  let n = 0
  for (const line of lines.slice(1)) {
    const cells = line.split(',')
    const iso = cells[0]
    if (!countries[iso]) continue
    for (const [k, pre] of Object.entries(wanted)) {
      for (let y = 2023; y >= 2015; y--) {
        const idx = head.indexOf(pre + y)
        if (idx >= 0 && cells[idx] && !isNaN(+cells[idx])) { countries[iso].data['undp_' + k] = +cells[idx]; break }
      }
    }
    n++
  }
  console.log('UNDP rows', n)
} catch (e) { console.log('UNDP failed', e.message) }

writeFileSync('data/raw/countries.json', JSON.stringify(countries))

// Natural Earth populated places
if (!existsSync('data/raw/cities.json')) {
  const ne = await getJSON('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places_simple.geojson')
  const cities = ne.features
    .map(f => ({ name: f.properties.name, iso3: f.properties.adm0_a3, pop: f.properties.pop_max, capital: f.properties.adm0cap === 1, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], rank: f.properties.scalerank }))
    .filter(c => c.pop >= 100000 || c.capital)
    .sort((a, b) => b.pop - a.pop)
  writeFileSync('data/raw/cities.json', JSON.stringify(cities))
  console.log(cities.length, 'cities')
}
console.log('done')
