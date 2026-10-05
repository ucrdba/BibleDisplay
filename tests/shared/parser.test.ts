import { describe, expect, it } from 'vitest'
import { parseReferences } from '../../src/shared/parser'
import { fakeIndex } from '../helpers/fakeIndex'

const parse = (s: string) => parseReferences(s, fakeIndex)
const labels = (s: string) => parse(s).groups.map(g => g.label)
const messages = (s: string) => parse(s).errors.map(e => e.message)

describe('parseReferences', () => {
  it('parses a single verse with positions', () => {
    expect(parse('jn 3:16').groups).toEqual([
      { label: 'John 3:16', bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16, whole: false, inputStart: 0, inputEnd: 7 },
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

  it('marks chapter-only references as whole', () => {
    const whole = (s: string) => parse(s).groups.map(g => g.whole)
    expect(whole('ps 23')).toEqual([true])
    expect(whole('ps 23-24')).toEqual([true])
    expect(whole('ps 23, 24')).toEqual([true, true])
    expect(whole('jn 3:16')).toEqual([false])
    expect(whole('jn 3:16-4:2')).toEqual([false])
    expect(whole('luke 1:18..')).toEqual([false])
    expect(whole('jude 5')).toEqual([false])
    expect(whole('jn 3:16, 18')).toEqual([false, false])
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

  it('reads ".." after a verse as the rest of the chapter', () => {
    expect(parse('luke 1.18..,john 3.16').groups).toEqual([
      { label: 'Luke 1:18-80', bookId: 42, startChapter: 1, startVerse: 18, endChapter: 1, endVerse: 80, whole: false, inputStart: 0, inputEnd: 11 },
      { label: 'John 3:16', bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16, whole: false, inputStart: 12, inputEnd: 21 },
    ])
    expect(labels('luke 1:18..')).toEqual(['Luke 1:18-80'])
    expect(labels('luke 1:18 ..')).toEqual(['Luke 1:18-80'])
    expect(labels('luke 1:80..')).toEqual(['Luke 1:80'])
    expect(labels('jn 3:16, 30..')).toEqual(['John 3:16', 'John 3:30-36'])
    expect(labels('jude 20..')).toEqual(['Jude 1:20-25'])
  })

  it('reports problems with ".."', () => {
    expect(messages('luke 1:81..')).toEqual(['Luke 1 has only 80 verses'])
    expect(messages('luke 1..')).toEqual(['Incomplete reference "luke 1.."'])
    expect(messages('luke 1:18...')).toEqual(['Incomplete reference "luke 1:18..."'])
  })

  it('reports errors the same way with a period', () => {
    expect(messages('mk 3.99')).toEqual(['Mark 3 has only 35 verses'])
    expect(messages('luke 3.')).toEqual(['Incomplete reference "luke 3."'])
    expect(messages('1 Jn.')).toEqual(['Missing chapter after "1 John"'])
  })
})

describe('verse lists with periods', () => {
  it('lists single verses', () => {
    expect(labels('ps 23.1.3.4')).toEqual(['Psalms 23:1', 'Psalms 23:3', 'Psalms 23:4'])
    expect(labels('ps 23:1.3.4')).toEqual(['Psalms 23:1', 'Psalms 23:3', 'Psalms 23:4'])
  })

  it('uses .. between two numbers as a range', () => {
    expect(labels('ps 23.1..3.5')).toEqual(['Psalms 23:1-3', 'Psalms 23:5'])
    expect(labels('ps 23:1..3')).toEqual(['Psalms 23:1-3'])
    expect(labels('lk 1.1..5.7..')).toEqual(['Luke 1:1-5', 'Luke 1:7-80'])
  })

  it('lets a trailing .. run the last verse to the end of the chapter', () => {
    expect(labels('ps 23.1.3.4..')).toEqual(['Psalms 23:1', 'Psalms 23:3', 'Psalms 23:4-6'])
  })

  it('mixes with commas and carries the chapter to a bare verse', () => {
    expect(labels('ps 23.1.3, 5-6')).toEqual(['Psalms 23:1', 'Psalms 23:3', 'Psalms 23:5-6'])
    expect(labels('jn 3:16, ps 23.1.2')).toEqual(['John 3:16', 'Psalms 23:1', 'Psalms 23:2'])
  })

  it('works for a one-chapter book when the chapter is given', () => {
    expect(labels('jude 1.5.7')).toEqual(['Jude 1:5', 'Jude 1:7'])
  })

  it('gives every verse the item position for error marks, and is not a whole chapter', () => {
    const groups = parse('jn 3:16, ps 23.1.3').groups
    expect(groups.slice(1).map(g => [g.inputStart, g.inputEnd, g.whole])).toEqual([
      [9, 18, false],
      [9, 18, false],
    ])
  })

  it('reports problems in a verse list and shows none of it', () => {
    expect(messages('ps 23.1.9')).toEqual(['Psalms 23 has only 6 verses'])
    expect(labels('ps 23.1.9')).toEqual([])
    expect(messages('ps 23.1.3-5')).toEqual(['Use .. for a range in a verse list, e.g. ps 23.1.3..5'])
    expect(messages('ps 23.1..5..')).toEqual(["'..' at the end goes after a single verse"])
    expect(messages('ps 23.5..2')).toEqual(['Range ends before it starts'])
    expect(messages('ps 23..25')).toEqual(['Incomplete reference "ps 23..25"'])
  })

  it('leaves the existing period forms alone', () => {
    expect(labels('ps 23.1')).toEqual(['Psalms 23:1'])
    expect(labels('jn 1.50-2.3')).toEqual(['John 1:50-2:3'])
    expect(labels('luke 1.18..')).toEqual(['Luke 1:18-80'])
    expect(labels('ps 23')).toEqual(['Psalms 23'])
    expect(labels('jude 5')).toEqual(['Jude 1:5'])
    expect(labels('jn 3:16, 18')).toEqual(['John 3:16', 'John 3:18'])
  })
})

describe('book abbreviations with a period', () => {
  it('still accepts "gen. 1:1" and "1 jn. 3:1"', () => {
    expect(labels('gen. 1:1')).toEqual(['Genesis 1:1'])
    expect(labels('1 jn. 3:1')).toEqual(['1 John 3:1'])
  })
})
