import { BOOKS } from './books'
import type { Book } from './types'

export function normalizeBookText(s: string): string {
  return s.toLowerCase().replace(/\./g, '').replace(/\s+/g, '')
}

export function bookKeys(book: Book): string[] {
  return [...new Set([book.name, book.abbrev3, book.osis, ...book.aliases].map(normalizeBookText))]
}

const KEY_TO_BOOK = new Map<string, Book>()
for (const book of BOOKS) for (const key of bookKeys(book)) KEY_TO_BOOK.set(key, book)

export type BookMatch =
  | { kind: 'book'; book: Book }
  | { kind: 'ambiguous'; candidates: Book[] }
  | { kind: 'unknown' }

export function resolveBook(text: string): BookMatch {
  const key = normalizeBookText(text)
  if (!key) return { kind: 'unknown' }
  const exact = KEY_TO_BOOK.get(key)
  if (exact) return { kind: 'book', book: exact }
  const candidates = BOOKS.filter(b => normalizeBookText(b.name).startsWith(key))
  if (candidates.length === 1) return { kind: 'book', book: candidates[0] }
  if (candidates.length > 1) return { kind: 'ambiguous', candidates }
  return { kind: 'unknown' }
}
