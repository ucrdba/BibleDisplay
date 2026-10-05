import { describe, expect, it } from 'vitest'
import { lookupTarget, pointInRects, splitStrongsRefs, strongsAt, wordAt } from '../../src/shared/strongs'

const TEXT = 'For God so loved the world.'
const SPANS = [
  { start: 4, end: 7, id: 'G2316' },
  { start: 11, end: 16, id: 'G25' },
]
const VERSE = { bookId: 43, chapter: 3, verse: 16, text: TEXT, strongs: SPANS }

describe('strongsAt', () => {
  it('finds the span covering an offset, including its end', () => {
    expect(strongsAt(SPANS, 4)?.id).toBe('G2316')
    expect(strongsAt(SPANS, 7)?.id).toBe('G2316')
    expect(strongsAt(SPANS, 13)?.id).toBe('G25')
    expect(strongsAt(SPANS, 9)).toBeNull()
    expect(strongsAt([], 0)).toBeNull()
  })
})

describe('wordAt', () => {
  it('finds the word around an offset', () => {
    expect(wordAt(TEXT, 18)).toEqual({ start: 17, end: 20, word: 'the' })
    expect(wordAt("the LORD's house", 6)).toEqual({ start: 4, end: 10, word: "LORD's" })
    expect(wordAt(TEXT, 26)).toEqual({ start: 21, end: 26, word: 'world' })
    expect(wordAt('a  b', 2)).toBeNull()
  })

  it('keeps hyphenated words whole', () => {
    expect(wordAt('to Beth-el now', 5)).toEqual({ start: 3, end: 10, word: 'Beth-el' })
    expect(wordAt('a - b', 2)).toBeNull()
  })
})

describe('lookupTarget', () => {
  const at = (offset: number) => lookupTarget([VERSE], { bookId: 43, chapter: 3, verse: 16, offset })

  it('finds a tagged word', () => {
    expect(at(5)).toEqual({ kind: 'tagged', span: SPANS[0], word: 'God' })
  })

  it('reports an untagged word', () => {
    expect(at(18)).toEqual({ kind: 'untagged', word: 'the', start: 17, end: 20 })
  })

  it('ignores clicks off any word or in another verse', () => {
    expect(lookupTarget([VERSE], { bookId: 43, chapter: 3, verse: 17, offset: 5 })).toBeNull()
    expect(lookupTarget([{ ...VERSE, text: 'a  b', strongs: [] }], { bookId: 43, chapter: 3, verse: 16, offset: 2 })).toBeNull()
  })

  it('treats a verse without Strong\u2019s data as untagged', () => {
    expect(lookupTarget([{ ...VERSE, strongs: undefined }], { bookId: 43, chapter: 3, verse: 16, offset: 5 })).toEqual({
      kind: 'untagged',
      word: 'God',
      start: 4,
      end: 7,
    })
  })
})

describe('splitStrongsRefs', () => {
  it('splits out H and G numbers', () => {
    expect(splitStrongsRefs('from G1537 and H8012; see G25.')).toEqual([
      { text: 'from ' },
      { id: 'G1537' },
      { text: ' and ' },
      { id: 'H8012' },
      { text: '; see ' },
      { id: 'G25' },
      { text: '.' },
    ])
    expect(splitStrongsRefs('no refs')).toEqual([{ text: 'no refs' }])
  })
})

describe('pointInRects', () => {
  const rects = [{ left: 10, right: 20, top: 5, bottom: 15 }]
  it('accepts points inside or on an edge', () => {
    expect(pointInRects(rects, 15, 10)).toBe(true)
    expect(pointInRects(rects, 10, 5)).toBe(true)
    expect(pointInRects(rects, 20, 15)).toBe(true)
  })
  it('rejects points outside and empty lists', () => {
    expect(pointInRects(rects, 21, 10)).toBe(false)
    expect(pointInRects(rects, 15, 16)).toBe(false)
    expect(pointInRects([], 15, 10)).toBe(false)
  })
})
