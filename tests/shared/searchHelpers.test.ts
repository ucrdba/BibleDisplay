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
      { text: '\u2026', bold: false },
      { text: 'a'.repeat(40), bold: false },
      { text: 'X', bold: true },
      { text: 'b'.repeat(19), bold: false },
      { text: '\u2026', bold: false },
    ])
  })

  it('returns the whole text when there are no marks', () => {
    expect(markedPieces('plain', [])).toEqual([{ text: 'plain', bold: false }])
  })
})
