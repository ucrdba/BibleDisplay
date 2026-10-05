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
  [19, 23, 1, "The LORD is my shepherd; I shall not want."],
  [19, 23, 2, "He maketh me to lie down in green pastures: he leadeth me beside the still waters."],
  [19, 23, 3, "He restoreth my soul: he leadeth me in the paths of righteousness for his name" + "'" + "s sake."],
  [19, 119, 90, "Thy faithfulness is unto all generations: thou hast established the earth, and it abideth."],
  [43, 3, 16, "For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life."],
  [58, 11, 1, "Now faith is the substance of things hoped for, the evidence of things not seen."],
  [59, 2, 17, "Even so faith, if it hath not works, is dead, being alone."],
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
    expect(parseTerms("name" + "'" + "s faith*")).toEqual([{ words: ["name" + "'" + "s"] }, { words: ['faith*'] }])
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
    expect(refs(run("name" + "'" + "s"))).toEqual(['19.23.3'])
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
    expect(refs(run("name" + "'" + "s", 'regex'))).toEqual(['19.23.3'])
    expect(refs(run("name" + "'" + "s", 'regex'))).toEqual(['19.23.3'])
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
    const r = run("name" + "'" + "s")
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
