import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BibleDb } from '../../src/main/bibleDb'
import { searchVerses, type SearchQuery, type VerseRow } from '../../src/shared/search'

const PATH = join(process.cwd(), 'resources', 'bible.db')

describe.skipIf(!existsSync(PATH))('resources/bible.db', () => {
  let db: Database.Database
  beforeAll(() => {
    db = new Database(PATH, { readonly: true })
  })
  afterAll(() => db.close())
  const text = (b: number, c: number, v: number) =>
    (db.prepare('SELECT text FROM verses WHERE book_id = ? AND chapter = ? AND verse = ?').get(b, c, v) as { text: string }).text
  const reds = (b: number, c: number, v: number) =>
    db
      .prepare('SELECT start_pos AS start, end_pos AS end FROM red_letter WHERE book_id = ? AND chapter = ? AND verse = ?')
      .all(b, c, v) as { start: number; end: number }[]

  it('has all 31,102 KJV verses', () => {
    expect(db.prepare('SELECT count(*) AS n FROM verses').get()).toEqual({ n: 31102 })
  })

  it('has the expected text', () => {
    expect(text(1, 1, 1)).toBe('In the beginning God created the heaven and the earth.')
  })

  it('marks words of Jesus', () => {
    const [r] = reds(41, 3, 3)
    expect(text(41, 3, 3).slice(r.start, r.end)).toBe('Stand forth.')
    expect(reds(43, 3, 16).length).toBeGreaterThan(0)
  })

  it('does not mark narration', () => {
    expect(reds(43, 1, 1)).toEqual([])
  })
})

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
