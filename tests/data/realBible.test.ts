import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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
