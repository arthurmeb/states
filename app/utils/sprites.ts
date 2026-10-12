// Procedurally drawn map sprites (isometric mini-skylines, industry badges, army shields).

type Img = { width: number; height: number; data: Uint8ClampedArray }

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  return { c, x: c.getContext('2d')! }
}
const out = (c: HTMLCanvasElement): Img => {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height)
  return { width: c.width, height: c.height, data: d.data }
}
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)))
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)))
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)))
  return `rgb(${r},${g},${b})`
}

/** One isometric box with lit windows. */
export function isoBox(x: CanvasRenderingContext2D, cx: number, by: number, w: number, d: number, h: number, color: string, windows = true, night = false) {
  const hw = w / 2, hd = d / 2
  // left face
  x.fillStyle = shade(color, night ? 0.35 : 0.72)
  x.beginPath(); x.moveTo(cx - hw, by - hd / 2); x.lineTo(cx, by); x.lineTo(cx, by - h); x.lineTo(cx - hw, by - hd / 2 - h); x.closePath(); x.fill()
  // right face
  x.fillStyle = shade(color, night ? 0.25 : 0.55)
  x.beginPath(); x.moveTo(cx + hw, by - hd / 2); x.lineTo(cx, by); x.lineTo(cx, by - h); x.lineTo(cx + hw, by - hd / 2 - h); x.closePath(); x.fill()
  // roof
  x.fillStyle = shade(color, night ? 0.5 : 1.05)
  x.beginPath(); x.moveTo(cx, by - h); x.lineTo(cx - hw, by - hd / 2 - h); x.lineTo(cx, by - hd - h); x.lineTo(cx + hw, by - hd / 2 - h); x.closePath(); x.fill()
  if (windows && h > 6) {
    x.fillStyle = night ? 'rgba(255,220,130,0.9)' : 'rgba(200,230,255,0.55)'
    for (let yy = by - 4; yy > by - h + 3; yy -= 4) {
      for (let k = 0.2; k < 0.95; k += 0.3) {
        const lx = cx - hw * k, ly = yy - (hd / 2) * k
        if (!night || Math.random() < 0.7) x.fillRect(lx - 0.6, ly - 1, 1.3, 1.6)
        const rx = cx + hw * k, ry = yy - (hd / 2) * k
        if (!night || Math.random() < 0.6) x.fillRect(rx - 0.6, ry - 1, 1.3, 1.6)
      }
    }
  }
}

const PALETTES = [
  ['#c9a27a', '#b88b62', '#d8b48a'], // poor: adobe & brick
  ['#b9b2a8', '#9fa6ad', '#cfc6b8'], // middle: concrete
  ['#8fb8d8', '#a7c7e7', '#c9d6e3'], // rich: glass
]

/** City skyline icon: size class 0-4 (village → megacity), wealth tier 0-2. */
export function cityIcon(size: number, wealth: number, night = false): Img {
  const W = 72, H = 72
  const { c, x } = canvas(W, H)
  const pal = PALETTES[wealth]
  let seed = size * 31 + wealth * 7 + 3
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
  // ground diamond
  const gw = 18 + size * 9
  x.fillStyle = night ? 'rgba(255,200,120,0.25)' : 'rgba(30,40,30,0.45)'
  x.beginPath(); x.moveTo(W / 2, H - 6); x.lineTo(W / 2 - gw, H - 6 - gw / 2); x.lineTo(W / 2, H - 6 - gw); x.lineTo(W / 2 + gw, H - 6 - gw / 2); x.closePath(); x.fill()
  const count = [3, 5, 7, 10, 14][size]
  const maxH = [6, 12, 20, 30, 42][size] * (0.7 + wealth * 0.2)
  const blocks: { cx: number; by: number; h: number; w: number; col: string }[] = []
  for (let i = 0; i < count; i++) {
    const a = rnd() * 2 - 1, b = rnd() * 2 - 1
    const cx = W / 2 + (a - b) * gw * 0.42
    const by = H - 6 - gw / 2 + (a + b) * gw * 0.21
    const central = 1 - Math.min(1, Math.hypot(a, b))
    blocks.push({ cx, by, h: 3 + maxH * (0.25 + 0.75 * central) * (0.6 + rnd() * 0.6), w: 6 + rnd() * 4 + size, col: pal[Math.floor(rnd() * 3)] })
  }
  blocks.sort((p, q) => p.by - q.by)
  for (const bl of blocks) isoBox(x, bl.cx, bl.by, bl.w, bl.w, bl.h, bl.col, true, night)
  return out(c)
}

/** Round badge with an emoji glyph (industry, project). */
export function badge(emoji: string, ring: string): Img {
  const S = 48
  const { c, x } = canvas(S, S)
  x.fillStyle = 'rgba(8,12,20,0.82)'
  x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2); x.fill()
  x.strokeStyle = ring; x.lineWidth = 3; x.stroke()
  x.font = `${S * 0.5}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`
  x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillText(emoji, S / 2, S / 2 + 2)
  return out(c)
}

/** Army shield token. */
export function shield(color: string): Img {
  const W = 40, H = 46
  const { c, x } = canvas(W, H)
  x.fillStyle = color
  x.strokeStyle = 'rgba(0,0,0,0.7)'; x.lineWidth = 2.5
  x.beginPath(); x.moveTo(W / 2, 3); x.lineTo(W - 4, 9); x.lineTo(W - 6, 26); x.quadraticCurveTo(W / 2, 44, W / 2, 44); x.quadraticCurveTo(W / 2, 44, 6, 26); x.lineTo(4, 9); x.closePath()
  x.fill(); x.stroke()
  x.fillStyle = 'rgba(255,255,255,0.85)'
  x.font = 'bold 15px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'
  x.fillText('⚔', W / 2, 22)
  return out(c)
}

/** Small ship for trade lanes. */
export function ship(): Img {
  const { c, x } = canvas(28, 18)
  x.fillStyle = '#e9ecef'
  x.beginPath(); x.moveTo(2, 9); x.lineTo(26, 9); x.lineTo(22, 15); x.lineTo(6, 15); x.closePath(); x.fill()
  x.fillStyle = '#ff922b'; x.fillRect(8, 4, 5, 5); x.fillStyle = '#4dabf7'; x.fillRect(13, 5, 5, 4); x.fillStyle = '#51cf66'; x.fillRect(18, 6, 3, 3)
  return out(c)
}
