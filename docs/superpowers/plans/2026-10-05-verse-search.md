# Verse Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Search tab to the control window that finds verses by plain words (All words / Exact phrase / Any word) or a regular expression, and shows chosen results on the display through the existing reference workflow.

**Architecture:** All matching is pure code in `src/shared/search.ts`. The control window loads every verse once over a new IPC call and hands them to a Web Worker that runs `searchVerses`; a plain `SearchRunner` class debounces, cancels (by terminating the worker), and times out runaway patterns so the main process and the display can never freeze. Results show in a new Search tab beside Imported and Recent; clicking a result puts its reference in the main box and calls the existing `show()`.

**Tech Stack:** Electron + React 19 + TypeScript, electron-vite (Vite `?worker` imports), better-sqlite3, Vitest (runs inside Electron's Node via `npm test`).

**Spec:** `docs/superpowers/specs/2026-10-05-verse-search-design.md`

## Global Constraints

- Result cap: **500** rows (`SEARCH_LIMIT`); `total` always counts every match.
- Debounce **250 ms**; worker timeout **1.5 s** (`1500` ms).
- Modes, in this order and with these labels: All words (`all`, default) · Exact phrase (`phrase`) · Any word (`any`) · Regex (`regex`).
- Scopes: Whole Bible (`bible`, default) · Old Testament (`ot`, books 1–39) · New Testament (`nt`, 40–66) · Gospels (`gospels`, 40–43) · each book (`book:<id>`, labeled with the book's full name).
- Matching is case-insensitive; `‘` and `’` are treated as `'` in both verse text and query.
- Search marks appear only in the results list — never on the display or live preview.
- Showing search results does **not** add to Recent.
- Copy, verbatim: `Search took too long — try a simpler pattern` · `Search unavailable — couldn’t load Bible text` · `Type words to find, e.g. still waters` · `No matches in <scope label>` · `<n> matches — showing first <shown>` · `Loading…` · `Searching…` · `Invalid pattern: <detail>`.
- Working-tree files use CRLF line endings (git `autocrlf`); keep them that way when editing.
- Run tests with `npm test -- <path>` (the script runs Vitest inside Electron's Node). Run `npm run typecheck` before each commit.
- End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Base branch:** create `feat/verse-search` from `main` *after* `feat/collapse-right-panel` has been merged into `main` (both touch `ControlScreen.tsx`, the IPC files, and `control.css`).

## File Structure

| File | Responsibility |
|---|---|
| `src/shared/search.ts` (new) | Types, query parsing/compiling, matching, scope, `searchVerses`, UI helpers (`hitReference`, `parseSearchPrefix`, `markedPieces`, scope options/labels, prefs normalizing), worker message types. |
| `src/main/bibleDb.ts` | `allVerses()`. |
| `src/main/userDb.ts` | `getSearchPrefs()` / `setSearchPrefs()`. |
| `src/shared/ipc.ts`, `src/shared/api.ts`, `src/preload/index.ts`, `src/main/ipc.ts` | Three new calls: `allVerses`, `getSearchPrefs`, `setSearchPrefs`. |
| `src/renderer/src/control/search.worker.ts` (new) | Thin worker: holds verses, runs `searchVerses`. |
| `src/renderer/src/control/searchRunner.ts` (new) | Debounce, cancel-by-restart, timeout, stale replies. No React. |
| `src/renderer/src/control/useSearch.ts` (new) | React hook: creates the real worker + runner, loads verses, exposes state + `retry`. |
| `src/renderer/src/control/ListTabs.tsx` (new) | Imported \| Recent \| Search tab strip. |
| `src/renderer/src/control/SearchPanel.tsx` (new) | Search box, mode/scope dropdowns, status, results list; `searchStatus`, `searchKeyAction` helpers. |
| `src/renderer/src/control/keys.ts` | Ctrl+F → `{ type: 'search' }`. |
| `src/renderer/src/control/ControlScreen.tsx` | Tabs, search state, prefs, Ctrl+F, `?`/`/` prefixes, showing hits. |
| `src/renderer/src/control/control.css` | Tabs and search panel styles. |
| `src/renderer/src/control/HelpPanel.tsx`, `README.md` | Document search. |

---

### Task 1: Search engine (`searchVerses`)

**Files:**
- Create: `src/shared/search.ts`
- Test: `tests/shared/search.test.ts`

**Interfaces:**
- Consumes: `Span` from `src/shared/types.ts` (`{ start: number; end: number }`).
- Produces (exported from `src/shared/search.ts`):
  - `type SearchMode = 'all' | 'phrase' | 'any' | 'regex'`
  - ``type SearchScope = 'bible' | 'ot' | 'nt' | 'gospels' | `book:${number}` ``
  - `interface SearchQuery { text: string; mode: SearchMode; scope: SearchScope }`
  - `type VerseRow = [bookId: number, chapter: number, verse: number, text: string]`
  - `interface SearchHit { bookId: number; chapter: number; verse: number; text: string; marks: Span[] }`
  - `type SearchResult = { kind: 'ok'; total: number; hits: SearchHit[] } | { kind: 'error'; message: string }`
  - `interface Term { words: string[] }`
  - `const SEARCH_LIMIT = 500`
  - `normalizeApostrophes(s: string): string`
  - `parseTerms(text: string): Term[]`
  - `mergeSpans(spans: Span[]): Span[]`
  - `scopeIncludes(scope: SearchScope, bookId: number): boolean`
  - `searchVerses(verses: VerseRow[], query: SearchQuery, limit?: number): SearchResult`
  - `type WorkerRequest = { type: 'init'; verses: VerseRow[] } | { type: 'search'; id: number; query: SearchQuery }`
  - `interface WorkerReply { id: number; result: SearchResult }`

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  mergeSpans,
  parseTerms,
  scopeIncludes,
  searchVerses,
  type SearchMode,
  type SearchResult,
  type SearchScope,
  type VerseRow,
} from '../../src/shared/search'

// Canonical order, as BibleDb.allVerses() returns them.
const ROWS: VerseRow[] = [
  [19, 23, 1, 'The LORD is my shepherd; I shall not want.'],
  [19, 23, 2, 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.'],
  [19, 23, 3, 'He restoreth my soul: he leadeth me in the paths of righteousness for his name’s sake.'],
  [19, 119, 90, 'Thy faithfulness is unto all generations: thou hast established the earth, and it abideth.'],
  [43, 3, 16, 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.'],
  [58, 11, 1, 'Now faith is the substance of things hoped for, the evidence of things not seen.'],
  [59, 2, 17, 'Even so faith, if it hath not works, is dead, being alone.'],
]
const PS_23_2 = ROWS[1][3]

const run = (text: string, mode: SearchMode = 'all', scope: SearchScope = 'bible', limit?: number) =>
  searchVerses(ROWS, { text, mode, scope }, limit)
const refs = (r: SearchResult) =>
  r.kind === 'ok' ? r.hits.map(h => `${h.bookId}.${h.chapter}.${h.verse}`) : `error: ${r.message}`

describe('parseTerms', () => {
  it('splits words and keeps quoted phrases together', () => {
    expect(parseTerms('faith works')).toEqual([{ words: ['faith'] }, { words: ['works'] }])
    expect(parseTerms('"still waters" lord')).toEqual([{ words: ['still', 'waters'] }, { words: ['lord'] }])
  })

  it('runs an unclosed quote to the end', () => {
    expect(parseTerms('"still waters')).toEqual([{ words: ['still', 'waters'] }])
  })

  it('strips punctuation, keeps apostrophes and *, and drops empty terms', () => {
    expect(parseTerms('shepherd; (lord)')).toEqual([{ words: ['shepherd'] }, { words: ['lord'] }])
    expect(parseTerms('name’s faith*')).toEqual([{ words: ["name's"] }, { words: ['faith*'] }])
    expect(parseTerms('; * --')).toEqual([])
  })
})

describe('searchVerses — All words', () => {
  it('needs every word, in any order', () => {
    expect(refs(run('faith works'))).toEqual(['59.2.17'])
    expect(refs(run('works faith'))).toEqual(['59.2.17'])
  })

  it('matches whole words only, ignoring case', () => {
    expect(refs(run('faith'))).toEqual(['58.11.1', '59.2.17'])
    expect(refs(run('lord'))).toEqual(['19.23.1'])
  })

  it('treats * as any letters', () => {
    expect(refs(run('faith*'))).toEqual(['19.119.90', '58.11.1', '59.2.17'])
    expect(refs(run('*eth'))).toEqual(['19.23.2', '19.23.3', '19.119.90', '43.3.16'])
  })

  it('matches quoted phrases as one term', () => {
    expect(refs(run('"still waters" leadeth'))).toEqual(['19.23.2'])
    expect(refs(run('lord "still waters"'))).toEqual([])
  })

  it('treats straight and curly apostrophes alike, and ignores typed punctuation', () => {
    expect(refs(run("name's"))).toEqual(['19.23.3'])
    expect(refs(run('shepherd;'))).toEqual(['19.23.1'])
  })
})

describe('searchVerses — Any word', () => {
  it('needs at least one word', () => {
    expect(refs(run('shepherd works', 'any'))).toEqual(['19.23.1', '59.2.17'])
  })
})

describe('searchVerses — Exact phrase', () => {
  it('allows partial first and last words', () => {
    expect(refs(run('still wat', 'phrase'))).toEqual(['19.23.2'])
  })

  it('allows punctuation between words', () => {
    expect(refs(run('shepherd I shall', 'phrase'))).toEqual(['19.23.1'])
  })

  it('needs the words in order and inner words whole', () => {
    expect(refs(run('waters still', 'phrase'))).toEqual([])
    expect(refs(run('he lead me', 'phrase'))).toEqual([])
  })
})

describe('searchVerses — Regex', () => {
  it('matches a JavaScript regex, ignoring case', () => {
    expect(refs(run('\\bfaith\\w*', 'regex'))).toEqual(['19.119.90', '58.11.1', '59.2.17'])
    expect(refs(run('LORD IS', 'regex'))).toEqual(['19.23.1'])
  })

  it('normalizes apostrophes in the pattern and text', () => {
    expect(refs(run("name's", 'regex'))).toEqual(['19.23.3'])
    expect(refs(run('name’s', 'regex'))).toEqual(['19.23.3'])
  })

  it('reports an invalid pattern', () => {
    const r = run('(still', 'regex')
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/^Invalid pattern: \S/)
  })

  it('counts empty matches as a match but does not mark them', () => {
    const r = run('x*', 'regex')
    expect(r.kind === 'ok' && r.total).toBe(ROWS.length)
    expect(r.kind === 'ok' && r.hits[0].marks).toEqual([])
  })
})

describe('searchVerses — results', () => {
  it('returns nothing for an empty query', () => {
    expect(run('   ')).toEqual({ kind: 'ok', total: 0, hits: [] })
    expect(run('', 'regex')).toEqual({ kind: 'ok', total: 0, hits: [] })
    expect(run('; --')).toEqual({ kind: 'ok', total: 0, hits: [] })
  })

  it('limits hits but counts every match', () => {
    const r = run('he', 'all', 'bible', 2)
    expect(r.kind === 'ok' && r.total).toBe(3)
    expect(refs(r)).toEqual(['19.23.2', '19.23.3'])
  })

  it('keeps the original (curly) text in hits', () => {
    const r = run("name's")
    expect(r.kind === 'ok' && r.hits[0].text).toBe(ROWS[2][3])
  })

  it('marks every match of every term', () => {
    const r = run('he leadeth')
    const i = PS_23_2.indexOf('he leadeth')
    expect(r.kind === 'ok' && r.hits.find(h => h.verse === 2)?.marks).toEqual([
      { start: 0, end: 2 },
      { start: i, end: i + 2 },
      { start: i + 3, end: i + 10 },
    ])
  })

  it('merges overlapping marks', () => {
    const r = run('still "still waters"', 'any')
    const s = PS_23_2.indexOf('still')
    expect(r.kind === 'ok' && r.hits[0].marks).toEqual([{ start: s, end: s + 12 }])
  })
})

describe('scopes', () => {
  it('limits the books searched', () => {
    expect(refs(run('faith*', 'all', 'nt'))).toEqual(['58.11.1', '59.2.17'])
    expect(refs(run('faith*', 'all', 'ot'))).toEqual(['19.119.90'])
    expect(refs(run('god', 'all', 'gospels'))).toEqual(['43.3.16'])
    expect(refs(run('faith', 'all', 'gospels'))).toEqual([])
    expect(refs(run('he', 'all', 'book:19'))).toEqual(['19.23.2', '19.23.3'])
  })

  it('knows the book ranges', () => {
    expect(scopeIncludes('bible', 66)).toBe(true)
    expect(scopeIncludes('ot', 39)).toBe(true)
    expect(scopeIncludes('ot', 40)).toBe(false)
    expect(scopeIncludes('nt', 40)).toBe(true)
    expect(scopeIncludes('gospels', 43)).toBe(true)
    expect(scopeIncludes('gospels', 44)).toBe(false)
    expect(scopeIncludes('book:19', 19)).toBe(true)
    expect(scopeIncludes('book:19', 20)).toBe(false)
  })
})

describe('mergeSpans', () => {
  it('sorts and merges overlapping spans', () => {
    expect(mergeSpans([{ start: 5, end: 8 }, { start: 0, end: 2 }, { start: 6, end: 10 }])).toEqual([
      { start: 0, end: 2 },
      { start: 5, end: 10 },
    ])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/shared/search.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/shared/search"`.

- [ ] **Step 3: Implement `src/shared/search.ts`**

```ts
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
export const normalizeApostrophes = (s: string) => s.replace(/[‘’]/g, "'")

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/shared/search.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/search.ts tests/shared/search.test.ts
git commit -m "feat: verse search engine with word, phrase, and regex modes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Search UI helpers

**Files:**
- Modify: `src/shared/search.ts` (append)
- Test: `tests/shared/searchHelpers.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `BOOKS`, `bookById` from `src/shared/books.ts`.
- Produces (exported from `src/shared/search.ts`):
  - `interface SearchPrefs { mode: SearchMode; scope: SearchScope }`
  - `const DEFAULT_SEARCH_PREFS: SearchPrefs` = `{ mode: 'all', scope: 'bible' }`
  - `const SEARCH_MODES: { value: SearchMode; label: string }[]`
  - `scopeOptions(): { value: SearchScope; label: string }[]` (70 entries)
  - `scopeLabel(scope: SearchScope): string`
  - `normalizeSearchPrefs(raw: unknown): SearchPrefs`
  - `hitReference(hit: { bookId: number; chapter: number; verse: number }): string` → e.g. `Psa 23:2`
  - `parseSearchPrefix(input: string): { text: string; mode: 'all' | 'regex' } | null`
  - `interface Piece { text: string; bold: boolean }`
  - `markedPieces(text: string, marks: Span[], max?: number): Piece[]`

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/searchHelpers.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseReferences } from '../../src/shared/parser'
import {
  DEFAULT_SEARCH_PREFS,
  hitReference,
  markedPieces,
  normalizeSearchPrefs,
  parseSearchPrefix,
  scopeLabel,
  scopeOptions,
  SEARCH_MODES,
} from '../../src/shared/search'
import { fakeIndex } from '../helpers/fakeIndex'

describe('hitReference', () => {
  it('uses the 3-letter book code', () => {
    expect(hitReference({ bookId: 19, chapter: 23, verse: 2 })).toBe('Psa 23:2')
  })

  it('produces text the reference parser accepts', () => {
    const text = [
      { bookId: 19, chapter: 23, verse: 2 },
      { bookId: 43, chapter: 3, verse: 16 },
      { bookId: 65, chapter: 1, verse: 5 },
    ]
      .map(hitReference)
      .join(', ')
    const result = parseReferences(text, fakeIndex)
    expect(result.errors).toEqual([])
    expect(result.groups.map(g => [g.bookId, g.startChapter, g.startVerse])).toEqual([
      [19, 23, 2],
      [43, 3, 16],
      [65, 1, 5],
    ])
  })
})

describe('parseSearchPrefix', () => {
  it('turns ?words into an All words search', () => {
    expect(parseSearchPrefix('?still waters')).toEqual({ text: 'still waters', mode: 'all' })
    expect(parseSearchPrefix('  ? grace ')).toEqual({ text: 'grace', mode: 'all' })
  })

  it('turns /pattern/ into a Regex search', () => {
    expect(parseSearchPrefix('/still\\s+wat/')).toEqual({ text: 'still\\s+wat', mode: 'regex' })
  })

  it('leaves references alone', () => {
    expect(parseSearchPrefix('jn 3:16')).toBeNull()
    expect(parseSearchPrefix('/')).toBeNull()
    expect(parseSearchPrefix('//')).toBeNull()
    expect(parseSearchPrefix('/abc')).toBeNull()
  })
})

describe('scopes and modes', () => {
  it('lists the groups then every book', () => {
    const opts = scopeOptions()
    expect(opts.slice(0, 4).map(o => o.label)).toEqual(['Whole Bible', 'Old Testament', 'New Testament', 'Gospels'])
    expect(opts).toHaveLength(70)
    expect(opts[4]).toEqual({ value: 'book:1', label: 'Genesis' })
  })

  it('names a scope', () => {
    expect(scopeLabel('nt')).toBe('New Testament')
    expect(scopeLabel('book:19')).toBe('Psalms')
  })

  it('lists the modes in order', () => {
    expect(SEARCH_MODES.map(m => m.label)).toEqual(['All words', 'Exact phrase', 'Any word', 'Regex'])
  })
})

describe('normalizeSearchPrefs', () => {
  it('keeps valid prefs', () => {
    expect(normalizeSearchPrefs({ mode: 'regex', scope: 'book:43' })).toEqual({ mode: 'regex', scope: 'book:43' })
  })

  it('falls back to defaults for missing or bad values', () => {
    expect(normalizeSearchPrefs(undefined)).toEqual(DEFAULT_SEARCH_PREFS)
    expect(normalizeSearchPrefs({ mode: 'fuzzy', scope: 'book:99' })).toEqual(DEFAULT_SEARCH_PREFS)
    expect(normalizeSearchPrefs('nonsense')).toEqual(DEFAULT_SEARCH_PREFS)
  })
})

describe('markedPieces', () => {
  it('splits text into plain and bold pieces', () => {
    expect(markedPieces('the still waters', [{ start: 4, end: 9 }])).toEqual([
      { text: 'the ', bold: false },
      { text: 'still', bold: true },
      { text: ' waters', bold: false },
    ])
  })

  it('trims long text around the first mark', () => {
    const text = 'a'.repeat(100) + 'X' + 'b'.repeat(100)
    expect(markedPieces(text, [{ start: 100, end: 101 }], 60)).toEqual([
      { text: '…', bold: false },
      { text: 'a'.repeat(40), bold: false },
      { text: 'X', bold: true },
      { text: 'b'.repeat(19), bold: false },
      { text: '…', bold: false },
    ])
  })

  it('returns the whole text when there are no marks', () => {
    expect(markedPieces('plain', [])).toEqual([{ text: 'plain', bold: false }])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/shared/searchHelpers.test.ts`
Expected: FAIL — `hitReference` (and the others) are not exported.

- [ ] **Step 3: Implement the helpers**

At the top of `src/shared/search.ts`, add the import:

```ts
import { BOOKS, bookById } from './books'
```

Append to the end of `src/shared/search.ts`:

```ts
export interface SearchPrefs {
  mode: SearchMode
  scope: SearchScope
}

export const DEFAULT_SEARCH_PREFS: SearchPrefs = { mode: 'all', scope: 'bible' }

export const SEARCH_MODES: { value: SearchMode; label: string }[] = [
  { value: 'all', label: 'All words' },
  { value: 'phrase', label: 'Exact phrase' },
  { value: 'any', label: 'Any word' },
  { value: 'regex', label: 'Regex' },
]

const SCOPE_GROUPS: { value: SearchScope; label: string }[] = [
  { value: 'bible', label: 'Whole Bible' },
  { value: 'ot', label: 'Old Testament' },
  { value: 'nt', label: 'New Testament' },
  { value: 'gospels', label: 'Gospels' },
]

export function scopeOptions(): { value: SearchScope; label: string }[] {
  return [...SCOPE_GROUPS, ...BOOKS.map(b => ({ value: `book:${b.id}` as SearchScope, label: b.name }))]
}

export function scopeLabel(scope: SearchScope): string {
  return scopeOptions().find(o => o.value === scope)?.label ?? 'Whole Bible'
}

export function normalizeSearchPrefs(raw: unknown): SearchPrefs {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const mode = SEARCH_MODES.some(m => m.value === r.mode) ? (r.mode as SearchMode) : DEFAULT_SEARCH_PREFS.mode
  const scope = scopeOptions().some(o => o.value === r.scope) ? (r.scope as SearchScope) : DEFAULT_SEARCH_PREFS.scope
  return { mode, scope }
}

/** A short reference the reference parser accepts, e.g. "Psa 23:2". */
export function hitReference(hit: { bookId: number; chapter: number; verse: number }): string {
  return `${bookById(hit.bookId).abbrev3} ${hit.chapter}:${hit.verse}`
}

/** `?words` → All words search; `/pattern/` → Regex search; anything else → null (a reference). */
export function parseSearchPrefix(input: string): { text: string; mode: 'all' | 'regex' } | null {
  const s = input.trim()
  if (s.startsWith('?')) return { text: s.slice(1).trim(), mode: 'all' }
  if (s.length >= 3 && s.startsWith('/') && s.endsWith('/')) return { text: s.slice(1, -1), mode: 'regex' }
  return null
}

export interface Piece {
  text: string
  bold: boolean
}

/** Text split into plain and bold pieces; text longer than `max` is trimmed with … around the first mark. */
export function markedPieces(text: string, marks: Span[], max = 160): Piece[] {
  let from = 0
  let to = text.length
  if (text.length > max) {
    from = Math.max(0, Math.min((marks[0]?.start ?? 0) - 40, text.length - max))
    to = from + max
  }
  const pieces: Piece[] = []
  if (from > 0) pieces.push({ text: '…', bold: false })
  let pos = from
  for (const m of marks) {
    const start = Math.max(m.start, pos)
    const end = Math.min(m.end, to)
    if (end <= start) continue
    if (start > pos) pieces.push({ text: text.slice(pos, start), bold: false })
    pieces.push({ text: text.slice(start, end), bold: true })
    pos = end
  }
  if (pos < to) pieces.push({ text: text.slice(pos, to), bold: false })
  if (to < text.length) pieces.push({ text: '…', bold: false })
  return pieces
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/shared/searchHelpers.test.ts tests/shared/search.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/shared/search.ts tests/shared/searchHelpers.test.ts
git commit -m "feat: search helpers for references, prefixes, scopes, and bold pieces

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Main process — verse text, search prefs, and IPC

**Files:**
- Modify: `src/main/bibleDb.ts` (add `allVerses`)
- Modify: `src/main/userDb.ts` (add `getSearchPrefs` / `setSearchPrefs`)
- Modify: `src/shared/ipc.ts`, `src/shared/api.ts`, `src/preload/index.ts`, `src/main/ipc.ts`
- Test: `tests/main/bibleDb.test.ts`, `tests/main/userDb.test.ts`, `tests/data/realBible.test.ts`

**Interfaces:**
- Consumes: `VerseRow`, `SearchPrefs`, `DEFAULT_SEARCH_PREFS`, `normalizeSearchPrefs`, `searchVerses` from `src/shared/search.ts`.
- Produces:
  - `BibleDb.allVerses(): VerseRow[]` — canonical order.
  - `UserDb.getSearchPrefs(): SearchPrefs`, `UserDb.setSearchPrefs(prefs: SearchPrefs): void`
  - `ControlApi.allVerses(): Promise<VerseRow[]>`, `ControlApi.getSearchPrefs(): Promise<SearchPrefs>`, `ControlApi.setSearchPrefs(prefs: SearchPrefs): Promise<void>`
  - IPC channels `IPC.allVerses = 'bible:all-verses'`, `IPC.getSearchPrefs = 'search:get-prefs'`, `IPC.setSearchPrefs = 'search:set-prefs'`

- [ ] **Step 1: Write the failing tests**

Append to `tests/main/bibleDb.test.ts`:

```ts
describe('BibleDb.allVerses', () => {
  it('returns every verse in Bible order as [book, chapter, verse, text]', () => {
    db = BibleDb.open(makeFixtureBible())
    const rows = db.allVerses()
    expect(rows.map(([b, c, v]) => `${b}.${c}.${v}`)).toEqual(['41.3.3', '43.3.16', '43.3.17', '43.3.18', '43.4.1'])
    expect(rows[1]).toEqual([43, 3, 16, JOHN_3_16])
  })
})
```

In `tests/main/userDb.test.ts`, add `import Database from 'better-sqlite3'` to the imports, then append:

```ts
describe('UserDb search prefs', () => {
  it('starts with All words / Whole Bible and remembers changes across reopening', () => {
    const path = newPath()
    const db = open(path)
    expect(db.getSearchPrefs()).toEqual({ mode: 'all', scope: 'bible' })
    db.setSearchPrefs({ mode: 'regex', scope: 'book:43' })
    db.close()
    opened.pop()
    expect(open(path).getSearchPrefs()).toEqual({ mode: 'regex', scope: 'book:43' })
  })

  it('falls back to defaults when the stored value is damaged', () => {
    const path = newPath()
    open(path).close()
    opened.pop()
    const raw = new Database(path)
    raw.prepare("INSERT INTO settings (key, value) VALUES ('search', 'not json')").run()
    raw.close()
    expect(open(path).getSearchPrefs()).toEqual({ mode: 'all', scope: 'bible' })
  })
})
```

In `tests/data/realBible.test.ts`, add these imports:

```ts
import { BibleDb } from '../../src/main/bibleDb'
import { searchVerses, type SearchQuery, type VerseRow } from '../../src/shared/search'
```

and append:

```ts
describe.skipIf(!existsSync(PATH))('searching the real KJV', () => {
  let verses: VerseRow[]
  beforeAll(() => {
    const bible = BibleDb.open(PATH)
    verses = bible.allVerses()
    bible.close()
  })
  const refs = (q: SearchQuery) => {
    const r = searchVerses(verses, q)
    return r.kind === 'ok' ? r.hits.map(h => `${h.bookId}.${h.chapter}.${h.verse}`) : []
  }

  it('finds Psalm 23:2 by a quoted phrase', () => {
    expect(refs({ text: '"still waters"', mode: 'all', scope: 'bible' })).toContain('19.23.2')
  })

  it("matches the KJV's curly apostrophes", () => {
    expect(refs({ text: "name's sake", mode: 'phrase', scope: 'book:19' })).toContain('19.23.3')
  })

  it('searches the whole Bible well within the timeout', () => {
    const t = performance.now()
    const r = searchVerses(verses, { text: 'the lord', mode: 'all', scope: 'bible' })
    expect(performance.now() - t).toBeLessThan(500)
    expect(r.kind === 'ok' && r.total).toBeGreaterThan(500)
    expect(r.kind === 'ok' && r.hits.length).toBe(500)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/main/bibleDb.test.ts tests/main/userDb.test.ts tests/data/realBible.test.ts`
Expected: FAIL — `db.allVerses is not a function`, `db.getSearchPrefs is not a function`.

- [ ] **Step 3: Implement `allVerses` and search prefs**

In `src/main/bibleDb.ts`, add `VerseRow` to the imports:

```ts
import type { VerseRow } from '../shared/search'
```

and add this method after `verseCounts()`:

```ts
  allVerses(): VerseRow[] {
    return this.db
      .prepare('SELECT book_id, chapter, verse, text FROM verses ORDER BY book_id, chapter, verse')
      .raw()
      .all() as VerseRow[]
  }
```

In `src/main/userDb.ts`, add the import:

```ts
import { DEFAULT_SEARCH_PREFS, normalizeSearchPrefs, type SearchPrefs } from '../shared/search'
```

and add these methods before `close()`:

```ts
  getSearchPrefs(): SearchPrefs {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('search') as { value: string } | undefined
    if (!row) return { ...DEFAULT_SEARCH_PREFS }
    try {
      return normalizeSearchPrefs(JSON.parse(row.value))
    } catch {
      return { ...DEFAULT_SEARCH_PREFS }
    }
  }

  setSearchPrefs(prefs: SearchPrefs): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('search', JSON.stringify(normalizeSearchPrefs(prefs)))
  }
```

- [ ] **Step 4: Wire the IPC calls**

`src/shared/ipc.ts` — add after `verseCounts: 'bible:verse-counts',`:

```ts
  allVerses: 'bible:all-verses',
  getSearchPrefs: 'search:get-prefs',
  setSearchPrefs: 'search:set-prefs',
```

`src/shared/api.ts` — add to the imports:

```ts
import type { SearchPrefs, VerseRow } from './search'
```

and to `ControlApi`, after `verseCounts(): Promise<VerseCounts>`:

```ts
  allVerses(): Promise<VerseRow[]>
  getSearchPrefs(): Promise<SearchPrefs>
  setSearchPrefs(prefs: SearchPrefs): Promise<void>
```

`src/preload/index.ts` — in the `control` object, after the `verseCounts` line:

```ts
    allVerses: () => ipcRenderer.invoke(IPC.allVerses),
    getSearchPrefs: () => ipcRenderer.invoke(IPC.getSearchPrefs),
    setSearchPrefs: prefs => ipcRenderer.invoke(IPC.setSearchPrefs, prefs),
```

`src/main/ipc.ts` — add `import type { SearchPrefs } from '../shared/search'` to the imports, and after the `IPC.verseCounts` handler:

```ts
  ipcMain.handle(IPC.allVerses, () => ctx.bible.allVerses())
  ipcMain.handle(IPC.getSearchPrefs, () => ctx.user.getSearchPrefs())
  ipcMain.handle(IPC.setSearchPrefs, (_e, prefs: SearchPrefs) => ctx.user.setSearchPrefs(prefs))
```

(`setSearchPrefs` normalizes its input, so a malformed value from the renderer is stored as defaults.)

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm test -- tests/main/bibleDb.test.ts tests/main/userDb.test.ts tests/data/realBible.test.ts`
Expected: PASS. (The real-Bible block is skipped only if `resources/bible.db` is missing; it is present in this repo.)

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main/bibleDb.ts src/main/userDb.ts src/main/ipc.ts src/shared/ipc.ts src/shared/api.ts src/preload/index.ts tests/main/bibleDb.test.ts tests/main/userDb.test.ts tests/data/realBible.test.ts
git commit -m "feat: serve all verse text and remember search prefs over IPC

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Search worker, runner, and hook

**Files:**
- Create: `src/renderer/src/control/searchRunner.ts`
- Create: `src/renderer/src/control/search.worker.ts`
- Create: `src/renderer/src/control/useSearch.ts`
- Test: `tests/renderer/searchRunner.test.ts`

**Interfaces:**
- Consumes: `searchVerses`, `SearchQuery`, `SearchHit`, `VerseRow`, `WorkerRequest`, `WorkerReply` (Task 1); `window.bible.control.allVerses()` (Task 3).
- Produces:
  - `interface WorkerLike { postMessage(msg: WorkerRequest): void; terminate(): void; onmessage: ((e: { data: WorkerReply }) => void) | null; onerror: ((e: unknown) => void) | null }`
  - `type SearchStatus = 'loading' | 'idle' | 'searching' | 'done' | 'unavailable'`
  - `interface SearchState { status: SearchStatus; total: number; hits: SearchHit[]; note: string | null }`
  - `const INITIAL_SEARCH_STATE: SearchState`, `const TIMEOUT_NOTE = 'Search took too long — try a simpler pattern'`
  - `class SearchRunner { constructor(makeWorker: () => WorkerLike, onState: (s: SearchState) => void, debounceMs?: number, timeoutMs?: number); setLoading(): void; setVerses(v: VerseRow[]): void; setUnavailable(): void; setQuery(q: SearchQuery): void; dispose(): void }`
  - `useSearch(query: SearchQuery): SearchState & { retry(): void }`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/searchRunner.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchRunner, TIMEOUT_NOTE, type SearchState, type WorkerLike } from '../../src/renderer/src/control/searchRunner'
import type { SearchHit, SearchQuery, SearchResult, VerseRow, WorkerReply, WorkerRequest } from '../../src/shared/search'

class FakeWorker implements WorkerLike {
  static all: FakeWorker[] = []
  sent: WorkerRequest[] = []
  terminated = false
  onmessage: ((e: { data: WorkerReply }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  constructor() {
    FakeWorker.all.push(this)
  }
  postMessage(msg: WorkerRequest) {
    this.sent.push(msg)
  }
  terminate() {
    this.terminated = true
  }
  searches() {
    return this.sent.filter((m): m is Extract<WorkerRequest, { type: 'search' }> => m.type === 'search')
  }
  reply(id: number, result: SearchResult) {
    this.onmessage?.({ data: { id, result } })
  }
}

const VERSES: VerseRow[] = [[19, 23, 2, 'beside the still waters']]
const HIT: SearchHit = { bookId: 19, chapter: 23, verse: 2, text: 'beside the still waters', marks: [] }
const q = (text: string): SearchQuery => ({ text, mode: 'all', scope: 'bible' })
const ok = (hits: SearchHit[]): SearchResult => ({ kind: 'ok', total: hits.length, hits })

let states: SearchState[]
const last = () => states[states.length - 1]
const worker = () => FakeWorker.all[FakeWorker.all.length - 1]
const newRunner = () => new SearchRunner(() => new FakeWorker(), s => states.push(s))
const ready = () => {
  const r = newRunner()
  r.setVerses(VERSES)
  return r
}

beforeEach(() => {
  vi.useFakeTimers()
  FakeWorker.all = []
  states = []
})
afterEach(() => vi.useRealTimers())

describe('SearchRunner', () => {
  it('sends the verses to a new worker and waits idle', () => {
    ready()
    expect(FakeWorker.all).toHaveLength(1)
    expect(worker().sent).toEqual([{ type: 'init', verses: VERSES }])
    expect(last().status).toBe('idle')
  })

  it('searches 250 ms after the last change', () => {
    const r = ready()
    r.setQuery(q('st'))
    vi.advanceTimersByTime(200)
    r.setQuery(q('still'))
    vi.advanceTimersByTime(200)
    expect(worker().searches()).toHaveLength(0)
    vi.advanceTimersByTime(50)
    expect(worker().searches().map(s => s.query.text)).toEqual(['still'])
    expect(last().status).toBe('searching')
  })

  it('reports results', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250)
    worker().reply(worker().searches()[0].id, ok([HIT]))
    expect(last()).toEqual({ status: 'done', total: 1, hits: [HIT], note: null })
  })

  it('restarts the worker when a new search starts before the last one answers', () => {
    const r = ready()
    r.setQuery(q('a'))
    vi.advanceTimersByTime(250)
    r.setQuery(q('b'))
    vi.advanceTimersByTime(250)
    expect(FakeWorker.all).toHaveLength(2)
    expect(FakeWorker.all[0].terminated).toBe(true)
    expect(worker().sent[0]).toEqual({ type: 'init', verses: VERSES })
    expect(worker().searches().map(s => s.query.text)).toEqual(['b'])
  })

  it('ignores replies to older searches', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250)
    worker().reply(999, ok([HIT]))
    expect(last().status).toBe('searching')
  })

  it('gives up after 1.5 s, restarts the worker, and says so', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250 + 1500)
    expect(FakeWorker.all).toHaveLength(2)
    expect(FakeWorker.all[0].terminated).toBe(true)
    expect(last()).toMatchObject({ status: 'done', note: TIMEOUT_NOTE })
  })

  it('treats a worker crash like a timeout', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250)
    FakeWorker.all[0].onerror?.(new Error('boom'))
    expect(FakeWorker.all).toHaveLength(2)
    expect(last().note).toBe(TIMEOUT_NOTE)
  })

  it('keeps the previous results when the pattern is invalid', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250)
    worker().reply(worker().searches()[0].id, ok([HIT]))
    r.setQuery(q('(still'))
    vi.advanceTimersByTime(250)
    worker().reply(worker().searches()[1].id, { kind: 'error', message: 'Invalid pattern: Unterminated group' })
    expect(last()).toEqual({ status: 'done', total: 1, hits: [HIT], note: 'Invalid pattern: Unterminated group' })
  })

  it('clears results for an empty query without searching', () => {
    const r = ready()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(250)
    worker().reply(worker().searches()[0].id, ok([HIT]))
    r.setQuery(q('   '))
    vi.advanceTimersByTime(1000)
    expect(worker().searches()).toHaveLength(1)
    expect(last()).toEqual({ status: 'idle', total: 0, hits: [], note: null })
  })

  it('waits for the verses before searching, then searches at once', () => {
    const r = newRunner()
    r.setQuery(q('still'))
    vi.advanceTimersByTime(300)
    expect(FakeWorker.all).toHaveLength(0)
    r.setVerses(VERSES)
    expect(worker().searches().map(s => s.query.text)).toEqual(['still'])
  })

  it('reports loading and unavailable', () => {
    const r = newRunner()
    r.setLoading()
    expect(last().status).toBe('loading')
    r.setUnavailable()
    expect(last().status).toBe('unavailable')
  })

  it('stops the worker and timers when disposed', () => {
    const r = ready()
    r.setQuery(q('still'))
    r.dispose()
    vi.advanceTimersByTime(5000)
    expect(worker().terminated).toBe(true)
    expect(worker().searches()).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/renderer/searchRunner.test.ts`
Expected: FAIL — cannot resolve `searchRunner`.

- [ ] **Step 3: Implement `searchRunner.ts`**

Create `src/renderer/src/control/searchRunner.ts`:

```ts
import type { SearchHit, SearchQuery, VerseRow, WorkerReply, WorkerRequest } from '../../../shared/search'

/** The parts of a Web Worker the runner uses; tests pass a fake. */
export interface WorkerLike {
  postMessage(msg: WorkerRequest): void
  terminate(): void
  onmessage: ((e: { data: WorkerReply }) => void) | null
  onerror: ((e: unknown) => void) | null
}

export type SearchStatus = 'loading' | 'idle' | 'searching' | 'done' | 'unavailable'

export interface SearchState {
  status: SearchStatus
  total: number
  hits: SearchHit[]
  note: string | null
}

export const INITIAL_SEARCH_STATE: SearchState = { status: 'loading', total: 0, hits: [], note: null }
export const TIMEOUT_NOTE = 'Search took too long — try a simpler pattern'

/**
 * Runs searches in a worker: waits for typing to pause, and stops a search that is
 * superseded or runs too long by terminating the worker and starting a fresh one.
 */
export class SearchRunner {
  private verses: VerseRow[] | null = null
  private worker: WorkerLike | null = null
  private query: SearchQuery | null = null
  private nextId = 0
  private inFlight: number | null = null
  private debounce: ReturnType<typeof setTimeout> | null = null
  private timeout: ReturnType<typeof setTimeout> | null = null
  private state: SearchState = INITIAL_SEARCH_STATE

  constructor(
    private readonly makeWorker: () => WorkerLike,
    private readonly onState: (state: SearchState) => void,
    private readonly debounceMs = 250,
    private readonly timeoutMs = 1500,
  ) {}

  setLoading(): void {
    this.emit({ status: 'loading', total: 0, hits: [], note: null })
  }

  setUnavailable(): void {
    this.emit({ status: 'unavailable', total: 0, hits: [], note: null })
  }

  setVerses(verses: VerseRow[]): void {
    this.verses = verses
    this.inFlight = null
    this.clearTimeout()
    this.startWorker()
    if (this.hasText()) this.run()
    else this.emit({ status: 'idle', total: 0, hits: [], note: null })
  }

  setQuery(query: SearchQuery): void {
    this.query = query
    this.clearDebounce()
    if (!this.verses) return
    if (!this.hasText()) {
      this.cancel()
      this.emit({ status: 'idle', total: 0, hits: [], note: null })
      return
    }
    this.debounce = setTimeout(() => this.run(), this.debounceMs)
  }

  dispose(): void {
    this.clearDebounce()
    this.clearTimeout()
    this.worker?.terminate()
    this.worker = null
  }

  private hasText(): boolean {
    return !!this.query && this.query.text.trim() !== ''
  }

  private run(): void {
    this.debounce = null
    if (!this.query || !this.worker) return
    if (this.inFlight !== null) this.startWorker()
    const id = ++this.nextId
    this.inFlight = id
    this.worker.postMessage({ type: 'search', id, query: this.query })
    this.clearTimeout()
    this.timeout = setTimeout(() => this.fail(), this.timeoutMs)
    this.emit({ ...this.state, status: 'searching' })
  }

  private onReply(reply: WorkerReply): void {
    if (reply.id !== this.inFlight) return
    this.inFlight = null
    this.clearTimeout()
    const result = reply.result
    if (result.kind === 'ok') this.emit({ status: 'done', total: result.total, hits: result.hits, note: null })
    else this.emit({ ...this.state, status: 'done', note: result.message })
  }

  private fail(): void {
    this.inFlight = null
    this.clearTimeout()
    this.startWorker()
    this.emit({ ...this.state, status: 'done', note: TIMEOUT_NOTE })
  }

  private cancel(): void {
    if (this.inFlight === null) return
    this.inFlight = null
    this.clearTimeout()
    this.startWorker()
  }

  private startWorker(): void {
    this.worker?.terminate()
    const w = this.makeWorker()
    w.onmessage = e => this.onReply(e.data)
    w.onerror = () => this.fail()
    w.postMessage({ type: 'init', verses: this.verses ?? [] })
    this.worker = w
  }

  private clearDebounce(): void {
    if (this.debounce) clearTimeout(this.debounce)
    this.debounce = null
  }

  private clearTimeout(): void {
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = null
  }

  private emit(state: SearchState): void {
    this.state = state
    this.onState(state)
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/renderer/searchRunner.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the worker and the hook**

Create `src/renderer/src/control/search.worker.ts`:

```ts
import { searchVerses, type VerseRow, type WorkerReply, type WorkerRequest } from '../../../shared/search'

let verses: VerseRow[] = []

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data
  if (msg.type === 'init') {
    verses = msg.verses
    return
  }
  const reply: WorkerReply = { id: msg.id, result: searchVerses(verses, msg.query) }
  self.postMessage(reply)
}
```

Create `src/renderer/src/control/useSearch.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SearchQuery, WorkerReply } from '../../../shared/search'
import SearchWorker from './search.worker?worker'
import { INITIAL_SEARCH_STATE, SearchRunner, type SearchState, type WorkerLike } from './searchRunner'

function realWorker(): WorkerLike {
  const w = new SearchWorker()
  const like: WorkerLike = {
    postMessage: msg => w.postMessage(msg),
    terminate: () => w.terminate(),
    onmessage: null,
    onerror: null,
  }
  w.onmessage = e => like.onmessage?.({ data: e.data as WorkerReply })
  w.onerror = e => like.onerror?.(e)
  return like
}

/** Searches the Bible text in a worker; `retry` reloads the text after a failure. */
export function useSearch(query: SearchQuery): SearchState & { retry(): void } {
  const [state, setState] = useState<SearchState>(INITIAL_SEARCH_STATE)
  const runner = useRef<SearchRunner | null>(null)

  const load = useCallback(() => {
    const r = runner.current
    if (!r) return
    r.setLoading()
    window.bible.control.allVerses().then(
      verses => {
        if (runner.current === r) r.setVerses(verses)
      },
      () => {
        if (runner.current === r) r.setUnavailable()
      },
    )
  }, [])

  useEffect(() => {
    const r = new SearchRunner(realWorker, setState)
    runner.current = r
    load()
    return () => {
      r.dispose()
      runner.current = null
    }
  }, [load])

  useEffect(() => {
    runner.current?.setQuery({ text: query.text, mode: query.mode, scope: query.scope })
  }, [query.text, query.mode, query.scope])

  return { ...state, retry: load }
}
```

- [ ] **Step 6: Typecheck and build**

Run: `npm run typecheck`
Expected: no errors. (`search.worker?worker` is typed by `vite/client`, already referenced in `src/renderer/src/env.d.ts`.)

Run: `npm run build`
Expected: succeeds, and the output lists a separate worker asset (e.g. `out/renderer/assets/search.worker-*.js`).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/control/searchRunner.ts src/renderer/src/control/search.worker.ts src/renderer/src/control/useSearch.ts tests/renderer/searchRunner.test.ts
git commit -m "feat: run searches in a cancellable worker with debounce and timeout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Tabs and the Search panel

**Files:**
- Create: `src/renderer/src/control/ListTabs.tsx`
- Create: `src/renderer/src/control/SearchPanel.tsx`
- Modify: `src/renderer/src/control/control.css` (append)
- Test: `tests/renderer/SearchPanel.test.tsx`

**Interfaces:**
- Consumes: `SEARCH_MODES`, `scopeOptions`, `scopeLabel`, `hitReference`, `markedPieces`, `SearchMode`, `SearchScope` (Tasks 1–2); `SearchState` (Task 4); `ClickMods` from `./SelectableList`.
- Produces:
  - `type ListTab = 'imported' | 'recent' | 'search'`; `ListTabs({ active, onChange }: { active: ListTab; onChange(tab: ListTab): void })`
  - `searchStatus(text: string, state: SearchState, scope: SearchScope): string`
  - `searchKeyAction(key: string, text: string): 'submit' | 'clear' | null`
  - `SearchPanel(props: { inputRef: RefObject<HTMLInputElement | null>; text: string; mode: SearchMode; scope: SearchScope; state: SearchState; selected: number[]; onText(text: string): void; onMode(mode: SearchMode): void; onScope(scope: SearchScope): void; onClick(index: number, mods: ClickMods): void; onSubmit(): void })`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/SearchPanel.test.tsx`:

```tsx
import { createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ListTabs } from '../../src/renderer/src/control/ListTabs'
import { SearchPanel, searchKeyAction, searchStatus } from '../../src/renderer/src/control/SearchPanel'
import type { SearchState } from '../../src/renderer/src/control/searchRunner'
import type { SearchHit, SearchMode, SearchScope } from '../../src/shared/search'

const noop = () => {}
const PS_23_2 = 'He maketh me to lie down in green pastures: he leadeth me beside the still waters.'
const s = PS_23_2.indexOf('still')
const HITS: SearchHit[] = [
  { bookId: 19, chapter: 23, verse: 2, text: PS_23_2, marks: [{ start: s, end: s + 12 }] },
  { bookId: 23, chapter: 8, verse: 6, text: 'the waters of Shiloah that go softly', marks: [{ start: 4, end: 10 }] },
]
const state = (patch: Partial<SearchState> = {}): SearchState => ({ status: 'done', total: 0, hits: [], note: null, ...patch })

const render = (opts: { text?: string; mode?: SearchMode; scope?: SearchScope; st?: SearchState; selected?: number[] } = {}) =>
  renderToStaticMarkup(
    <SearchPanel
      inputRef={createRef<HTMLInputElement>()}
      text={opts.text ?? 'still waters'}
      mode={opts.mode ?? 'all'}
      scope={opts.scope ?? 'bible'}
      state={opts.st ?? state({ total: 2, hits: HITS })}
      selected={opts.selected ?? []}
      onText={noop}
      onMode={noop}
      onScope={noop}
      onClick={noop}
      onSubmit={noop}
    />,
  )

describe('ListTabs', () => {
  it('shows the three tabs and marks the active one', () => {
    const out = renderToStaticMarkup(<ListTabs active="search" onChange={noop} />)
    expect(out.indexOf('Imported')).toBeLessThan(out.indexOf('Recent'))
    expect(out.indexOf('Recent')).toBeLessThan(out.indexOf('Search'))
    expect(out).toMatch(/aria-selected="true" class="list-tab is-active"[^>]*>Search/)
    expect(out).toMatch(/aria-selected="false" class="list-tab"[^>]*>Imported/)
  })
})

describe('SearchPanel', () => {
  it('shows the chosen mode and scope', () => {
    const out = render({ mode: 'regex', scope: 'book:19' })
    expect(out).toMatch(/<option value="regex" selected="">Regex/)
    expect(out).toMatch(/<option value="book:19" selected="">Psalms/)
    expect(out).toContain('All words')
    expect(out).toContain('New Testament')
  })

  it('lists hits with short references and bold matches', () => {
    const out = render()
    expect(out).toContain('Psa 23:2')
    expect(out).toContain('Isa 8:6')
    expect(out).toContain('<b>still waters</b>')
    expect(out).toContain('<b>waters</b>')
  })

  it('marks selected hits', () => {
    const out = render({ selected: [1] })
    expect(out).toMatch(/class="link-btn search-hit is-active"[^>]*title="Show Isa 8:6"/)
    expect(out).toMatch(/class="link-btn search-hit"[^>]*title="Show Psa 23:2"/)
  })

  it('shows a note under the box', () => {
    const out = render({ st: state({ total: 2, hits: HITS, note: 'Invalid pattern: Unterminated group' }) })
    expect(out).toContain('class="error-text"')
    expect(out).toContain('Invalid pattern: Unterminated group')
    expect(out).toContain('Psa 23:2')
  })
})

describe('searchStatus', () => {
  it('hints when the box is empty', () => {
    expect(searchStatus('', state(), 'bible')).toBe('Type words to find, e.g. still waters')
  })

  it('reports loading, searching, and unavailable', () => {
    expect(searchStatus('x', state({ status: 'loading' }), 'bible')).toBe('Loading…')
    expect(searchStatus('x', state({ status: 'idle' }), 'bible')).toBe('Searching…')
    expect(searchStatus('x', state({ status: 'searching' }), 'bible')).toBe('Searching…')
    expect(searchStatus('x', state({ status: 'unavailable' }), 'bible')).toBe('Search unavailable — couldn’t load Bible text')
  })

  it('names the scope when nothing matches', () => {
    expect(searchStatus('x', state(), 'ot')).toBe('No matches in Old Testament')
  })

  it('stays quiet when a note explains the empty result', () => {
    expect(searchStatus('(x', state({ note: 'Invalid pattern: Unterminated group' }), 'bible')).toBe('')
  })

  it('counts matches and says when the list is cut short', () => {
    expect(searchStatus('x', state({ total: 1, hits: HITS.slice(0, 1) }), 'bible')).toBe('1 match')
    expect(searchStatus('x', state({ total: 2, hits: HITS }), 'bible')).toBe('2 matches')
    const many = Array.from({ length: 500 }, () => HITS[0])
    expect(searchStatus('x', state({ total: 1284, hits: many }), 'bible')).toBe('1,284 matches — showing first 500')
  })
})

describe('searchKeyAction', () => {
  it('submits on Enter', () => {
    expect(searchKeyAction('Enter', '')).toBe('submit')
  })

  it('clears with Esc only when there is text', () => {
    expect(searchKeyAction('Escape', 'faith')).toBe('clear')
    expect(searchKeyAction('Escape', '')).toBeNull()
  })

  it('ignores other keys', () => {
    expect(searchKeyAction('a', 'faith')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/renderer/SearchPanel.test.tsx`
Expected: FAIL — cannot resolve `ListTabs` / `SearchPanel`.

- [ ] **Step 3: Implement `ListTabs.tsx`**

```tsx
export type ListTab = 'imported' | 'recent' | 'search'

const TABS: { id: ListTab; label: string }[] = [
  { id: 'imported', label: 'Imported' },
  { id: 'recent', label: 'Recent' },
  { id: 'search', label: 'Search' },
]

interface Props {
  active: ListTab
  onChange(tab: ListTab): void
}

export function ListTabs({ active, onChange }: Props) {
  return (
    <div className="list-tabs" role="tablist">
      {TABS.map(t => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          className={t.id === active ? 'list-tab is-active' : 'list-tab'}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Implement `SearchPanel.tsx`**

```tsx
import type { KeyboardEvent, RefObject } from 'react'
import {
  hitReference,
  markedPieces,
  scopeLabel,
  scopeOptions,
  SEARCH_MODES,
  type SearchMode,
  type SearchScope,
} from '../../../shared/search'
import type { SearchState } from './searchRunner'
import type { ClickMods } from './SelectableList'

export function searchStatus(text: string, state: SearchState, scope: SearchScope): string {
  if (state.status === 'unavailable') return 'Search unavailable — couldn’t load Bible text'
  if (text.trim() === '') return 'Type words to find, e.g. still waters'
  if (state.status === 'loading') return 'Loading…'
  if (state.status === 'idle' || (state.status === 'searching' && state.hits.length === 0)) return 'Searching…'
  if (state.total === 0) return state.note ? '' : `No matches in ${scopeLabel(scope)}`
  const count = `${state.total.toLocaleString('en-US')} ${state.total === 1 ? 'match' : 'matches'}`
  return state.total > state.hits.length ? `${count} — showing first ${state.hits.length}` : count
}

export function searchKeyAction(key: string, text: string): 'submit' | 'clear' | null {
  if (key === 'Enter') return 'submit'
  if (key === 'Escape' && text !== '') return 'clear'
  return null
}

interface Props {
  inputRef: RefObject<HTMLInputElement | null>
  text: string
  mode: SearchMode
  scope: SearchScope
  state: SearchState
  selected: number[]
  onText(text: string): void
  onMode(mode: SearchMode): void
  onScope(scope: SearchScope): void
  onClick(index: number, mods: ClickMods): void
  onSubmit(): void
}

export function SearchPanel({ inputRef, text, mode, scope, state, selected, onText, onMode, onScope, onClick, onSubmit }: Props) {
  const status = searchStatus(text, state, scope)

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const action = searchKeyAction(e.key, text)
    if (!action) return
    // preventDefault also tells the window-level shortcut handler to leave this key alone.
    e.preventDefault()
    if (action === 'submit') onSubmit()
    else onText('')
  }

  return (
    <section className="list search">
      <div className="search__box">
        <input
          ref={inputRef}
          className="search__input"
          placeholder="Find words…"
          aria-label="Search text"
          value={text}
          onChange={e => onText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="btn search__clear"
          title="Clear search"
          disabled={text === ''}
          onClick={() => {
            onText('')
            inputRef.current?.focus()
          }}
        >
          ×
        </button>
      </div>
      <div className="search__options">
        <select aria-label="Search mode" value={mode} onChange={e => onMode(e.target.value as SearchMode)}>
          {SEARCH_MODES.map(m => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <select aria-label="Search in" value={scope} onChange={e => onScope(e.target.value as SearchScope)}>
          {scopeOptions().map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {status && <p className="muted search__status">{status}</p>}
      {state.note && <p className="error-text">{state.note}</p>}
      <ul className="selectable search__results" role="listbox" aria-multiselectable="true">
        {state.hits.map((hit, i) => {
          const ref = hitReference(hit)
          const isSel = selected.includes(i)
          return (
            <li key={ref} role="option" aria-selected={isSel}>
              <button
                type="button"
                className={isSel ? 'link-btn search-hit is-active' : 'link-btn search-hit'}
                title={`Show ${ref}`}
                onClick={e => onClick(i, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey })}
              >
                <span className="search-hit__ref">{ref}</span>{' '}
                <span className="search-hit__text">
                  {markedPieces(hit.text, hit.marks).map((p, j) => (p.bold ? <b key={j}>{p.text}</b> : <span key={j}>{p.text}</span>))}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
```

- [ ] **Step 5: Append styles to `src/renderer/src/control/control.css`**

```css
.list-tabs {
  display: flex;
  gap: 2px;
  margin-top: 14px;
  border-bottom: 1px solid var(--border);
}

.list-tab {
  border: 1px solid transparent;
  border-bottom: none;
  background: none;
  border-radius: 4px 4px 0 0;
  padding: 4px 10px;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--muted);
}

.list-tab.is-active {
  border-color: var(--border);
  background: var(--panel);
  color: inherit;
  margin-bottom: -1px;
}

/* The tab strip already separates the lists from the controls above. */
.panel--left .list-tabs + .list {
  border-top: none;
  margin-top: 0;
}

.search__box {
  display: flex;
  gap: 4px;
}

.search__input {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 4px 6px;
}

.search__clear {
  padding: 0 8px;
}

.search__options {
  display: flex;
  gap: 4px;
  margin: 6px 0;
}

.search__options select {
  flex: 1;
  min-width: 0;
}

.search__status {
  margin: 4px 0;
  font-size: 12px;
}

.search-hit {
  display: block;
  width: 100%;
  color: inherit;
  font-size: 12px;
  line-height: 1.35;
}

.search-hit__ref {
  color: var(--accent);
  font-weight: 600;
  white-space: nowrap;
}

.search-hit b {
  background: #fff3b0;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- tests/renderer/SearchPanel.test.tsx`
Expected: PASS.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/renderer/src/control/ListTabs.tsx src/renderer/src/control/SearchPanel.tsx src/renderer/src/control/control.css tests/renderer/SearchPanel.test.tsx
git commit -m "feat: Search panel and Imported/Recent/Search tabs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Wire search into the control window

**Files:**
- Modify: `src/renderer/src/control/keys.ts`
- Modify: `src/renderer/src/control/ControlScreen.tsx`
- Modify: `src/renderer/src/control/HelpPanel.tsx`
- Modify: `README.md`
- Test: `tests/renderer/keys.test.ts`, `tests/renderer/HelpPanel.test.tsx`

**Interfaces:**
- Consumes: everything above — `useSearch` (Task 4), `ListTabs`/`ListTab`, `SearchPanel` (Task 5), `hitReference`, `parseSearchPrefix`, `DEFAULT_SEARCH_PREFS`, `SearchPrefs`, `SearchQuery` (Tasks 1–2), `api().getSearchPrefs` / `setSearchPrefs` (Task 3); existing `clickSelection`, `EMPTY_SELECTION`, `ListSelection` from `src/shared/listSelection.ts`.
- Produces: `KeyAction` gains `{ type: 'search' }`.

- [ ] **Step 1: Write the failing tests**

In `tests/renderer/keys.test.ts`, add inside `describe('keyToAction', …)`:

```ts
  it('opens search with Ctrl+F, even while typing', () => {
    expect(k('f', true, true)).toEqual({ type: 'search' })
    expect(k('F', false, true)).toEqual({ type: 'search' })
    expect(k('f')).toBeNull()
  })
```

In `tests/renderer/HelpPanel.test.tsx`, add inside `describe('HelpPanel', …)`:

```tsx
  it('explains search', () => {
    const out = renderToStaticMarkup(<HelpPanel version="1.2.3" onClose={() => {}} />)
    for (const text of ['Search', 'Ctrl', 'All words', 'Exact phrase', 'Any word', 'Regex', '?still waters']) {
      expect(out).toContain(text)
    }
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- tests/renderer/keys.test.ts tests/renderer/HelpPanel.test.tsx`
Expected: FAIL — Ctrl+F returns `null`; Help lacks "Exact phrase".

- [ ] **Step 3: Add Ctrl+F to `keys.ts`**

Add `| { type: 'search' }` to the `KeyAction` union, and in `keyToAction`'s `if (k.ctrlKey) { … }` block, before `return null`:

```ts
    if (k.key === 'f' || k.key === 'F') return { type: 'search' }
```

- [ ] **Step 4: Wire `ControlScreen.tsx`**

Imports — add:

```ts
import { DEFAULT_SEARCH_PREFS, hitReference, parseSearchPrefix, type SearchPrefs, type SearchQuery } from '../../../shared/search'
import { ListTabs, type ListTab } from './ListTabs'
import { SearchPanel } from './SearchPanel'
import { useSearch } from './useSearch'
```

State — add after the `saveNoticeTimer` line:

```ts
  const [listTab, setListTab] = useState<ListTab>('imported')
  const [searchText, setSearchText] = useState('')
  const [searchPrefs, setSearchPrefs] = useState<SearchPrefs>(DEFAULT_SEARCH_PREFS)
  const [searchSel, setSearchSel] = useState<ListSelection>(EMPTY_SELECTION)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchQuery = useMemo<SearchQuery>(() => ({ text: searchText, ...searchPrefs }), [searchText, searchPrefs])
  const search = useSearch(searchQuery)
```

In the mount effect (the one that calls `a.getStyles()`), add:

```ts
    void a.getSearchPrefs().then(setSearchPrefs)
```

Add these effects after the mount effect:

```ts
  // New results invalidate the old selection.
  useEffect(() => setSearchSel(EMPTY_SELECTION), [search.hits])

  // Opening the Search tab retries loading the Bible text if it failed.
  useEffect(() => {
    if (listTab === 'search' && search.status === 'unavailable') search.retry()
  }, [listTab])
```

Add these functions after `removeHighlight`:

```ts
  const updateSearchPrefs = (patch: Partial<SearchPrefs>) => {
    const next = { ...searchPrefs, ...patch }
    setSearchPrefs(next)
    void api().setSearchPrefs(next)
  }

  const openSearch = (text?: string) => {
    if (text !== undefined) setSearchText(text)
    setListTab('search')
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }

  // The main box: `?words` or `/pattern/` opens Search; anything else is references.
  const submitInput = () => {
    const prefix = parseSearchPrefix(input)
    if (!prefix) {
      void show(input)
      return
    }
    updateSearchPrefs({ mode: prefix.mode })
    openSearch(prefix.text)
  }

  const showHits = (indices: number[]) => {
    const text = indices
      .map(i => search.hits[i])
      .filter(h => h !== undefined)
      .map(hitReference)
      .join(', ')
    if (!text) return
    resetListSel()
    setInput(text)
    setErrors([])
    void show(text, false)
  }

  const clickSearch = (index: number, mods: ClickMods) => {
    const next = clickSelection(searchSel, index, mods)
    setSearchSel(next)
    showHits(next.selected)
  }

  const submitSearch = () => showHits(searchSel.selected.length > 0 ? searchSel.selected : [0])
```

Keyboard handler — extend the `latest` ref to include `openSearch`:

```ts
  const latest = useRef({ styles, toggleBlank, updateStyles, clear, helpOpen, setHelpOpen, openSearch })
  latest.current = { styles, toggleBlank, updateStyles, clear, helpOpen, setHelpOpen, openSearch }
```

and in the `onKey` dispatch, replace

```ts
      else if (action.type === 'help') cur.setHelpOpen(true)
      else cur.toggleBlank()
```

with

```ts
      else if (action.type === 'help') cur.setHelpOpen(true)
      else if (action.type === 'search') cur.openSearch()
      else cur.toggleBlank()
```

Main reference box — change `onSubmit={() => void show(input)}` on `<ReferenceInput>` to `onSubmit={submitInput}`, and the Show button's `onClick={() => void show(input)}` to `onClick={submitInput}`.

Left panel — replace the `<ImportedList … />` and `<RecentList … />` elements with:

```tsx
          <ListTabs active={listTab} onChange={setListTab} />
          {listTab === 'imported' && (
            <ImportedList
              items={imported}
              problems={importProblems}
              selected={importedSelected}
              error={importError}
              onClick={(i, mods) => clickList('imported', i, mods)}
              onContext={i => contextList('imported', i)}
              onDelete={() => void deleteFromList('imported')}
              onImport={() => void importList()}
              onClear={() => void clearImported()}
            />
          )}
          {listTab === 'recent' && (
            <RecentList
              items={recent}
              selected={recentSelected}
              onClick={(i, mods) => clickList('recent', i, mods)}
              onContext={i => contextList('recent', i)}
              onDelete={() => void deleteFromList('recent')}
            />
          )}
          {listTab === 'search' && (
            <SearchPanel
              inputRef={searchInputRef}
              text={searchText}
              mode={searchPrefs.mode}
              scope={searchPrefs.scope}
              state={search}
              selected={searchSel.selected}
              onText={setSearchText}
              onMode={mode => updateSearchPrefs({ mode })}
              onScope={scope => updateSearchPrefs({ scope })}
              onClick={clickSearch}
              onSubmit={submitSearch}
            />
          )}
```

(The `<ImportedList>` and `<RecentList>` props are unchanged from today — only wrapped.)

`ListSelection` and `clickSelection` are already imported from `../../../shared/listSelection`; `ClickMods` is already imported from `./SelectableList`.

- [ ] **Step 5: Document search in Help and README**

`src/renderer/src/control/HelpPanel.tsx` — in the Keyboard shortcuts list, after the F1 item:

```tsx
          <li>
            <kbd>Ctrl</kbd>+<kbd>F</kbd> = search
          </li>
```

and after the "Imported and Recent lists" section:

```tsx
        <h3>Search</h3>
        <p>
          Press <kbd>Ctrl</kbd>+<kbd>F</kbd> or open the Search tab and type. Results appear as you type, with the
          matching words in bold. Click a result to show it; <kbd>Ctrl+click</kbd> and <kbd>Shift+click</kbd> show
          several; <kbd>Enter</kbd> shows the selected results (or the first). <kbd>Esc</kbd> clears the search.
        </p>
        <ul>
          <li>
            <b>All words</b>: every word, in any order. <code>&quot;still waters&quot;</code> in quotes is a phrase;{' '}
            <code>faith*</code> also finds faithful.
          </li>
          <li>
            <b>Exact phrase</b>: the words in order; the first and last can be partial (<code>still wat</code>).
          </li>
          <li>
            <b>Any word</b>: verses with at least one of the words.
          </li>
          <li>
            <b>Regex</b>: a regular expression, e.g. <code>\bgrace\b.*\bpeace\b</code>.
          </li>
        </ul>
        <p>
          The second list limits the search to the Old or New Testament, the Gospels, or one book. In the verse box,{' '}
          <code>?still waters</code> searches for words and <code>/still\s+wat/</code> searches with a regex.
        </p>
```

`README.md` — after the "Imported and Recent lists" bullet:

```markdown
- Search: press **Ctrl+F** (or open the **Search** tab) and type. Modes: **All words** (any order; `"quoted phrase"`; `faith*` for word starts), **Exact phrase** (`still wat`), **Any word**, and **Regex**. Limit it to the Old or New Testament, the Gospels, or one book. Click results to show them (Ctrl/Shift+click for several). In the verse box, `?still waters` or `/still\s+wat/` opens a search.
```

- [ ] **Step 6: Run all tests, typecheck, and build**

Run: `npm test`
Expected: all test files pass.

Run: `npm run typecheck`
Expected: no errors.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Manual check in the running app**

Run `npm run dev` and check each item:
1. The left panel shows **Imported | Recent | Search** tabs; Imported and Recent work as before.
2. **Ctrl+F** opens Search with the cursor in the box (also from inside the verse box).
3. Typing `still waters` lists Psalm 23:2 (Psa 23:2) with **still waters** in bold, within about half a second.
4. Click it → it shows on the display, `Psa 23:2` is in the verse box, and Recent is unchanged. Ctrl+click a second result → both show. Enter shows the selection.
5. Change the mode to **Exact phrase** and the scope to **Psalms**; restart the app → both choices are remembered.
6. Type `the` → `… matches — showing first 500`.
7. Regex `(still` → `Invalid pattern: …` note, earlier results stay. Regex `^(\w+\s?)*$` over the Whole Bible → the display keeps scrolling with PgDn and the note `Search took too long — try a simpler pattern` appears within about 2 s.
8. **Esc** in the search box clears the search; Esc again clears the display.
9. In the verse box, `?grace peace` + Enter opens Search in All words mode; `/grace.*peace/` + Enter opens it in Regex mode.

Then run the production build, which loads from `file://` under the page's Content-Security-Policy: `npm run build && npm start`, and repeat items 3 and 7. If the worker fails to load there (status stuck on `Loading…`/`Searching…` or a CSP error in DevTools), add `worker-src 'self'` to the CSP `<meta>` in `src/renderer/index.html` and re-check.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/control/keys.ts src/renderer/src/control/ControlScreen.tsx src/renderer/src/control/HelpPanel.tsx README.md tests/renderer/keys.test.ts tests/renderer/HelpPanel.test.tsx
git commit -m "feat: search verses from the control window (Ctrl+F, ?words, /regex/)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
