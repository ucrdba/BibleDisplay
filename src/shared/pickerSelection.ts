import { bookById } from './books'
import type { BibleIndex } from './types'

/** A shown passage; a RefGroup is assignable to it. */
export interface Passage {
  bookId: number
  startChapter: number
  startVerse: number
  endChapter: number
  endVerse: number
  /** A whole chapter (or chapters) as typed, e.g. "ps 23". */
  whole: boolean
}

export interface VerseRef {
  bookId: number
  chapter: number
  verse: number
}

export interface ClickMods {
  ctrl: boolean
  shift: boolean
}

type Point = { chapter: number; verse: number }

const cmp = (a: Point, b: Point) => a.chapter - b.chapter || a.verse - b.verse
const startOf = (p: Passage): VerseRef => ({ bookId: p.bookId, chapter: p.startChapter, verse: p.startVerse })
const endOf = (p: Passage): VerseRef => ({ bookId: p.bookId, chapter: p.endChapter, verse: p.endVerse })
const sameVerse = (a: VerseRef | null, b: VerseRef) => !!a && a.chapter === b.chapter && a.verse === b.verse

function span(bookId: number, from: Point, to: Point): Passage {
  return { bookId, startChapter: from.chapter, startVerse: from.verse, endChapter: to.chapter, endVerse: to.verse, whole: false }
}

function nextVerse(v: VerseRef, index: BibleIndex): VerseRef | null {
  if (v.verse < index.verseCount(v.bookId, v.chapter)) return { ...v, verse: v.verse + 1 }
  if (v.chapter < bookById(v.bookId).chapters) return { ...v, chapter: v.chapter + 1, verse: 1 }
  return null
}

function prevVerse(v: VerseRef, index: BibleIndex): VerseRef | null {
  if (v.verse > 1) return { ...v, verse: v.verse - 1 }
  if (v.chapter > 1) return { ...v, chapter: v.chapter - 1, verse: index.verseCount(v.bookId, v.chapter - 1) }
  return null
}

const contains = (p: Passage, v: VerseRef) => p.bookId === v.bookId && cmp(startOf(p), v) <= 0 && cmp(v, endOf(p)) <= 0

const containsPassage = (p: Passage, r: Passage) =>
  p.bookId === r.bookId && cmp(startOf(p), startOf(r)) <= 0 && cmp(endOf(r), endOf(p)) <= 0

/** Same book and overlapping, or one starts on the verse right after the other ends. */
function touches(a: Passage, b: Passage, index: BibleIndex): boolean {
  if (a.bookId !== b.bookId) return false
  const gap = (x: Passage, y: Passage) =>
    cmp(endOf(x), startOf(y)) < 0 && !sameVerse(nextVerse(endOf(x), index), startOf(y))
  return !gap(a, b) && !gap(b, a)
}

function hull(a: Passage, b: Passage): Passage {
  const from = cmp(startOf(a), startOf(b)) <= 0 ? startOf(a) : startOf(b)
  const to = cmp(endOf(a), endOf(b)) >= 0 ? endOf(a) : endOf(b)
  return span(a.bookId, from, to)
}

export const isSelected = (passages: Passage[], v: VerseRef) => passages.some(p => contains(p, v))

export function selectedBooks(passages: Passage[]): Set<number> {
  return new Set(passages.map(p => p.bookId))
}

export function selectedChapters(passages: Passage[], bookId: number): Set<number> {
  const out = new Set<number>()
  for (const p of passages) {
    if (p.bookId !== bookId) continue
    for (let c = p.startChapter; c <= p.endChapter; c++) out.add(c)
  }
  return out
}

export function rangeOf(a: VerseRef, b: VerseRef): Passage {
  return cmp(a, b) <= 0 ? span(a.bookId, a, b) : span(a.bookId, b, a)
}

export function wholeChapter(bookId: number, chapter: number, index: BibleIndex): Passage {
  return { ...span(bookId, { chapter, verse: 1 }, { chapter, verse: index.verseCount(bookId, chapter) }), whole: true }
}

/**
 * Adds a range: it absorbs every passage it overlaps or touches (repeatedly, as it grows) and takes
 * the position of the earliest one; otherwise it is appended. Other passages are left untouched.
 */
export function addRange(passages: Passage[], range: Passage, index: BibleIndex): Passage[] {
  if (passages.some(p => containsPassage(p, range))) return passages
  let merged = range
  let position = -1
  const absorbed = new Set<number>()
  for (let changed = true; changed; ) {
    changed = false
    passages.forEach((p, i) => {
      if (absorbed.has(i) || !touches(p, merged, index)) return
      absorbed.add(i)
      position = position === -1 ? i : Math.min(position, i)
      merged = hull(p, merged)
      changed = true
    })
  }
  if (position === -1) return [...passages, range]
  const out: Passage[] = []
  passages.forEach((p, i) => {
    if (i === position) out.push(merged)
    else if (!absorbed.has(i)) out.push(p)
  })
  return out
}

/** Removes a shown verse (splitting its passage in place) or adds one (joining a passage it touches). */
export function toggleVerse(passages: Passage[], v: VerseRef, index: BibleIndex): Passage[] {
  const i = passages.findIndex(p => contains(p, v))
  if (i === -1) return addRange(passages, span(v.bookId, v, v), index)
  const p = passages[i]
  const pieces: Passage[] = []
  const before = prevVerse(v, index)
  const after = nextVerse(v, index)
  if (before && cmp(startOf(p), before) <= 0) pieces.push(span(p.bookId, startOf(p), before))
  if (after && cmp(after, endOf(p)) <= 0) pieces.push(span(p.bookId, after, endOf(p)))
  return [...passages.slice(0, i), ...pieces, ...passages.slice(i + 1)]
}

/** Windows list rules: click, Ctrl+click, Shift+click, Ctrl+Shift+click. Shift ranges stay in one book. */
export function pickerClick(
  passages: Passage[],
  v: VerseRef,
  mods: ClickMods,
  anchor: VerseRef | null,
  index: BibleIndex,
): { passages: Passage[]; anchor: VerseRef | null } {
  const usable = anchor && anchor.bookId === v.bookId ? anchor : null
  if (mods.shift && usable) {
    const range = rangeOf(usable, v)
    return { passages: mods.ctrl ? addRange(passages, range, index) : [range], anchor: usable }
  }
  if (mods.ctrl) return { passages: toggleVerse(passages, v, index), anchor: v }
  return { passages: [span(v.bookId, v, v)], anchor: v }
}

/** Reference text the parser reads back to the same passages, e.g. "Joh 3:16-18, Psa 23". */
export function toReferenceText(passages: Passage[]): string {
  return passages
    .map(p => {
      const book = bookById(p.bookId)
      const code = book.abbrev3
      // "Jud 1" would be read as verse 1, so whole one-chapter books are written as verse ranges.
      if (p.whole && book.chapters > 1) {
        return p.startChapter === p.endChapter ? `${code} ${p.startChapter}` : `${code} ${p.startChapter}-${p.endChapter}`
      }
      if (p.startChapter === p.endChapter) {
        return p.startVerse === p.endVerse
          ? `${code} ${p.startChapter}:${p.startVerse}`
          : `${code} ${p.startChapter}:${p.startVerse}-${p.endVerse}`
      }
      return `${code} ${p.startChapter}:${p.startVerse}-${p.endChapter}:${p.endVerse}`
    })
    .join(', ')
}
