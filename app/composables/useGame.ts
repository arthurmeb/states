import { reactive, shallowRef, computed } from 'vue'
import type { ChatMsg, City, ClientMsg, CountryData, NationPublic, ProvinceDetail, ProvinceStatic, ServerMsg, StateMsg } from '~~/shared/types'

export type MapMode = 'political' | 'diplomatic' | 'blocs' | 'terrain' | 'resources' | 'industry' | 'wealth' | 'development' | 'population' | 'unrest' | 'influence'
export type GovSection = 'overview' | 'indices' | 'economy' | 'budget' | 'welfare' | 'society' | 'governance' | 'environment' | 'culture' | 'defense' | 'foreign' | 'territories' | 'world'

const snap = shallowRef<StateMsg | null>(null)
const provinces = shallowRef<ProvinceStatic[]>([])
const cities = shallowRef<City[]>([])
const countries = shallowRef<Record<string, CountryData>>({})
const ui = reactive({
  connected: false,
  token: '' as string,
  chat: [] as ChatMsg[],
  toasts: [] as { id: number; msg: string; kind: 'ok' | 'err' }[],
  selected: null as number | null,
  inspectNation: null as number | null,
  mapMode: 'political' as MapMode,
  basemap: 'day' as 'day' | 'night',
  showTrade: true,
  gov: null as GovSection | null,
  provinceView: null as number | null,
  showIssue: false,
  panelOpen: true,
  /** Phone layout: which bottom sheet is open. */
  sheet: null as null | 'nation' | 'wire' | 'modes',
  lastTickAt: 0,
  flyTo: null as { lat: number; lon: number; zoom?: number; seq: number } | null,
  details: {} as Record<number, ProvinceDetail>,
})

let ws: WebSocket | null = null
let started = false
let toastSeq = 1
let retry = 0

function tokenKey() {
  const p = new URLSearchParams(location.search).get('player')
  return p ? `states-token-${p}` : 'states-token'
}
function readToken() { try { return localStorage.getItem(tokenKey()) ?? '' } catch { return '' } }
function writeToken(t: string) { try { localStorage.setItem(tokenKey(), t) } catch { /* private mode */ } }
/** `?key=<token>` signs this device in as an existing nation (see "Play on another device"). */
function importKey() {
  const u = new URL(location.href), k = u.searchParams.get('key')
  if (!k) return
  writeToken(k); u.searchParams.delete('key'); history.replaceState(null, '', u.pathname + u.search + u.hash)
}
export function deviceLink() { return `${location.origin}/?key=${encodeURIComponent(ui.token)}` }

export function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const id = toastSeq++
  ui.toasts.push({ id, msg, kind })
  setTimeout(() => { ui.toasts = ui.toasts.filter(t => t.id !== id) }, kind === 'err' ? 5000 : 3200)
}

function connect() {
  importKey()
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/_ws`)
  ws.onopen = () => { ui.connected = true; retry = 0; send({ t: 'hello', token: readToken() }) }
  ws.onclose = () => { ui.connected = false; setTimeout(connect, Math.min(8000, 500 * 2 ** retry++)) }
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data) as ServerMsg
    switch (msg.t) {
      case 'state': {
        const prev = snap.value
        snap.value = msg
        ui.lastTickAt = performance.now()
        for (const d of msg.myProvinces) ui.details[d.id] = d
        if (msg.issue && msg.issue.id !== prev?.issue?.id) toast(`📜 New issue: ${msg.issue.title}`)
        if (prev?.me && !msg.me) toast(`☠ ${prev.me.name} has fallen. Found a new nation to try again.`, 'err')
        if (prev?.me && msg.me && msg.me.wars.length > prev.me.wars.length) {
          const enemy = msg.nations.find(n => msg.me!.wars.includes(n.id) && !prev.me!.wars.includes(n.id))
          if (enemy) toast(`⚔ War with ${enemy.name}!`, 'err')
        }
        // keep inspected foreign province fresh once a week
        if (ui.selected != null && msg.prov.owner[ui.selected] !== msg.me?.id && msg.tick % 7 === 0) send({ t: 'inspect', province: ui.selected })
        break
      }
      case 'welcome': ui.token = msg.token; writeToken(msg.token); ui.chat = msg.chat; break
      case 'chat': ui.chat.push(msg.msg); if (ui.chat.length > 100) ui.chat.shift(); break
      case 'toast': toast(msg.msg); break
      case 'error': toast(msg.msg, 'err'); break
      case 'province': ui.details[msg.detail.id] = msg.detail; break
    }
  }
}

export function send(msg: ClientMsg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  else toast('Not connected to the world server', 'err')
}

export function useGame() {
  if (!started && import.meta.client) {
    started = true
    Promise.all(['provinces', 'cities', 'countries'].map(f => fetch(`/world/${f}.json`).then(r => r.json()))).then(([p, c, k]) => {
      provinces.value = p; cities.value = c; countries.value = k
    })
    connect()
    // dev-only handle for scripted capture (scripts/video)
    if (import.meta.dev) Object.assign(window, { __ui: ui, __snap: snap })
  }
  const nations = computed(() => {
    const m = new Map<number, NationPublic>()
    for (const n of snap.value?.nations ?? []) m.set(n.id, n)
    return m
  })
  const me = computed(() => snap.value?.me ?? null)
  const relation = (id: number) => {
    const m = me.value
    if (!m) return 'neutral'
    if (id === m.id) return 'self'
    if (m.wars.includes(id)) return 'war'
    if (m.allies.includes(id)) return 'ally'
    if (m.bloc != null && nations.value.get(id)?.bloc === m.bloc) return 'bloc'
    if (m.pacts.includes(id)) return 'pact'
    if (m.embargoes.includes(id) || m.sanctions.includes(id)) return 'hostile'
    return 'neutral'
  }
  function fly(lat: number, lon: number, zoom?: number) { ui.flyTo = { lat, lon, zoom, seq: (ui.flyTo?.seq ?? 0) + 1 } }
  function select(pid: number | null) {
    ui.selected = pid
    ui.inspectNation = null
    if (pid != null && snap.value?.prov.owner[pid] !== snap.value?.me?.id) send({ t: 'inspect', province: pid })
  }
  function openProvince(pid: number) {
    ui.provinceView = pid
    if (snap.value?.prov.owner[pid] !== snap.value?.me?.id) send({ t: 'inspect', province: pid })
  }
  return { snap, provinces, cities, countries, ui, nations, me, send, toast, relation, fly, select, openProvince }
}

// ───────── formatting ─────────
export const fmtPop = (k: number) => k >= 1e6 ? `${(k / 1e6).toFixed(2)}B` : k >= 1000 ? `${(k / 1000).toFixed(1)}M` : `${Math.round(k)}k`
export const fmtMoney = (b: number) => {
  const s = b < 0 ? '−' : ''
  const a = Math.abs(b)
  return a >= 1000 ? `${s}$${(a / 1000).toFixed(2)}T` : a >= 100 ? `${s}$${a.toFixed(0)}B` : a >= 1 ? `${s}$${a.toFixed(1)}B` : `${s}$${(a * 1000).toFixed(0)}M`
}
export const fmtTroops = (k: number) => k >= 1000 ? `${(k / 1000).toFixed(2)}M` : k >= 10 ? `${Math.round(k)}k` : `${k.toFixed(1)}k`
export const fmtUsd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`
export const signed = (v: number, f: (x: number) => string) => (v >= 0 ? '+' : '') + f(v)
