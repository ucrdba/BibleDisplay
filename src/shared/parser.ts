import { resolveBook, type BookMatch } from './resolve'
import type { BibleIndex, Book, ParseResult, RefError, RefGroup } from './types'

// book text (lazy), then chapter[:verse][-chapter-or-verse[:verse] | ..]
// A trailing ".." means "through the end of the chapter".
const ITEM_RE = /^(.*?)\s*(\d+)(?:\s*[:.]\s*(\d+))?(?:\s*[-–—]\s*(\d+)(?:\s*[:.]\s*(\d+))?|\s*(\.\.))?\s*$/

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
    let book: Book
    if (bookText) {
      // Check if bookText looks incomplete (ends with punctuation)
      if (/[\s:\-–—]$/.test(bookText)) {
        fail(`Incomplete reference "${item.text}"`)
        continue
      }
      const r = resolveBook(bookText)
      if (r.kind !== 'book') {
        fail(bookError(bookText, r))
        continue
      }
      book = r.book
    } else {
      if (!lastBook) {
        fail('Missing book name')
        continue
      }
      book = lastBook
    }

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
      inputStart: item.start,
      inputEnd: item.end,
    })
    lastBook = book
    lastChapter = ec
    lastWasVerse = !whole
  }

  return { groups, errors }
}
