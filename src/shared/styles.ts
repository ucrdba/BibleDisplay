export interface TextStyle {
  font: string
  size: number
  color: string
}

export interface Styles {
  heading: TextStyle & { bold: boolean }
  verse: TextStyle
  jesusColor: string
  verseNumbers: { show: boolean; color: string }
  background: string
  scale: number
  layout: 'paragraph' | 'lines'
}

export const SCALE_MIN = 0.5
export const SCALE_MAX = 3
export const SCALE_STEP = 0.1

export const DEFAULT_STYLES: Styles = {
  heading: { font: 'Georgia', size: 44, color: '#f0c040', bold: true },
  verse: { font: 'Georgia', size: 40, color: '#f2f2f2' },
  jesusColor: '#ff4a4a',
  verseNumbers: { show: true, color: '#9a9a9a' },
  background: '#111111',
  scale: 1,
  layout: 'paragraph',
}

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null ? (v as Obj) : {})
const str = (v: unknown, d: string) => (typeof v === 'string' && v.length > 0 ? v : d)
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)

export function clampScale(s: number): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(s * 10) / 10))
}

export function stepScale(s: number, dir: 1 | -1): number {
  return clampScale(s + dir * SCALE_STEP)
}

export function normalizeStyles(raw: unknown): Styles {
  const D = DEFAULT_STYLES
  const r = obj(raw)
  const h = obj(r.heading)
  const v = obj(r.verse)
  const n = obj(r.verseNumbers)
  return {
    heading: {
      font: str(h.font, D.heading.font),
      size: num(h.size, D.heading.size),
      color: str(h.color, D.heading.color),
      bold: bool(h.bold, D.heading.bold),
    },
    verse: {
      font: str(v.font, D.verse.font),
      size: num(v.size, D.verse.size),
      color: str(v.color, D.verse.color),
    },
    jesusColor: str(r.jesusColor, D.jesusColor),
    verseNumbers: { show: bool(n.show, D.verseNumbers.show), color: str(n.color, D.verseNumbers.color) },
    background: str(r.background, D.background),
    scale: clampScale(num(r.scale, D.scale)),
    layout: r.layout === 'lines' ? 'lines' : 'paragraph',
  }
}

export function fontStack(font: string): string {
  return `"${font.replace(/"/g, '')}", Georgia, serif`
}
