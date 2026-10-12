<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { ProvinceDetail, ProvinceStatic } from '~~/shared/types'
import { buildScene, N, TW, TH, type Scene, type Cell } from '~/utils/isoScene'

const props = defineProps<{ province: ProvinceStatic; detail: ProvinceDetail; color: string }>()
const wrap = ref<HTMLDivElement>()
const cv = ref<HTMLCanvasElement>()
const tip = ref<{ x: number; y: number; text: string } | null>(null)
let scene: Scene | null = null
let dayLayer: HTMLCanvasElement | null = null
let nightLayer: HTMLCanvasElement | null = null
let raf = 0
const cam = { x: 0, y: 0, z: 1 }
let dragging: { x: number; y: number; cx: number; cy: number } | null = null
const particles: { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }[] = []

const W0 = N * TW + 40, H0 = N * TH + 260, OX = W0 / 2, OY = 230
const iso = (x: number, y: number) => ({ sx: OX + (x - y) * (TW / 2), sy: OY + (x + y) * (TH / 2) })

function shade(hex: string, f: number) {
  if (hex.startsWith('rgb')) return hex
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.min(255, Math.max(0, Math.round(v * f)))
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`
}
function diamond(g: CanvasRenderingContext2D, x: number, y: number, color: string, inset = 0) {
  const { sx, sy } = iso(x, y)
  const hw = TW / 2 - inset, hh = TH / 2 - inset / 2
  g.fillStyle = color
  g.beginPath(); g.moveTo(sx, sy - hh); g.lineTo(sx + hw, sy); g.lineTo(sx, sy + hh); g.lineTo(sx - hw, sy); g.closePath(); g.fill()
}
/** extruded box centred on a tile. w,d in fraction of tile. */
function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, night: boolean, opts: { windows?: boolean; dx?: number; dy?: number; lit?: number } = {}) {
  const { sx, sy } = iso(x + (opts.dx ?? 0), y + (opts.dy ?? 0))
  const hw = (TW / 2) * w, hh = (TH / 2) * w
  const by = sy + hh
  const f = night ? 0.38 : 1
  g.fillStyle = shade(color, 0.78 * f)
  g.beginPath(); g.moveTo(sx - hw, by - hh); g.lineTo(sx, by); g.lineTo(sx, by - h); g.lineTo(sx - hw, by - hh - h); g.closePath(); g.fill()
  g.fillStyle = shade(color, 0.6 * f)
  g.beginPath(); g.moveTo(sx + hw, by - hh); g.lineTo(sx, by); g.lineTo(sx, by - h); g.lineTo(sx + hw, by - hh - h); g.closePath(); g.fill()
  g.fillStyle = shade(color, 1.05 * f)
  g.beginPath(); g.moveTo(sx, by - h); g.lineTo(sx - hw, by - hh - h); g.lineTo(sx, by - 2 * hh - h); g.lineTo(sx + hw, by - hh - h); g.closePath(); g.fill()
  if (opts.windows && h > 7) {
    const lit = opts.lit ?? 0.65
    for (let yy = by - 5; yy > by - h + 3; yy -= 5) for (let k = 0.18; k < 0.95; k += 0.26) {
      const seed = (Math.floor(yy) * 31 + Math.floor(k * 100) + x * 7 + y * 13) % 10 / 10
      g.fillStyle = night ? (seed < lit ? 'rgba(255,214,120,0.95)' : 'rgba(40,40,60,0.6)') : 'rgba(210,235,255,0.55)'
      g.fillRect(sx - hw * k - 1, yy - hh * k - 1.5, 2, 2.4)
      g.fillStyle = night ? (seed > 1 - lit ? 'rgba(255,200,110,0.85)' : 'rgba(30,30,50,0.6)') : 'rgba(170,200,230,0.45)'
      g.fillRect(sx + hw * k - 1, yy - hh * k - 1.5, 2, 2.4)
    }
  }
  return { sx, top: by - h - hh }
}
function tree(g: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, night: boolean, palm = false) {
  const { sx, sy } = iso(x + dx, y + dy)
  g.fillStyle = night ? '#2b1d12' : '#6b4f2a'
  g.fillRect(sx - 1, sy - 8, 2, 8)
  if (palm) {
    g.strokeStyle = night ? '#1f3d22' : '#2f9e44'; g.lineWidth = 2
    for (let a = 0; a < 5; a++) { g.beginPath(); g.moveTo(sx, sy - 9); g.quadraticCurveTo(sx + Math.cos(a * 1.25) * 6, sy - 13, sx + Math.cos(a * 1.25) * 9, sy - 7 + Math.sin(a) * 2); g.stroke() }
  } else {
    g.fillStyle = night ? '#1d3b24' : ['#2f9e44', '#37b24d', '#2b8a3e'][(x + y) % 3]
    g.beginPath(); g.arc(sx, sy - 11, 5.5, 0, Math.PI * 2); g.fill()
  }
}

function drawCell(g: CanvasRenderingContext2D, x: number, y: number, c: Cell, night: boolean) {
  const f = night ? 0.4 : 1
  const groundCol = shade(scene!.ground, f)
  switch (c.kind) {
    case 'water': diamond(g, x, y, night ? '#0b2238' : '#2b6f9e'); return
    case 'sand': diamond(g, x, y, shade('#e3cf98', f)); if ((x * y) % 7 === 0 && scene!.tropical) tree(g, x, y, 0, 0, night, true); return
    case 'road': diamond(g, x, y, shade('#6d6f73', f)); return
    case 'avenue': diamond(g, x, y, shade('#55575b', f)); diamond(g, x, y, shade('#6b6d71', f), 10); return
    case 'plaza': diamond(g, x, y, shade('#c5bfb2', f)); if (x === scene!.plaza[0] && y === scene!.plaza[1]) { box(g, x, y, 0.2, 18, '#e9dcc0', night); } return
    case 'park': diamond(g, x, y, shade('#5c9e4a', f)); tree(g, x, y, -0.2, 0, night); tree(g, x, y, 0.2, 0.15, night); return
    case 'forest': diamond(g, x, y, groundCol); tree(g, x, y, -0.2, -0.1, night, scene!.tropical && (x + y) % 2 === 0); tree(g, x, y, 0.15, 0.2, night); return
    case 'snow': diamond(g, x, y, shade('#dfe7ea', f)); return
    case 'rock': {
      diamond(g, x, y, groundCol)
      const { sx, sy } = iso(x, y)
      g.fillStyle = shade('#857865', 0.85 * f); g.beginPath(); g.moveTo(sx - TW / 2, sy); g.lineTo(sx, sy - c.h); g.lineTo(sx, sy + TH / 2); g.closePath(); g.fill()
      g.fillStyle = shade('#857865', 0.65 * f); g.beginPath(); g.moveTo(sx + TW / 2, sy); g.lineTo(sx, sy - c.h); g.lineTo(sx, sy + TH / 2); g.closePath(); g.fill()
      if (c.h > 20) { g.fillStyle = night ? '#9aa' : '#f1f3f5'; g.beginPath(); g.moveTo(sx, sy - c.h); g.lineTo(sx - 5, sy - c.h + 8); g.lineTo(sx + 5, sy - c.h + 8); g.fill() }
      return
    }
    case 'farm': {
      diamond(g, x, y, shade(c.color, f))
      const { sx, sy } = iso(x, y)
      g.strokeStyle = night ? 'rgba(0,0,0,0.25)' : 'rgba(80,60,20,0.25)'; g.lineWidth = 1
      for (let k = -0.35; k <= 0.35; k += 0.14) { g.beginPath(); g.moveTo(sx + k * TW - TW * 0.18, sy + k * TH * 0 - TH * 0.18 + k * TH * 0.6); g.lineTo(sx + k * TW + TW * 0.18, sy - k * TH * 0 + TH * 0.18 + k * TH * 0.6 - TH * 0.36); g.stroke() }
      return
    }
    case 'barn': diamond(g, x, y, shade('#9bbf4a', f)); box(g, x, y, 0.45, 9, '#c92a2a', night); return
    case 'house': { diamond(g, x, y, groundCol); const b = box(g, x, y, 0.55, c.h, c.color, night, { windows: false }); g.fillStyle = shade('#a5452f', 0.9 * f); g.beginPath(); g.moveTo(b.sx - TW * 0.28, b.top + TH * 0.28); g.lineTo(b.sx, b.top - 5); g.lineTo(b.sx + TW * 0.28, b.top + TH * 0.28); g.fill(); if (night && c.seed % 3) { g.fillStyle = 'rgba(255,210,120,0.9)'; g.fillRect(b.sx - 5, b.top + 8, 2, 2) } tree(g, x, y, 0.32, -0.3, night); return }
    case 'slum': diamond(g, x, y, shade('#8d7b68', f)); box(g, x, y, 0.35, c.h, c.color, night, { dx: -0.2 }); box(g, x, y, 0.3, c.h - 1, '#adb5bd', night, { dx: 0.2, dy: 0.1 }); box(g, x, y, 0.3, c.h + 1, c.color, night, { dy: -0.25 }); return
    case 'apartment': diamond(g, x, y, shade('#9f9a90', f)); box(g, x, y, 0.72, c.h, c.color, night, { windows: true }); return
    case 'office': diamond(g, x, y, shade('#8d8a84', f)); box(g, x, y, 0.75, c.h, c.color, night, { windows: true, lit: 0.45 }); return
    case 'tower': {
      diamond(g, x, y, shade('#8d8a84', f))
      const b = box(g, x, y, 0.7, c.h, c.color, night, { windows: true, lit: 0.55 })
      if (c.h > 70) { g.strokeStyle = night ? '#ff6b6b' : '#ced4da'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(b.sx, b.top + 4); g.lineTo(b.sx, b.top - 14); g.stroke() }
      return
    }
    case 'shop': { diamond(g, x, y, shade('#a8a397', f)); box(g, x, y, 0.75, c.h, '#e9ecef', night, { windows: true, lit: 0.9 }); const { sx, sy } = iso(x, y); g.fillStyle = shade(c.color, f); g.fillRect(sx - 14, sy - c.h + 2, 28, 3); return }
    case 'factory': {
      diamond(g, x, y, shade('#7d776c', f))
      const b = box(g, x, y, 0.85, c.h, c.color, night, { windows: true, lit: 0.3 })
      g.fillStyle = shade('#868e96', f); g.fillRect(b.sx + 8, b.top - 14, 4, 18)
      g.fillStyle = shade('#e9ecef', f); for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(b.sx + k * 10 - 5, b.top + 6); g.lineTo(b.sx + k * 10, b.top); g.lineTo(b.sx + k * 10 + 5, b.top + 6); g.fill() }
      return
    }
    case 'heavy': {
      diamond(g, x, y, shade('#5e554c', f))
      const b = box(g, x, y, 0.8, c.h, c.color, night, { windows: false })
      g.fillStyle = shade('#495057', f); g.fillRect(b.sx - 10, b.top - 22, 5, 26); g.fillRect(b.sx + 4, b.top - 28, 5, 32)
      g.fillStyle = night ? '#ff922b' : '#c92a2a'; g.fillRect(b.sx + 4, b.top - 28, 5, 3)
      return
    }
    case 'hightech': diamond(g, x, y, shade('#8ce99a', f * 0.7)); box(g, x, y, 0.85, c.h, '#f1f3f5', night, { windows: true, lit: 0.8 }); box(g, x, y, 0.86, 3, '#4dabf7', night, { dy: 0 }); return
    case 'warehouse': diamond(g, x, y, shade('#7d776c', f)); box(g, x, y, 0.9, 7, c.color, night); return
    case 'pumpjack': diamond(g, x, y, groundCol); { const { sx, sy } = iso(x, y); g.fillStyle = night ? '#222' : '#343a40'; g.fillRect(sx - 6, sy - 2, 12, 3); g.fillRect(sx - 1, sy - 12, 2, 10) } return
    case 'mine': {
      diamond(g, x, y, shade('#6b5a48', f)); diamond(g, x, y, shade('#5a4a3a', f), 8); diamond(g, x, y, shade('#463a2e', f), 16)
      return
    }
    case 'port': {
      diamond(g, x, y, shade('#868e96', f))
      const { sx, sy } = iso(x, y)
      const cols = ['#e8590c', '#1971c2', '#2f9e44', '#f08c00']
      for (let k = 0; k < 4; k++) box(g, x, y, 0.22, 5, cols[(k + c.seed) % 4], night, { dx: -0.25 + (k % 2) * 0.3, dy: -0.25 + Math.floor(k / 2) * 0.3 })
      g.strokeStyle = night ? '#a14b10' : '#e8590c'; g.lineWidth = 2.5
      g.beginPath(); g.moveTo(sx - 4, sy); g.lineTo(sx - 4, sy - 30); g.lineTo(sx + 16, sy - 30); g.stroke()
      g.beginPath(); g.moveTo(sx + 4, sy); g.lineTo(sx + 4, sy - 30); g.stroke()
      return
    }
    case 'resort': {
      diamond(g, x, y, shade('#e3cf98', f))
      box(g, x, y, 0.45, c.h, '#fff9db', night, { windows: true, lit: 0.85, dx: -0.15, dy: -0.15 })
      const { sx, sy } = iso(x + 0.25, y + 0.25); g.fillStyle = night ? '#1864ab' : '#4dabf7'; g.beginPath(); g.ellipse(sx, sy, 8, 4, 0, 0, Math.PI * 2); g.fill()
      tree(g, x, y, 0.35, -0.2, night, true)
      return
    }
    case 'studio': {
      diamond(g, x, y, shade('#868e96', f))
      const b = box(g, x, y, 0.85, c.h, '#495057', night)
      g.fillStyle = night ? '#ffd43b' : '#f8f9fa'; g.font = 'bold 7px sans-serif'; g.textAlign = 'center'; g.fillText('STUDIOS', b.sx, b.top + 10)
      return
    }
    case 'stadium': {
      diamond(g, x, y, groundCol)
      const { sx, sy } = iso(x, y)
      g.fillStyle = shade('#ced4da', f); g.beginPath(); g.ellipse(sx, sy - 6, 22, 11, 0, 0, Math.PI * 2); g.fill()
      g.fillStyle = shade('#adb5bd', f); g.fillRect(sx - 22, sy - 6, 44, 6)
      g.fillStyle = night ? '#2b8a3e' : '#51cf66'; g.beginPath(); g.ellipse(sx, sy - 7, 14, 6.5, 0, 0, Math.PI * 2); g.fill()
      if (night) { g.fillStyle = 'rgba(255,255,220,0.35)'; g.beginPath(); g.ellipse(sx, sy - 10, 26, 16, 0, 0, Math.PI * 2); g.fill() }
      return
    }
    case 'university': {
      diamond(g, x, y, shade('#69db7c', f * 0.8))
      box(g, x, y, 0.35, 12, c.color, night, { windows: true, dx: -0.25 }); box(g, x, y, 0.35, 12, c.color, night, { windows: true, dy: -0.25 })
      const b = box(g, x, y, 0.18, 26, '#c92a2a', night, { dx: 0.2, dy: 0.2 })
      g.fillStyle = '#f8f9fa'; g.beginPath(); g.arc(b.sx, b.top + 8, 2.5, 0, Math.PI * 2); g.fill()
      return
    }
    case 'hospital': {
      diamond(g, x, y, shade('#ced4da', f))
      const b = box(g, x, y, 0.75, c.h, '#f8f9fa', night, { windows: true, lit: 0.9 })
      g.fillStyle = '#e03131'; g.fillRect(b.sx - 2, b.top + 3, 4, 10); g.fillRect(b.sx - 5, b.top + 6, 10, 4)
      return
    }
    case 'airport': {
      diamond(g, x, y, groundCol)
      const a = iso(x - 2, y), b2 = iso(x + 2, y)
      g.strokeStyle = shade('#495057', f); g.lineWidth = 9; g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(b2.sx, b2.sy); g.stroke()
      g.strokeStyle = night ? '#ffe066' : '#f8f9fa'; g.lineWidth = 1; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(b2.sx, b2.sy); g.stroke(); g.setLineDash([])
      box(g, x, y, 0.5, 8, '#dee2e6', night, { windows: true, dy: 0.6 })
      return
    }
    case 'spaceport': {
      diamond(g, x, y, shade('#adb5bd', f))
      const { sx, sy } = iso(x, y)
      g.fillStyle = shade('#868e96', f); g.fillRect(sx + 6, sy - 46, 4, 46)
      g.fillStyle = shade('#f8f9fa', f); g.fillRect(sx - 4, sy - 40, 8, 36)
      g.beginPath(); g.moveTo(sx - 4, sy - 40); g.lineTo(sx, sy - 50); g.lineTo(sx + 4, sy - 40); g.fill()
      g.fillStyle = '#1c7ed6'; g.fillRect(sx - 4, sy - 22, 8, 3)
      return
    }
    case 'fab': diamond(g, x, y, shade('#ced4da', f)); box(g, x, y, 0.92, c.h, '#f8f9fa', night, { windows: false }); box(g, x, y, 0.93, 4, '#228be6', night); return
    case 'solar': { diamond(g, x, y, groundCol); for (let k = 0; k < 4; k++) diamond(g, x - 0.22 + (k % 2) * 0.44 - 0, y - 0.22 + Math.floor(k / 2) * 0.44, night ? '#0b1f3a' : '#1c3d6e', 30); return }
    case 'nuclear': {
      diamond(g, x, y, shade('#adb5bd', f))
      const { sx, sy } = iso(x, y)
      for (const ox of [-9, 9]) {
        g.fillStyle = shade('#dee2e6', f)
        g.beginPath(); g.moveTo(sx + ox - 9, sy); g.quadraticCurveTo(sx + ox - 4, sy - 16, sx + ox - 7, sy - 26); g.lineTo(sx + ox + 7, sy - 26); g.quadraticCurveTo(sx + ox + 4, sy - 16, sx + ox + 9, sy); g.fill()
        g.fillStyle = shade('#adb5bd', f); g.beginPath(); g.ellipse(sx + ox, sy - 26, 7, 2.5, 0, 0, Math.PI * 2); g.fill()
      }
      return
    }
    case 'refinery': {
      diamond(g, x, y, shade('#7d776c', f))
      const { sx, sy } = iso(x, y)
      for (const [ox, oy] of [[-10, 0], [6, -3], [0, 5]]) { g.fillStyle = shade('#ced4da', f); g.fillRect(sx + ox - 5, sy + oy - 12, 10, 12); g.beginPath(); g.ellipse(sx + ox, sy + oy - 12, 5, 2, 0, 0, Math.PI * 2); g.fill() }
      g.fillStyle = shade('#495057', f); g.fillRect(sx + 12, sy - 30, 2, 30)
      return
    }
    case 'heritage': {
      diamond(g, x, y, shade('#c5bfb2', f))
      const b = box(g, x, y, 0.7, 10, c.color, night)
      g.fillStyle = shade('#e9dcc0', f); for (let k = -2; k <= 2; k++) g.fillRect(b.sx + k * 6 - 1, b.top + 10, 2, 10)
      g.fillStyle = shade('#ffd43b', f * 0.9); g.beginPath(); g.arc(b.sx, b.top + 6, 9, Math.PI, 0); g.fill()
      return
    }
    case 'base': case 'airbase': case 'navalbase': {
      diamond(g, x, y, shade('#6b7a45', f))
      for (let k = 0; k < 3; k++) box(g, x, y, 0.22, 3, '#495a2c', night, { dx: -0.25 + k * 0.25, dy: 0.1 })
      box(g, x, y, 0.4, 7, '#5c6b3a', night, { dy: -0.25 })
      return
    }
    case 'greenhouse': diamond(g, x, y, groundCol); box(g, x, y, 0.8, c.h, 'rgba(208,235,255,0.75)', night); return
    case 'construction': {
      diamond(g, x, y, shade('#a68a64', f))
      const { sx, sy } = iso(x, y)
      g.strokeStyle = night ? '#8f7100' : '#fab005'; g.lineWidth = 1
      for (let k = 0; k < c.h; k += 5) { g.strokeRect(sx - 12, sy - k - 5, 24, 5) }
      return
    }
    default: diamond(g, x, y, shade(c.color, f))
  }
}

function renderLayer(night: boolean) {
  const c = document.createElement('canvas')
  c.width = W0; c.height = H0
  const g = c.getContext('2d')!
  for (let s = 0; s < 2 * N - 1; s++) for (let x = 0; x < N; x++) {
    const y = s - x
    if (y < 0 || y >= N) continue
    drawCell(g, x, y, scene!.cells[x][y], night)
  }
  if (night) {
    // street lights
    for (const [x, y] of scene!.roads) {
      if ((x + y) % 2) continue
      const { sx, sy } = iso(x, y)
      const grd = g.createRadialGradient(sx, sy, 0, sx, sy, 14)
      grd.addColorStop(0, 'rgba(255,210,120,0.45)'); grd.addColorStop(1, 'rgba(255,210,120,0)')
      g.fillStyle = grd; g.fillRect(sx - 14, sy - 14, 28, 28)
    }
  }
  return c
}

function rebuild() {
  scene = buildScene(props.province, props.detail)
  dayLayer = renderLayer(false)
  nightLayer = renderLayer(true)
}

function fit() {
  const w = wrap.value!.clientWidth, h = wrap.value!.clientHeight
  cam.z = Math.min(w / W0, h / H0) * 1.15
  cam.x = (w - W0 * cam.z) / 2
  cam.y = (h - H0 * cam.z) / 2 - 10
}

const roadSet = () => new Set(scene!.roads.map(([x, y]) => x * 100 + y))
let roads: Set<number> | null = null
function step(dt: number) {
  const sc = scene!
  roads ??= roadSet()
  for (const a of sc.agents) {
    if (a.kind === 'protester') { a.x += (Math.random() - 0.5) * 0.04; a.y += (Math.random() - 0.5) * 0.04; a.x += (sc.plaza[0] - a.x) * 0.01; a.y += (sc.plaza[1] - a.y) * 0.01; continue }
    const dx = a.tx - a.x, dy = a.ty - a.y
    const dist = Math.hypot(dx, dy)
    if (dist < 0.05) {
      const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ox, oy]) => [Math.round(a.tx) + ox, Math.round(a.ty) + oy]).filter(([x, y]) => roads!.has(x * 100 + y))
      const nx = opts[Math.floor(Math.random() * opts.length)]
      if (nx) { a.tx = nx[0]; a.ty = nx[1] }
      continue
    }
    const v = Math.min(dist, a.speed * dt)
    a.x += (dx / dist) * v; a.y += (dy / dist) * v
  }
  for (const s of sc.ships) { s.y += s.dir * dt * 0.5; if (s.y > N + 2) s.y = -2; if (s.y < -2) s.y = N + 2 }
  for (const sm of sc.smoke) if (Math.random() < sm.rate * dt * 2) {
    const { sx, sy } = iso(sm.x, sm.y)
    particles.push({ x: sx + 10, y: sy - 30, vx: 4 + Math.random() * 4, vy: -10 - Math.random() * 6, life: 1, color: sm.color, size: 3 })
  }
  for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.size += dt * 5; p.life -= dt * 0.35; if (p.life <= 0) particles.splice(i, 1) }
}

let last = performance.now()
function frame(now: number) {
  raf = requestAnimationFrame(frame)
  const c = cv.value, sc = scene
  if (!c || !sc || !dayLayer || !nightLayer) return
  const dt = Math.min(0.1, (now - last) / 1000); last = now
  step(dt)
  const g = c.getContext('2d')!
  const dpr = window.devicePixelRatio || 1
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  // a two-minute day/night cycle
  const phase = (now / 1000 / 120) % 1
  const dark = Math.max(0, Math.min(1, (Math.cos(phase * Math.PI * 2) + 0.15) * 1.4))
  const sky = g.createLinearGradient(0, 0, 0, c.clientHeight)
  sky.addColorStop(0, `rgb(${Math.round(40 + 90 * (1 - dark))},${Math.round(60 + 120 * (1 - dark))},${Math.round(110 + 120 * (1 - dark))})`)
  sky.addColorStop(1, `rgb(${Math.round(10 + 60 * (1 - dark))},${Math.round(14 + 70 * (1 - dark))},${Math.round(30 + 80 * (1 - dark))})`)
  g.fillStyle = sky; g.fillRect(0, 0, c.clientWidth, c.clientHeight)
  g.save()
  g.translate(cam.x, cam.y); g.scale(cam.z, cam.z)
  g.drawImage(dayLayer, 0, 0)
  if (dark > 0.02) { g.globalAlpha = dark; g.drawImage(nightLayer, 0, 0); g.globalAlpha = 1 }
  const t = now / 1000
  // water shimmer & ships
  for (const s of sc.ships) {
    const { sx, sy } = iso(s.x, s.y)
    g.fillStyle = dark > 0.5 ? '#868e96' : '#f8f9fa'; g.beginPath(); g.moveTo(sx - 10, sy - 2); g.lineTo(sx + 10, sy - 6); g.lineTo(sx + 8, sy); g.lineTo(sx - 8, sy + 3); g.fill()
    g.fillStyle = ['#e8590c', '#1971c2', '#2f9e44'][Math.abs(Math.floor(s.x * 3)) % 3]; g.fillRect(sx - 5, sy - 8, 8, 4)
    if (dark > 0.5) { g.fillStyle = '#ffe066'; g.fillRect(sx + 6, sy - 6, 2, 2) }
  }
  // pumpjacks
  for (const [x, y] of sc.pumpjacks) {
    const { sx, sy } = iso(x, y)
    const a = Math.sin(t * 2 + x) * 0.35
    g.strokeStyle = dark > 0.5 ? '#555' : '#212529'; g.lineWidth = 2.5
    g.beginPath(); g.moveTo(sx - 9 * Math.cos(a), sy - 12 - 9 * Math.sin(a)); g.lineTo(sx + 9 * Math.cos(a), sy - 12 + 9 * Math.sin(a)); g.stroke()
    g.fillStyle = '#e03131'; g.fillRect(sx + 8 * Math.cos(a) - 2, sy - 12 + 8 * Math.sin(a) - 1, 4, 5)
  }
  // port cranes swing
  for (const [x, y] of sc.cranes) {
    const { sx, sy } = iso(x, y)
    const off = Math.sin(t * 0.6 + x) * 8
    g.strokeStyle = '#495057'; g.lineWidth = 1; g.beginPath(); g.moveTo(sx + 6 + off, sy - 30); g.lineTo(sx + 6 + off, sy - 16); g.stroke()
    g.fillStyle = '#1971c2'; g.fillRect(sx + 3 + off, sy - 16, 7, 4)
  }
  // nuclear steam & refinery flares
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) {
    const cell = sc.cells[x][y]
    if (cell.kind === 'nuclear') {
      const { sx, sy } = iso(x, y)
      for (const ox of [-9, 9]) for (let k = 0; k < 4; k++) {
        const ph = (t * 0.25 + k / 4 + ox) % 1
        g.fillStyle = `rgba(240,240,245,${0.5 * (1 - ph)})`; g.beginPath(); g.arc(sx + ox + ph * 10, sy - 28 - ph * 30, 5 + ph * 10, 0, Math.PI * 2); g.fill()
      }
    } else if (cell.kind === 'refinery') {
      const { sx, sy } = iso(x, y)
      g.fillStyle = `rgba(255,${140 + Math.floor(Math.random() * 60)},40,0.9)`; g.beginPath(); g.arc(sx + 13, sy - 32, 3 + Math.random() * 2, 0, Math.PI * 2); g.fill()
    } else if (cell.kind === 'construction') {
      const { sx, sy } = iso(x, y)
      const a = t * 0.4 + x
      g.strokeStyle = '#fab005'; g.lineWidth = 2
      g.beginPath(); g.moveTo(sx + 14, sy); g.lineTo(sx + 14, sy - 46); g.stroke()
      g.beginPath(); g.moveTo(sx + 14, sy - 46); g.lineTo(sx + 14 + Math.cos(a) * 26, sy - 46 + Math.sin(a) * 6); g.stroke()
    } else if (cell.kind === 'airport' && sc.planes.length) {
      const ph = (t / 14 + x) % 1
      const p0 = iso(x - 2, y), p1 = iso(x + 4, y)
      const px = p0.sx + (p1.sx - p0.sx) * ph, py = p0.sy + (p1.sy - p0.sy) * ph - Math.max(0, ph - 0.45) * 90
      g.fillStyle = '#f8f9fa'; g.beginPath(); g.moveTo(px - 8, py); g.lineTo(px + 8, py - 3); g.lineTo(px + 6, py + 1); g.closePath(); g.fill()
      g.fillRect(px - 2, py - 5, 3, 8)
      if (dark > 0.5) { g.fillStyle = '#ff6b6b'; g.fillRect(px + 7, py - 3, 2, 2) }
    }
  }
  // smoke
  for (const p of particles) { g.fillStyle = `rgba(${p.color},${0.45 * p.life})`; g.beginPath(); g.arc(p.x, p.y, p.size, 0, Math.PI * 2); g.fill() }
  // people & vehicles
  const sorted = [...sc.agents].sort((a, b) => a.x + a.y - (b.x + b.y))
  for (const a of sorted) {
    const { sx, sy } = iso(a.x, a.y)
    if (a.kind === 'car') {
      g.fillStyle = a.color; g.fillRect(sx - 4, sy - 4, 8, 4)
      if (dark > 0.5) { g.fillStyle = 'rgba(255,240,180,0.9)'; g.fillRect(sx + 3, sy - 3, 2, 2) }
    } else {
      const bob = Math.sin(t * 8 + a.x * 5) * 0.6
      g.fillStyle = a.kind === 'soldier' ? '#495a2c' : a.color
      g.fillRect(sx - 1.2, sy - 6 + bob, 2.4, 4)
      g.fillStyle = a.kind === 'soldier' ? '#3b4a22' : '#f1c27d'
      g.beginPath(); g.arc(sx, sy - 7.5 + bob, 1.4, 0, Math.PI * 2); g.fill()
      if (a.kind === 'protester' && Math.floor(a.x * 10) % 3 === 0) { g.fillStyle = '#fa5252'; g.fillRect(sx + 1, sy - 13 + bob, 5, 3); g.fillStyle = '#ddd'; g.fillRect(sx + 1, sy - 13 + bob, 0.8, 8) }
    }
  }
  g.restore()
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const r = cv.value!.getBoundingClientRect()
  const mx = e.clientX - r.left, my = e.clientY - r.top
  const k = Math.exp(-e.deltaY * 0.0015)
  const z = Math.max(0.3, Math.min(4, cam.z * k))
  cam.x = mx - (mx - cam.x) * (z / cam.z); cam.y = my - (my - cam.y) * (z / cam.z); cam.z = z
}
function onDown(e: PointerEvent) { dragging = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y } }
function onMove(e: PointerEvent) {
  if (dragging) { cam.x = dragging.cx + e.clientX - dragging.x; cam.y = dragging.cy + e.clientY - dragging.y; tip.value = null; return }
  if (!scene) return
  const r = cv.value!.getBoundingClientRect()
  const wx = (e.clientX - r.left - cam.x) / cam.z - OX, wy = (e.clientY - r.top - cam.y) / cam.z - OY
  const fx = wx / (TW / 2), fy = wy / (TH / 2)
  const x = Math.round((fx + fy) / 2), y = Math.round((fy - fx) / 2)
  const cell = scene.cells[x]?.[y]
  const label = cell?.label ?? (cell?.kind === 'water' ? 'Sea' : cell?.kind === 'road' || cell?.kind === 'avenue' ? 'Street' : cell?.kind === 'farm' ? 'Farmland' : cell?.kind === 'forest' ? 'Forest' : null)
  tip.value = label ? { x: e.clientX - r.left + 12, y: e.clientY - r.top + 12, text: label } : null
}
function onUp() { dragging = null }

let ro: ResizeObserver | null = null
function resize() {
  const c = cv.value!, w = wrap.value!
  const dpr = window.devicePixelRatio || 1
  c.width = w.clientWidth * dpr; c.height = w.clientHeight * dpr
  c.style.width = w.clientWidth + 'px'; c.style.height = w.clientHeight + 'px'
}
onMounted(() => {
  rebuild(); resize(); fit()
  ro = new ResizeObserver(() => { resize() }); ro.observe(wrap.value!)
  raf = requestAnimationFrame(frame)
})
onBeforeUnmount(() => { cancelAnimationFrame(raf); ro?.disconnect() })
const shapeKey = () => [props.detail.jobs.map(j => Math.round(Math.log2(j + 1))).join(','), props.detail.projects.map(p => p.id + p.done).join(','), Math.round(props.detail.unrest / 15), Math.round(props.detail.garrison), props.detail.policy.security, Math.round(props.detail.gdppc / 5000)].join('|')
watch(shapeKey, () => { rebuild(); roads = null })
defineExpose({ fit })
</script>

<template>
  <div ref="wrap" class="iso" @wheel="onWheel">
    <canvas ref="cv" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointerleave="onUp(); tip = null" />
    <div v-if="tip" class="tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
    <div class="hint">Drag to pan · scroll to zoom</div>
  </div>
</template>

<style scoped>
.iso { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 10px; cursor: grab; }
.iso:active { cursor: grabbing; }
canvas { display: block; }
.tip { position: absolute; pointer-events: none; background: rgba(10, 14, 22, 0.92); border: 1px solid var(--line); padding: 4px 8px; border-radius: 6px; font-size: 12px; white-space: nowrap; }
.hint { position: absolute; bottom: 8px; left: 10px; font-size: 11px; color: rgba(255, 255, 255, 0.55); pointer-events: none; }
</style>
