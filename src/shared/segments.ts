import type { Highlight, Span } from './types'

export type SegmentKind = 'normal' | 'jesus' | 'highlight'

export interface Segment {
  start: number
  end: number
  text: string
  kind: SegmentKind
  color?: string
}

export function buildSegments(text: string, redLetter: Span[], highlights: Highlight[]): Segment[] {
  const n = text.length
  if (n === 0) return []
  const kind: SegmentKind[] = new Array(n).fill('normal')
  const color: (string | undefined)[] = new Array(n).fill(undefined)
  const fits = (s: Span) => s.start >= 0 && s.end <= n && s.start < s.end

  for (const s of redLetter) {
    if (!fits(s)) continue
    for (let i = s.start; i < s.end; i++) kind[i] = 'jesus'
  }
  for (const h of highlights) {
    if (!fits(h)) continue
    for (let i = h.start; i < h.end; i++) {
      kind[i] = 'highlight'
      color[i] = h.color
    }
  }

  const out: Segment[] = []
  let start = 0
  for (let i = 1; i <= n; i++) {
    if (i === n || kind[i] !== kind[start] || color[i] !== color[start]) {
      const seg: Segment = { start, end: i, text: text.slice(start, i), kind: kind[start] }
      if (color[start] !== undefined) seg.color = color[start]
      out.push(seg)
      start = i
    }
  }
  return out
}
