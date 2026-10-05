import type { BibleVerse, StrongsSpan } from './types'

export interface VersePoint {
  bookId: number
  chapter: number
  verse: number
  offset: number
}

/** The tagged word covering an offset; an offset right after a word's last letter still counts. */
export function strongsAt(spans: StrongsSpan[], offset: number): StrongsSpan | null {
  return spans.find(s => s.start <= offset && offset <= s.end) ?? null
}

const WORD_CHAR = /[A-Za-z\u00c0-\u024f'\u2019]/

/** The run of word characters around an offset (or ending at it), or null between words. */
export function wordAt(text: string, offset: number): { start: number; end: number; word: string } | null {
  let start = offset
  let end = offset
  // A hyphen belongs to the word only with a letter on both sides ("Beth-el").
  const inner = (i: number) =>
    WORD_CHAR.test(text[i]) || (text[i] === '-' && i > 0 && WORD_CHAR.test(text[i - 1]) && i + 1 < text.length && WORD_CHAR.test(text[i + 1]))
  while (start > 0 && inner(start - 1)) start--
  while (end < text.length && inner(end)) end++
  if (end === start) return null
  return { start, end, word: text.slice(start, end) }
}

export type LookupTarget = { kind: 'tagged'; span: StrongsSpan; word: string } | { kind: 'untagged'; word: string; start: number; end: number } | null

/** What a click at a verse offset refers to: a tagged word, an untagged word, or nothing. */
export function lookupTarget(
  verses: Pick<BibleVerse, 'bookId' | 'chapter' | 'verse' | 'text' | 'strongs'>[],
  p: VersePoint,
): LookupTarget {
  const v = verses.find(x => x.bookId === p.bookId && x.chapter === p.chapter && x.verse === p.verse)
  if (!v) return null
  const span = strongsAt(v.strongs ?? [], p.offset)
  if (span) return { kind: 'tagged', span, word: v.text.slice(span.start, span.end) }
  const w = wordAt(v.text, p.offset)
  return w ? { kind: 'untagged', word: w.word, start: w.start, end: w.end } : null
}

/** Splits text into plain parts and Strong's numbers (H123, G456) for linking. */
export function splitStrongsRefs(text: string): ({ text: string } | { id: string })[] {
  const out: ({ text: string } | { id: string })[] = []
  let pos = 0
  for (const m of text.matchAll(/\b[HG]\d+\b/g)) {
    if (m.index > pos) out.push({ text: text.slice(pos, m.index) })
    out.push({ id: m[0] })
    pos = m.index + m[0].length
  }
  if (pos < text.length || out.length === 0) out.push({ text: text.slice(pos) })
  return out
}

/** Whether a point lies within any of the rectangles (edges included). */
export function pointInRects(
  rects: { left: number; right: number; top: number; bottom: number }[],
  x: number,
  y: number,
): boolean {
  return rects.some(r => r.left <= x && x <= r.right && r.top <= y && y <= r.bottom)
}
