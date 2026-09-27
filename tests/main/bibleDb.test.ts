import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BibleDb, BibleDbError } from '../../src/main/bibleDb'
import { JOHN_3_16, makeFixtureBible } from '../helpers/fixtureBible'

let db: BibleDb | null = null
afterEach(() => {
  db?.close()
  db = null
})

describe('BibleDb.open', () => {
  it('throws a clear error when the file is missing', () => {
    expect(() => BibleDb.open(join(tmpdir(), 'no-such-bible.db'))).toThrow(BibleDbError)
    expect(() => BibleDb.open(join(tmpdir(), 'no-such-bible.db'))).toThrow(/not found/)
  })

  it('throws a clear error when the file is not a database', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bible-')), 'bible.db')
    writeFileSync(path, 'this is not a database, just some text that is long enough to be read')
    expect(() => BibleDb.open(path)).toThrow(/damaged/)
  })
})

describe('BibleDb queries', () => {
  it('returns verse counts per chapter', () => {
    db = BibleDb.open(makeFixtureBible())
    const counts = db.verseCounts()
    expect(counts[43][2]).toBe(18)
    expect(counts[43][3]).toBe(1)
    expect(counts[41][2]).toBe(3)
  })

  it('returns verses in a range, across chapters, in order', () => {
    db = BibleDb.open(makeFixtureBible())
    const verses = db.getVerses({ bookId: 43, startChapter: 3, startVerse: 17, endChapter: 4, endVerse: 1 })
    expect(verses.map(v => `${v.chapter}:${v.verse}`)).toEqual(['3:17', '3:18', '4:1'])
    expect(verses[0].bookId).toBe(43)
  })

  it('attaches red-letter spans to their verse only', () => {
    db = BibleDb.open(makeFixtureBible())
    const [v16, v17] = db.getVerses({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 17 })
    expect(v16.text).toBe(JOHN_3_16)
    expect(v16.redLetter).toEqual([{ start: 0, end: JOHN_3_16.length }])
    expect(v17.redLetter).toEqual([])
  })
})
