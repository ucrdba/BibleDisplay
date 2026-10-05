import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import type { VerseRow } from '../shared/search'
import type { BibleVerse, Span, VerseCounts, VerseSpan } from '../shared/types'

export class BibleDbError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BibleDbError'
  }
}

const key = (chapter: number, verse: number) => chapter * 1000 + verse

export class BibleDb {
  private constructor(private readonly db: Database.Database) {}

  static open(path: string): BibleDb {
    if (!existsSync(path)) throw new BibleDbError(`Bible database not found: ${path}`)
    let db: Database.Database | undefined
    try {
      db = new Database(path, { readonly: true, fileMustExist: true })
      const row = db.prepare('SELECT count(*) AS n FROM verses').get() as { n: number }
      if (row.n === 0) throw new Error('it contains no verses')
      return new BibleDb(db)
    } catch (e) {
      db?.close()
      throw new BibleDbError(`Bible database is damaged (${(e as Error).message}): ${path}`)
    }
  }

  verseCounts(): VerseCounts {
    const rows = this.db
      .prepare('SELECT book_id AS b, chapter AS c, max(verse) AS n FROM verses GROUP BY book_id, chapter')
      .all() as { b: number; c: number; n: number }[]
    const out: VerseCounts = {}
    for (const r of rows) (out[r.b] ??= [])[r.c - 1] = r.n
    return out
  }

  allVerses(): VerseRow[] {
    return this.db
      .prepare('SELECT book_id, chapter, verse, text FROM verses ORDER BY book_id, chapter, verse')
      .raw()
      .all() as VerseRow[]
  }

  getVerses(span: VerseSpan): BibleVerse[] {
    const lo = key(span.startChapter, span.startVerse)
    const hi = key(span.endChapter, span.endVerse)
    const rows = this.db
      .prepare(
        'SELECT chapter, verse, text FROM verses WHERE book_id = ? AND chapter * 1000 + verse BETWEEN ? AND ? ORDER BY chapter, verse',
      )
      .all(span.bookId, lo, hi) as { chapter: number; verse: number; text: string }[]
    const reds = this.db
      .prepare(
        'SELECT chapter, verse, start_pos AS start, end_pos AS end FROM red_letter WHERE book_id = ? AND chapter * 1000 + verse BETWEEN ? AND ? ORDER BY start_pos',
      )
      .all(span.bookId, lo, hi) as { chapter: number; verse: number; start: number; end: number }[]
    const byVerse = new Map<number, Span[]>()
    for (const r of reds) {
      const list = byVerse.get(key(r.chapter, r.verse)) ?? []
      list.push({ start: r.start, end: r.end })
      byVerse.set(key(r.chapter, r.verse), list)
    }
    return rows.map(r => ({
      bookId: span.bookId,
      chapter: r.chapter,
      verse: r.verse,
      text: r.text,
      redLetter: byVerse.get(key(r.chapter, r.verse)) ?? [],
    }))
  }

  close(): void {
    this.db.close()
  }
}
