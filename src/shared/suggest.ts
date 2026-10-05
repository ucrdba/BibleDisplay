import { BOOKS } from './books'
import { plural } from './parser'
import { bookKeys, normalizeBookText, resolveBook } from './resolve'
import type { BibleIndex, Book } from './types'

export type Suggestion =
  | { kind: 'books'; books: Book[]; replaceStart: number; replaceEnd: number }
  | { kind: 'hint'; text: string }
  | { kind: 'none' }

const NONE: Suggestion = { kind: 'none' }
const BOOK_TEXT_RE = /^[1-3]?\s*[a-z][a-z .]*$/i
const HINT_RE = /^(.*[a-z.])\s+(?:(\d+)([:.]\d*)?)?$/i

export function matchBooks(text: string, limit = 8): Book[] {
  const key = normalizeBookText(text)
  if (!key) return []
  const exact: Book[] = []
  const namePrefix: Book[] = []
  const keyPrefix: Book[] = []
  for (const book of BOOKS) {
    const keys = bookKeys(book)
    if (keys.includes(key)) exact.push(book)
    else if (normalizeBookText(book.name).startsWith(key)) namePrefix.push(book)
    else if (keys.some(k => k.startsWith(key))) keyPrefix.push(book)
  }
  return [...exact, ...namePrefix, ...keyPrefix].slice(0, limit)
}

export function suggest(input: string, caret: number, index: BibleIndex): Suggestion {
  if (/^\s*[?/]/.test(input)) return NONE
  const before = input.slice(0, caret)
  const itemStart = Math.max(before.lastIndexOf(','), before.lastIndexOf(';')) + 1
  const raw = input.slice(itemStart, caret)
  const text = raw.trimStart()
  if (!text) return NONE
  const replaceStart = itemStart + (raw.length - text.length)

  const h = HINT_RE.exec(text)
  if (h) {
    const r = resolveBook(h[1])
    if (r.kind === 'book') {
      const book = r.book
      if (h[2] && h[3]) {
        const count = index.verseCount(book.id, Number(h[2]))
        return {
          kind: 'hint',
          text: count > 0 ? plural(count, 'verse') : `${book.name} has only ${plural(book.chapters, 'chapter')}`,
        }
      }
      return { kind: 'hint', text: plural(book.chapters, 'chapter') }
    }
  }

  const bareDigitFirst = itemStart === 0 && /^[1-3]$/.test(text)
  if (BOOK_TEXT_RE.test(text) || bareDigitFirst) {
    const books = matchBooks(text)
    if (books.length > 0) return { kind: 'books', books, replaceStart, replaceEnd: caret }
  }
  return NONE
}

export function applyBook(
  input: string,
  range: { replaceStart: number; replaceEnd: number },
  book: Book,
): { value: string; caret: number } {
  const insert = `${book.name} `
  return {
    value: input.slice(0, range.replaceStart) + insert + input.slice(range.replaceEnd),
    caret: range.replaceStart + insert.length,
  }
}
