import { describe, expect, it } from 'vitest'
import { parseReferences } from '../../src/shared/parser'
import { fakeIndex } from '../helpers/fakeIndex'

const parse = (s: string) => parseReferences(s, fakeIndex)
const labels = (s: string) => parse(s).groups.map(g => g.label)
const messages = (s: string) => parse(s).errors.map(e => e.message)

describe('parseReferences', () => {
  it('parses a single verse with positions', () => {
    expect(parse('jn 3:16').groups).toEqual([
      { label: 'John 3:16', bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16, inputStart: 0, inputEnd: 7 },
    ])
  })

  it('parses the example list', () => {
    expect(labels('jn 1:3-5, mk 3:1-3, luke 1:2')).toEqual(['John 1:3-5', 'Mark 3:1-3', 'Luke 1:2'])
  })

  it('parses a whole chapter', () => {
    const [g] = parse('ps 23').groups
    expect(g).toMatchObject({ label: 'Psalms 23', bookId: 19, startChapter: 23, startVerse: 1, endChapter: 23, endVerse: 6 })
  })

  it('parses a chapter range', () => {
    const [g] = parse('ps 23-25').groups
    expect(g).toMatchObject({ label: 'Psalms 23-25', startChapter: 23, startVerse: 1, endChapter: 25, endVerse: 22 })
  })

  it('parses a range across chapters', () => {
    const [g] = parse('jn 1:50-2:3').groups
    expect(g).toMatchObject({ label: 'John 1:50-2:3', startChapter: 1, startVerse: 50, endChapter: 2, endVerse: 3 })
  })

  it('accepts en and em dashes', () => {
    expect(labels('jn 1:3–5; jn 1:3—5')).toEqual(['John 1:3-5', 'John 1:3-5'])
  })

  it('carries the book and chapter to a bare verse number', () => {
    expect(labels('jn 3:16, 18')).toEqual(['John 3:16', 'John 3:18'])
    expect(labels('jn 3:16, 18-20')).toEqual(['John 3:16', 'John 3:18-20'])
  })

  it('carries the book to chapter:verse', () => {
    expect(labels('jn 3:16, 4:2')).toEqual(['John 3:16', 'John 4:2'])
  })

  it('carries a chapter reference as a chapter', () => {
    expect(labels('ps 23, 24')).toEqual(['Psalms 23', 'Psalms 24'])
  })

  it('handles numbered books', () => {
    for (const t of ['1 jn 3:1', '1jn 3:1', '1 john 3:1', '1 Joh 3:1']) expect(labels(t)).toEqual(['1 John 3:1'])
  })

  it('treats a bare number in a single-chapter book as a verse', () => {
    expect(parse('jude 5').groups[0]).toMatchObject({ label: 'Jude 1:5', startChapter: 1, startVerse: 5, endVerse: 5 })
  })

  it('handles semicolons and extra whitespace with correct positions', () => {
    const { groups } = parse('  mk 3:1 ;luke 1:2 ')
    expect(groups.map(g => [g.label, g.inputStart, g.inputEnd])).toEqual([
      ['Mark 3:1', 2, 8],
      ['Luke 1:2', 10, 18],
    ])
  })

  it('reports unknown and ambiguous books', () => {
    expect(parse('xyz 2:1').errors).toEqual([{ message: 'Unknown book "xyz"', inputStart: 0, inputEnd: 7 }])
    expect(messages('jo 3:16')).toEqual(['"jo" matches Joshua, Job, Joel, Jonah, John'])
  })

  it('reports out-of-range chapters and verses', () => {
    expect(messages('mk 3:99')).toEqual(['Mark 3 has only 35 verses'])
    expect(messages('mk 17:1')).toEqual(['Mark has only 16 chapters'])
    expect(messages('jn 3:0')).toEqual(['Chapter and verse numbers start at 1'])
  })

  it('keeps valid items when others fail', () => {
    const r = parse('jn 1:3-5, xyz 2:1, mk 3:99')
    expect(r.groups.map(g => g.label)).toEqual(['John 1:3-5'])
    expect(r.errors.map(e => [e.inputStart, e.inputEnd])).toEqual([
      [10, 17],
      [19, 26],
    ])
  })

  it('reports a missing book or chapter', () => {
    expect(messages('3:16')).toEqual(['Missing book name'])
    expect(messages('luke')).toEqual(['Missing chapter after "Luke"'])
  })

  it('reports a reversed range', () => {
    expect(messages('jn 3:18-16')).toEqual(['Range ends before it starts'])
  })

  it('ignores empty input and empty items', () => {
    expect(parse('')).toEqual({ groups: [], errors: [] })
    expect(parse(' , ; ')).toEqual({ groups: [], errors: [] })
  })

  it('does not carry over from a failed item', () => {
    expect(labels('jn 3:16, xyz 1:1, 18')).toEqual(['John 3:16', 'John 3:18'])
  })

  it('explains incomplete references', () => {
    expect(messages('luke 3:')).toEqual(['Incomplete reference "luke 3:"'])
    expect(messages('ps 23:1-')).toEqual(['Incomplete reference "ps 23:1-"'])
    expect(messages('jn:16')).toEqual(['Incomplete reference "jn:16"'])
    expect(messages('1 john 3:')).toEqual(['Incomplete reference "1 john 3:"'])
    expect(messages('xyz 3:')).toEqual(['Unknown book "xyz"'])
    expect(messages('jo 3:')).toEqual(['"jo" matches Joshua, Job, Joel, Jonah, John'])
    expect(messages('3:')).toEqual(['Incomplete reference "3:"'])
    expect(parse('jn 3:16, luke 3:').errors).toEqual([{ message: 'Incomplete reference "luke 3:"', inputStart: 9, inputEnd: 16 }])
  })

  it('accepts a period between chapter and verse', () => {
    expect(labels('gen 1.1')).toEqual(['Genesis 1:1'])
    expect(labels('jn 1.3-5')).toEqual(['John 1:3-5'])
    expect(labels('jn 1.50-2.3')).toEqual(['John 1:50-2:3'])
    expect(labels('jn 3.16, 18')).toEqual(['John 3:16', 'John 3:18'])
    expect(labels('jn 3.16, 4.2')).toEqual(['John 3:16', 'John 4:2'])
    expect(labels('jn 3.16; jn 1:3-5')).toEqual(['John 3:16', 'John 1:3-5'])
  })

  it('still treats a period after a book name as part of the abbreviation', () => {
    expect(labels('Jn. 3.16')).toEqual(['John 3:16'])
    expect(labels('1 Jn. 3.1')).toEqual(['1 John 3:1'])
    expect(labels('Jn. 3:16')).toEqual(['John 3:16'])
  })

  it('reports errors the same way with a period', () => {
    expect(messages('mk 3.99')).toEqual(['Mark 3 has only 35 verses'])
    expect(messages('luke 3.')).toEqual(['Incomplete reference "luke 3."'])
    expect(messages('1 Jn.')).toEqual(['Missing chapter after "1 John"'])
  })
})
