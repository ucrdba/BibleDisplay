import Database from 'better-sqlite3'
import { BOOKS } from '../../src/shared/books'
import { bookKeys } from '../../src/shared/resolve'
import type { ParsedVerse } from './osis'

const SCHEMA = `
CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  abbrev3 TEXT NOT NULL UNIQUE,
  osis TEXT NOT NULL UNIQUE,
  chapters INTEGER NOT NULL
);
CREATE TABLE book_aliases (
  alias TEXT PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id)
);
CREATE TABLE verses (
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (book_id, chapter, verse)
) WITHOUT ROWID;
CREATE TABLE red_letter (
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  start_pos INTEGER NOT NULL,
  end_pos INTEGER NOT NULL
);
CREATE INDEX red_letter_verse ON red_letter (book_id, chapter, verse);
`

export function buildBibleDb(verses: ParsedVerse[], outPath: string): void {
  const bookByOsis = new Map(BOOKS.map(b => [b.osis, b]))
  const db = new Database(outPath)
  try {
    db.exec(SCHEMA)
    const insertBook = db.prepare('INSERT INTO books (id, name, abbrev3, osis, chapters) VALUES (?, ?, ?, ?, ?)')
    const insertAlias = db.prepare('INSERT INTO book_aliases (alias, book_id) VALUES (?, ?)')
    const insertVerse = db.prepare('INSERT INTO verses (book_id, chapter, verse, text) VALUES (?, ?, ?, ?)')
    const insertRed = db.prepare(
      'INSERT INTO red_letter (book_id, chapter, verse, start_pos, end_pos) VALUES (?, ?, ?, ?, ?)',
    )
    db.transaction(() => {
      for (const b of BOOKS) {
        insertBook.run(b.id, b.name, b.abbrev3, b.osis, b.chapters)
        for (const key of bookKeys(b)) insertAlias.run(key, b.id)
      }
      for (const v of verses) {
        const book = bookByOsis.get(v.osisBook)
        if (!book) continue
        insertVerse.run(book.id, v.chapter, v.verse, v.text)
        for (const s of v.redLetter) insertRed.run(book.id, v.chapter, v.verse, s.start, s.end)
      }
    })()
  } finally {
    db.close()
  }
}

export function validateChapterCounts(verses: ParsedVerse[]): string[] {
  const maxChapter = new Map<string, number>()
  for (const v of verses) maxChapter.set(v.osisBook, Math.max(maxChapter.get(v.osisBook) ?? 0, v.chapter))
  const problems: string[] = []
  for (const b of BOOKS) {
    const found = maxChapter.get(b.osis) ?? 0
    if (found !== b.chapters) problems.push(`${b.name}: expected ${b.chapters} chapters, found ${found}`)
  }
  return problems
}
