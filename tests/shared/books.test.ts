import { describe, expect, it } from 'vitest'
import { BOOKS, bookById } from '../../src/shared/books'

describe('BOOKS', () => {
  it('has 66 books with ids 1..66 in order', () => {
    expect(BOOKS).toHaveLength(66)
    BOOKS.forEach((b, i) => expect(b.id).toBe(i + 1))
    expect(BOOKS[0].name).toBe('Genesis')
    expect(BOOKS[65].name).toBe('Revelation')
  })

  it('has unique 3-letter codes and OSIS ids', () => {
    const codes = BOOKS.map(b => b.abbrev3.toLowerCase())
    expect(new Set(codes).size).toBe(66)
    codes.forEach(c => expect(c).toHaveLength(3))
    expect(new Set(BOOKS.map(b => b.osis)).size).toBe(66)
  })

  it('has the KJV chapter counts', () => {
    expect(BOOKS.reduce((n, b) => n + b.chapters, 0)).toBe(1189)
    expect(bookById(19).chapters).toBe(150)
    expect(bookById(43).name).toBe('John')
    expect(bookById(43).abbrev3).toBe('Joh')
  })

  it('throws for an unknown id', () => {
    expect(() => bookById(67)).toThrow()
  })
})
