import { describe, expect, it } from 'vitest'
import { bookById } from '../../src/shared/books'
import { applyBook, matchBooks, suggest } from '../../src/shared/suggest'
import { fakeIndex } from '../helpers/fakeIndex'

const at = (input: string, caret = input.length) => suggest(input, caret, fakeIndex)
const names = (input: string, caret?: number) => {
  const s = at(input, caret)
  return s.kind === 'books' ? s.books.map(b => b.name) : s.kind
}
const hint = (input: string) => {
  const s = at(input)
  return s.kind === 'hint' ? s.text : s.kind
}

describe('matchBooks', () => {
  it('ranks exact key matches before prefix matches', () => {
    expect(matchBooks('jn').map(b => b.name)).toEqual(['John', 'Jonah'])
  })
})

describe('suggest', () => {
  it('suggests books starting with a letter, in Bible order', () => {
    expect(names('l')).toEqual(['Leviticus', 'Lamentations', 'Luke'])
    const s = at('l')
    expect(s).toMatchObject({ kind: 'books', replaceStart: 0, replaceEnd: 1 })
  })

  it('suggests numbered books for a leading digit', () => {
    const list = names('1') as string[]
    expect(list).toHaveLength(8)
    expect(list[0]).toBe('1 Samuel')
    expect(list[7]).toBe('1 John')
    expect(names('1 c')).toEqual(['1 Chronicles', '1 Corinthians'])
  })

  it('works on the item after the last comma', () => {
    expect(names('jn 3:16, l')).toEqual(['Leviticus', 'Lamentations', 'Luke'])
    expect(at('jn 3:16, l')).toMatchObject({ replaceStart: 9, replaceEnd: 10 })
  })

  it('does not treat a carried-over verse number as a book', () => {
    expect(names('jn 3:16, 1')).toBe('none')
  })

  it('uses the caret position, not the end of the input', () => {
    expect(names('lu, jn 3:16', 2)).toEqual(['Luke'])
  })

  it('returns none for no match or empty input', () => {
    expect(names('xyzzy')).toBe('none')
    expect(names('')).toBe('none')
  })

  it('shows chapter and verse hints', () => {
    expect(hint('Luke ')).toBe('24 chapters')
    expect(hint('Luke 1')).toBe('24 chapters')
    expect(hint('Luke 1:')).toBe('80 verses')
    expect(hint('Luke 1:5')).toBe('80 verses')
    expect(hint('Luke 99:')).toBe('Luke has only 24 chapters')
    expect(hint('jude ')).toBe('1 chapter')
  })

  it('shows the verse hint after a period too', () => {
    expect(hint('Luke 1.')).toBe('80 verses')
    expect(hint('Luke 1.5')).toBe('80 verses')
    expect(hint('Jn. ')).toBe('21 chapters')
  })
})

describe('applyBook', () => {
  it('replaces the typed text with the full name and a space', () => {
    expect(applyBook('jn 3:16, l', { replaceStart: 9, replaceEnd: 10 }, bookById(42))).toEqual({
      value: 'jn 3:16, Luke ',
      caret: 14,
    })
  })
})

describe('suggest in search text', () => {
  it('offers nothing for ? and / searches', () => {
    expect(at('?mercy, job')).toEqual({ kind: 'none' })
    expect(at('/gr.ce, job/')).toEqual({ kind: 'none' })
    expect(at('  ?job')).toEqual({ kind: 'none' })
  })
})
