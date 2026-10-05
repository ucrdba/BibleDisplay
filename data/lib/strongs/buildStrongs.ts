import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { alignStrongs } from './align'
import type { DictEntry } from './dictionary'
import type { Token } from './usfm'

export interface StrongsBook {
  /** Our book id, 1-66. */
  book: number
  /** Tokens keyed "chapter:verse". */
  verses: Map<string, Token[]>
}

export interface StrongsReport {
  tagged: number
  placed: number
  topUnplaced: [string, number][]
  hebrew: number
  greek: number
  /** Strong's ids used by placed words that have no dictionary entry. */
  missingEntries: string[]
}

export class StrongsBuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StrongsBuildError'
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS word_strongs (
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  start_pos INTEGER NOT NULL,
  end_pos INTEGER NOT NULL,
  strongs TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS word_strongs_verse ON word_strongs (book_id, chapter, verse);
CREATE TABLE IF NOT EXISTS strongs_entries (
  id TEXT PRIMARY KEY,
  lemma TEXT NOT NULL,
  xlit TEXT NOT NULL,
  pron TEXT NOT NULL,
  derivation TEXT NOT NULL,
  definition TEXT NOT NULL,
  kjv_def TEXT NOT NULL
);
DELETE FROM word_strongs;
DELETE FROM strongs_entries;
`

/** Verse count and SHA-256 of every verse text in Bible order, to prove the import leaves the text alone. */
export function verseChecksum(db: Database.Database): { count: number; sha256: string } {
  const hash = createHash('sha256')
  let count = 0
  const rows = db.prepare('SELECT book_id, chapter, verse, text FROM verses ORDER BY book_id, chapter, verse').raw().iterate() as Iterable<
    [number, number, number, string]
  >
  for (const [b, c, v, text] of rows) {
    hash.update(`${b}.${c}.${v}\t${text}\n`, 'utf8')
    count++
  }
  return { count, sha256: hash.digest('hex') }
}

export function buildStrongs(dbPath: string, books: StrongsBook[], entries: DictEntry[]): StrongsReport {
  const db = new Database(dbPath)
  try {
    const before = verseChecksum(db)
    const tokensByVerse = new Map<string, Token[]>()
    for (const b of books) for (const [cv, tokens] of b.verses) tokensByVerse.set(`${b.book}:${cv}`, tokens)

    const verses = db.prepare('SELECT book_id AS b, chapter AS c, verse AS v, text FROM verses').all() as {
      b: number
      c: number
      v: number
      text: string
    }[]
    const rows: [number, number, number, number, number, string][] = []
    const unplaced = new Map<string, number>()
    const used = new Set<string>()
    let tagged = 0
    for (const v of verses) {
      const tokens = tokensByVerse.get(`${v.b}:${v.c}:${v.v}`) ?? []
      tagged += tokens.filter(tk => tk.strongs).length
      const result = alignStrongs(v.text, tokens)
      for (const w of result.unplaced) unplaced.set(w, (unplaced.get(w) ?? 0) + 1)
      for (const s of result.spans) {
        rows.push([v.b, v.c, v.v, s.start, s.end, s.strongs])
        used.add(s.strongs)
      }
    }

    db.transaction(() => {
      db.exec(SCHEMA)
      const insertWord = db.prepare(
        'INSERT INTO word_strongs (book_id, chapter, verse, start_pos, end_pos, strongs) VALUES (?, ?, ?, ?, ?, ?)',
      )
      for (const r of rows) insertWord.run(...r)
      const insertEntry = db.prepare(
        'INSERT INTO strongs_entries (id, lemma, xlit, pron, derivation, definition, kjv_def) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      for (const e of entries) insertEntry.run(e.id, e.lemma, e.xlit, e.pron, e.derivation, e.definition, e.kjvDef)
      const after = verseChecksum(db)
      if (after.count !== before.count || after.sha256 !== before.sha256) {
        throw new StrongsBuildError("Verse text changed during the Strong's import; nothing was written")
      }
    })()

    const ids = new Set(entries.map(e => e.id))
    return {
      tagged,
      placed: rows.length,
      topUnplaced: [...unplaced.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      hebrew: entries.filter(e => e.id.startsWith('H')).length,
      greek: entries.filter(e => e.id.startsWith('G')).length,
      missingEntries: [...used].filter(id => !ids.has(id)).sort(),
    }
  } finally {
    db.close()
  }
}
