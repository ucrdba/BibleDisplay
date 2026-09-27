import { describe, expect, it } from 'vitest'
import { BOOKS } from '../../src/shared/books'
import { bookKeys, normalizeBookText, resolveBook } from '../../src/shared/resolve'

const nameOf = (text: string) => {
  const r = resolveBook(text)
  return r.kind === 'book' ? r.book.name : r.kind
}

describe('normalizeBookText', () => {
  it('lowercases and strips dots and spaces', () => {
    expect(normalizeBookText(' 1 Jn. ')).toBe('1jn')
    expect(normalizeBookText('Song of Solomon')).toBe('songofsolomon')
  })
})

describe('bookKeys', () => {
  it('never maps one key to two books', () => {
    const owner = new Map<string, string>()
    for (const b of BOOKS) {
      for (const k of bookKeys(b)) {
        expect(owner.get(k) ?? b.name, `key "${k}"`).toBe(b.name)
        owner.set(k, b.name)
      }
    }
  })
})

describe('resolveBook', () => {
  it('matches full names, 3-letter codes, and aliases case-insensitively', () => {
    expect(nameOf('genesis')).toBe('Genesis')
    expect(nameOf('GEN')).toBe('Genesis')
    expect(nameOf('jn')).toBe('John')
    expect(nameOf('mk')).toBe('Mark')
    expect(nameOf('ps')).toBe('Psalms')
    expect(nameOf('Luke')).toBe('Luke')
  })

  it('handles numbered books written several ways', () => {
    for (const t of ['1 john', '1john', '1jn', '1 joh', '1 Jn.']) expect(nameOf(t)).toBe('1 John')
  })

  it('accepts a unique prefix of a full name', () => {
    expect(nameOf('phile')).toBe('Philemon')
    expect(nameOf('lament')).toBe('Lamentations')
  })

  it('reports ambiguous prefixes with candidates in Bible order', () => {
    const r = resolveBook('jo')
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') {
      expect(r.candidates.map(b => b.name)).toEqual(['Joshua', 'Job', 'Joel', 'Jonah', 'John'])
    }
  })

  it('reports unknown and empty text', () => {
    expect(resolveBook('xyz').kind).toBe('unknown')
    expect(resolveBook('  ').kind).toBe('unknown')
  })
})
