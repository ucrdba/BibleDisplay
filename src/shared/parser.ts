import { resolveBook, type BookMatch } from './resolve'
import type { BibleIndex, Book, ParseResult, RefError, RefGroup } from './types'

// book text (lazy), then chapter[:verse][-chapter-or-verse[:verse] | ..]
// A trailing ".." means "through the end of the chapter".
const ITEM_RE = /^(.*?)\s*(\d+)(?:\s*[:.]\s*(\d+))?(?:\s*[-–—]\s*(\d+)(?:\s*[:.]\s*(\d+))?|\s*(\.\.))?\s*$/

// A verse list: chapter[:.]verse followed by more verses separated by ".", where ".." between two numbers is a
// range and a final ".." runs to the end of the chapter, e.g. "ps 23.1..3.5.7..". It needs at least two numbers
// after the chapter, so "ps 23.1" and "luke 1.18.." keep their usual meaning.
const LIST_RE = /^(.*?)\s*(\d+)\s*[:.]\s*(\d+(?:\s*(?:\.\.?|[-–—])\s*\d+)+(?:\s*\.\.)?)\s*$/
// The dash forms that look like a list head but are ordinary ranges: "1:3-5", "1:50-2:3", "1.50-2.3".
const DASH_RANGE_RE = /^\d+\s*[-–—]\s*\d+(?:\s*[:.]\s*\d+)?$/

interface ListItem {
  from: number
  to: number | null
  toEnd: boolean
}

type ListParse = { kind: 'list'; items: ListItem[] } | { kind: 'error'; message: string }

/** The verses after "chapter." in a verse list (already matched by LIST_RE). */
function parseVerseList(rest: string): ListParse {
  if (/[-–—]/.test(rest)) return { kind: 'error', message: 'Use .. for a range in a verse list, e.g. ps 23.1.3..5' }
  const tokens = rest.replace(/\s+/g, '').match(/\d+|\.\.|\./g) ?? []
  const items: ListItem[] = []
  let i = 0
  while (i < tokens.length) {
    const v: ListItem = { from: Number(tokens[i]), to: null, toEnd: false }
    i++
    if (tokens[i] === '..' && /^\d/.test(tokens[i + 1] ?? '')) {
      v.to = Number(tokens[i + 1])
      i += 2
    }
    if (tokens[i] === '..') {
      if (v.to !== null) return { kind: 'error', message: "'..' at the end goes after a single verse" }
      v.toEnd = true
      i++
    }
    items.push(v)
    if (tokens[i] === '.') i++
  }
  return { kind: 'list', items }
}

interface Item {
  text: string
  start: number
  end: number
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

function splitItems(input: string): Item[] {
  const items: Item[] = []
  for (const m of input.matchAll(/[^,;]+/g)) {
    const raw = m[0]
    const text = raw.trim()
    if (!text) continue
    const start = (m.index ?? 0) + (raw.length - raw.trimStart().length)
    items.push({ text, start, end: start + text.length })
  }
  return items
}

function bookError(text: string, match: BookMatch): string {
  if (match.kind === 'ambiguous') return `"${text}" matches ${match.candidates.map(b => b.name).join(', ')}`
  return `Unknown book "${text}"`
}

function formatLabel(book: Book, sc: number, sv: number, ec: number, ev: number, whole: boolean): string {
  if (whole) return sc === ec ? `${book.name} ${sc}` : `${book.name} ${sc}-${ec}`
  if (sc === ec) return sv === ev ? `${book.name} ${sc}:${sv}` : `${book.name} ${sc}:${sv}-${ev}`
  return `${book.name} ${sc}:${sv}-${ec}:${ev}`
}

function validate(book: Book, sc: number, sv: number, ec: number, ev: number, index: BibleIndex): string | null {
  if ([sc, sv, ec, ev].some(n => n < 1)) return 'Chapter and verse numbers start at 1'
  for (const ch of [sc, ec]) {
    if (ch > book.chapters) return `${book.name} has only ${plural(book.chapters, 'chapter')}`
  }
  for (const [ch, v] of [
    [sc, sv],
    [ec, ev],
  ]) {
    const count = index.verseCount(book.id, ch)
    if (v > count) return `${book.name} ${ch} has only ${plural(count, 'verse')}`
  }
  if (ec < sc || (ec === sc && ev < sv)) return 'Range ends before it starts'
  return null
}

export function parseReferences(input: string, index: BibleIndex): ParseResult {
  const groups: RefGroup[] = []
  const errors: RefError[] = []
  let lastBook: Book | null = null
  let lastChapter = 0
  let lastWasVerse = false

  for (const item of splitItems(input)) {
    const fail = (message: string) => errors.push({ message, inputStart: item.start, inputEnd: item.end })

    // The book named in this item, or the previous item's book when none is named; null after reporting a problem.
    const bookFor = (bookText: string): Book | null => {
      if (!bookText) {
        if (!lastBook) fail('Missing book name')
        return lastBook
      }
      // Check if bookText looks incomplete (ends with punctuation, or a number then periods as in "ps 23..25")
      if (/[\s:\-–—]$/.test(bookText) || /\d\s*\.+$/.test(bookText)) {
        fail(`Incomplete reference "${item.text}"`)
        return null
      }
      const r = resolveBook(bookText)
      if (r.kind !== 'book') {
        fail(bookError(bookText, r))
        return null
      }
      return r.book
    }

    const list = LIST_RE.exec(item.text)
    if (list && !DASH_RANGE_RE.test(list[3])) {
      const book = bookFor(list[1])
      if (!book) continue
      const chapter = Number(list[2])
      const parsed = parseVerseList(list[3])
      if (parsed.kind === 'error') {
        fail(parsed.message)
        continue
      }
      const made: RefGroup[] = []
      let problem: string | null = null
      for (const v of parsed.items) {
        const ev = v.toEnd ? Math.max(v.from, index.verseCount(book.id, chapter)) : (v.to ?? v.from)
        problem = validate(book, chapter, v.from, chapter, ev, index)
        if (problem) break
        made.push({
          label: formatLabel(book, chapter, v.from, chapter, ev, false),
          bookId: book.id,
          startChapter: chapter,
          startVerse: v.from,
          endChapter: chapter,
          endVerse: ev,
          whole: false,
          inputStart: item.start,
          inputEnd: item.end,
        })
      }
      if (problem) {
        fail(problem)
        continue
      }
      groups.push(...made)
      lastBook = book
      lastChapter = chapter
      lastWasVerse = true
      continue
    }

    const m = ITEM_RE.exec(item.text)
    if (!m) {
      const bookPart = item.text.replace(/[\s\d:.\-–—]+$/, '')
      if (!bookPart) {
        fail(`Incomplete reference "${item.text}"`)
        continue
      }
      const r = resolveBook(bookPart)
      if (r.kind !== 'book') {
        fail(bookError(bookPart, r))
      } else {
        const tail = item.text.slice(bookPart.length)
        if (!/\d/.test(tail)) {
          fail(`Missing chapter after "${r.book.name}"`)
        } else {
          fail(`Incomplete reference "${item.text}"`)
        }
      }
      continue
    }

    const [, bookText, a, b, c, d, toEnd] = m
    const book = bookFor(bookText)
    if (!book) continue

    const n1 = Number(a)
    const n2 = b === undefined ? undefined : Number(b)
    const n3 = c === undefined ? undefined : Number(c)
    const n4 = d === undefined ? undefined : Number(d)
    let sc: number, sv: number, ec: number, ev: number
    let whole = false

    const bareVerse = n2 === undefined && ((!bookText && lastWasVerse) || (!!bookText && book.chapters === 1))
    if (bareVerse) {
      // "18", "18-20", "18-4:2" after a verse reference; or "jude 5"
      sc = bookText ? 1 : lastChapter
      sv = n1
      ec = sc
      ev = toEnd ? Math.max(sv, index.verseCount(book.id, sc)) : (n3 ?? n1)
      if (n3 !== undefined && n4 !== undefined) {
        ec = n3
        ev = n4
      }
    } else if (toEnd && n2 === undefined) {
      // ".." needs a starting verse: "luke 1.." is incomplete
      fail(`Incomplete reference "${item.text}"`)
      continue
    } else if (n2 === undefined) {
      // "23", "23-25", or "1-2:3"
      sc = n1
      sv = 1
      if (n3 !== undefined && n4 !== undefined) {
        ec = n3
        ev = n4
      } else {
        whole = true
        ec = n3 ?? n1
        ev = ec >= 1 && ec <= book.chapters ? index.verseCount(book.id, ec) : 1
      }
    } else {
      // "3:16", "1:3-5", "1:50-2:3"
      sc = n1
      sv = n2
      if (toEnd) {
        // "1:18.." runs to the end of the chapter
        ec = sc
        ev = Math.max(sv, index.verseCount(book.id, sc))
      } else if (n3 === undefined) {
        ec = sc
        ev = sv
      } else if (n4 === undefined) {
        ec = sc
        ev = n3
      } else {
        ec = n3
        ev = n4
      }
    }

    const problem = validate(book, sc, sv, ec, ev, index)
    if (problem) {
      fail(problem)
      continue
    }

    groups.push({
      label: formatLabel(book, sc, sv, ec, ev, whole),
      bookId: book.id,
      startChapter: sc,
      startVerse: sv,
      endChapter: ec,
      endVerse: ev,
      whole,
      inputStart: item.start,
      inputEnd: item.end,
    })
    lastBook = book
    lastChapter = ec
    lastWasVerse = !whole
  }

  return { groups, errors }
}
