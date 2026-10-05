import type { Span } from './types'

export type SearchMode = 'all' | 'phrase' | 'any' | 'regex'
export type SearchScope = 'bible' | 'ot' | 'nt' | 'gospels' | `book:${number}`

export interface SearchQuery {
  text: string
  mode: SearchMode
  scope: SearchScope
}

export type VerseRow = [bookId: number, chapter: number, verse: number, text: string]

export interface SearchHit {
  bookId: number
  chapter: number
  verse: number
  text: string
  marks: Span[]
}

export type SearchResult = { kind: 'ok'; total: number; hits: SearchHit[] } | { kind: 'error'; message: string }

export type WorkerRequest = { type: 'init'; verses: VerseRow[] } | { type: 'search'; id: number; query: SearchQuery }

export interface WorkerReply {
  id: number
  result: SearchResult
}

/** A word, or a quoted phrase of several words. */
export interface Term {
  words: string[]
}

export const SEARCH_LIMIT = 500

/** Curly single quotes become straight ones. One UTF-16 unit for one, so offsets are unchanged. */
export const normalizeApostrophes = (s: string) => s.replace(/[\u2018\u2019]/g, "'")

function cleanWord(word: string): string {
  const cleaned = normalizeApostrophes(word).replace(/[^\p{L}\p{N}'*]/gu, '')
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : ''
}

const cleanWords = (text: string) =>
  text
    .split(/\s+/)
    .map(cleanWord)
    .filter(w => w !== '')

export function parseTerms(text: string): Term[] {
  const terms: Term[] = []
  for (const m of text.matchAll(/"([^"]*)"?|([^\s"]+)/g)) {
    const words = cleanWords(m[1] ?? m[2] ?? '')
    if (words.length > 0) terms.push({ words })
  }
  return terms
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordPattern = (word: string) => word.split('*').map(escapeRegex).join('\\w*')
const termPattern = (term: Term) => `\\b${term.words.map(wordPattern).join('\\W+')}\\b`

/** Exact phrase: words in order, any punctuation between; first and last words may be partial. */
function phrasePattern(text: string): string | null {
  const words = cleanWords(text.replace(/"/g, ' '))
  return words.length > 0 ? words.map(wordPattern).join('\\W+') : null
}

interface Matcher {
  regexes: RegExp[]
  /** true: every regex must match (All words, phrase, regex); false: any one (Any word). */
  every: boolean
}

type Compiled = { kind: 'ok'; matcher: Matcher | null } | { kind: 'error'; message: string }

function regexError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return `Invalid pattern: ${msg.slice(msg.lastIndexOf(': ') + 1).trim()}`
}

function compileQuery(text: string, mode: SearchMode): Compiled {
  if (text.trim() === '') return { kind: 'ok', matcher: null }
  if (mode === 'regex') {
    try {
      return { kind: 'ok', matcher: { regexes: [new RegExp(normalizeApostrophes(text), 'gi')], every: true } }
    } catch (e) {
      return { kind: 'error', message: regexError(e) }
    }
  }
  const patterns =
    mode === 'phrase'
      ? [phrasePattern(text)].filter((p): p is string => p !== null)
      : parseTerms(text).map(termPattern)
  if (patterns.length === 0) return { kind: 'ok', matcher: null }
  return { kind: 'ok', matcher: { regexes: patterns.map(p => new RegExp(p, 'gi')), every: mode !== 'any' } }
}

export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Span[] = []
  for (const s of sorted) {
    const last = out[out.length - 1]
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
    else out.push({ ...s })
  }
  return out
}

/** The marks for a matching verse, or null if it does not match. */
function matchVerse(matcher: Matcher, text: string): Span[] | null {
  const marks: Span[] = []
  let matchedAny = false
  for (const re of matcher.regexes) {
    let matched = false
    for (const m of text.matchAll(re)) {
      matched = true
      if (m[0].length > 0) marks.push({ start: m.index, end: m.index + m[0].length })
    }
    if (matched) matchedAny = true
    else if (matcher.every) return null
  }
  return matchedAny ? mergeSpans(marks) : null
}

export function scopeIncludes(scope: SearchScope, bookId: number): boolean {
  switch (scope) {
    case 'bible':
      return true
    case 'ot':
      return bookId <= 39
    case 'nt':
      return bookId >= 40
    case 'gospels':
      return bookId >= 40 && bookId <= 43
    default:
      return Number(scope.slice('book:'.length)) === bookId
  }
}

export function searchVerses(verses: VerseRow[], query: SearchQuery, limit = SEARCH_LIMIT): SearchResult {
  const compiled = compileQuery(query.text, query.mode)
  if (compiled.kind === 'error') return compiled
  const hits: SearchHit[] = []
  let total = 0
  if (compiled.matcher) {
    for (const [bookId, chapter, verse, text] of verses) {
      if (!scopeIncludes(query.scope, bookId)) continue
      const marks = matchVerse(compiled.matcher, normalizeApostrophes(text))
      if (!marks) continue
      total++
      if (hits.length < limit) hits.push({ bookId, chapter, verse, text, marks })
    }
  }
  return { kind: 'ok', total, hits }
}
