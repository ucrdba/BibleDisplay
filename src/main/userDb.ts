import Database from 'better-sqlite3'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { removeIndices } from '../shared/listSelection'
import { DEFAULT_SEARCH_PREFS, normalizeSearchPrefs, type SearchPrefs } from '../shared/search'
import { normalizeStyles, type Styles } from '../shared/styles'
import type { Highlight, VerseRange, VerseSpan } from '../shared/types'

export type StoredHighlight = Highlight & { chapter: number; verse: number }

const RECENT_LIMIT = 20

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  start_pos INTEGER NOT NULL,
  end_pos INTEGER NOT NULL,
  color TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS highlights_verse ON highlights (book_id, chapter, verse);
CREATE TABLE IF NOT EXISTS recent (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  input TEXT NOT NULL,
  used_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS imported (
  position INTEGER PRIMARY KEY,
  input TEXT NOT NULL
);
`

function connect(path: string): Database.Database {
  let db: Database.Database | undefined
  try {
    db = new Database(path)
    const check = db.pragma('quick_check', { simple: true })
    if (check !== 'ok') throw new Error(`quick_check: ${String(check)}`)
    db.exec(SCHEMA)
    return db
  } catch (e) {
    db?.close()
    throw e
  }
}

export class UserDb {
  private constructor(private readonly db: Database.Database) {}

  static open(path: string): UserDb {
    try {
      return new UserDb(connect(path))
    } catch {
      const bad = `${path}.bad`
      rmSync(bad, { force: true })
      if (existsSync(path)) renameSync(path, bad)
      return new UserDb(connect(path))
    }
  }

  getStyles(): Styles {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('styles') as { value: string } | undefined
    if (!row) return normalizeStyles(undefined)
    try {
      return normalizeStyles(JSON.parse(row.value))
    } catch {
      return normalizeStyles(undefined)
    }
  }

  setStyles(styles: Styles): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('styles', JSON.stringify(normalizeStyles(styles)))
  }

  highlightsFor(span: VerseSpan): StoredHighlight[] {
    return this.db
      .prepare(
        `SELECT id, chapter, verse, start_pos AS start, end_pos AS end, color FROM highlights
         WHERE book_id = ? AND chapter * 1000 + verse BETWEEN ? AND ? ORDER BY id`,
      )
      .all(
        span.bookId,
        span.startChapter * 1000 + span.startVerse,
        span.endChapter * 1000 + span.endVerse,
      ) as StoredHighlight[]
  }

  addHighlights(ranges: VerseRange[], color: string): void {
    const insert = this.db.prepare(
      'INSERT INTO highlights (book_id, chapter, verse, start_pos, end_pos, color) VALUES (?, ?, ?, ?, ?, ?)',
    )
    this.db.transaction(() => {
      for (const r of ranges) if (r.end > r.start) insert.run(r.bookId, r.chapter, r.verse, r.start, r.end, color)
    })()
  }

  removeHighlights(ranges: VerseRange[]): void {
    const find = this.db.prepare(
      `SELECT id, start_pos AS start, end_pos AS end, color FROM highlights
       WHERE book_id = ? AND chapter = ? AND verse = ? AND start_pos < ? AND end_pos > ?`,
    )
    const del = this.db.prepare('DELETE FROM highlights WHERE id = ?')
    const insert = this.db.prepare(
      'INSERT INTO highlights (book_id, chapter, verse, start_pos, end_pos, color) VALUES (?, ?, ?, ?, ?, ?)',
    )
    this.db.transaction(() => {
      for (const r of ranges) {
        const hits = find.all(r.bookId, r.chapter, r.verse, r.end, r.start) as Highlight[]
        for (const h of hits) {
          del.run(h.id)
          if (h.start < r.start) insert.run(r.bookId, r.chapter, r.verse, h.start, r.start, h.color)
          if (r.end < h.end) insert.run(r.bookId, r.chapter, r.verse, r.end, h.end, h.color)
        }
      }
    })()
  }

  addRecent(input: string): void {
    const text = input.trim()
    if (!text) return
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM recent WHERE input = ?').run(text)
      this.db.prepare('INSERT INTO recent (input) VALUES (?)').run(text)
      this.db
        .prepare('DELETE FROM recent WHERE id NOT IN (SELECT id FROM recent ORDER BY id DESC LIMIT ?)')
        .run(RECENT_LIMIT)
    })()
  }

  listRecent(): string[] {
    const rows = this.db.prepare('SELECT input FROM recent ORDER BY id DESC LIMIT ?').all(RECENT_LIMIT) as {
      input: string
    }[]
    return rows.map(r => r.input)
  }

  setImported(lines: string[]): void {
    const insert = this.db.prepare('INSERT INTO imported (position, input) VALUES (?, ?)')
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM imported').run()
      lines.forEach((line, i) => insert.run(i, line))
    })()
  }

  listImported(): string[] {
    const rows = this.db.prepare('SELECT input FROM imported ORDER BY position').all() as { input: string }[]
    return rows.map(r => r.input)
  }

  clearImported(): void {
    this.db.prepare('DELETE FROM imported').run()
  }

  removeImported(indices: number[]): void {
    this.setImported(removeIndices(this.listImported(), indices))
  }

  removeRecent(inputs: string[]): void {
    const del = this.db.prepare('DELETE FROM recent WHERE input = ?')
    this.db.transaction(() => {
      for (const input of inputs) del.run(input)
    })()
  }

  getDisplayMonitorId(): number | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('displayMonitor') as { value: string } | undefined
    if (!row) return null
    const n: unknown = JSON.parse(row.value)
    return typeof n === 'number' && Number.isInteger(n) ? n : null
  }

  setDisplayMonitorId(id: number | null): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('displayMonitor', JSON.stringify(id))
  }

  getPanelCollapsed(): boolean {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('rightPanelCollapsed') as { value: string } | undefined
    return row?.value === 'true'
  }

  setPanelCollapsed(collapsed: boolean): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('rightPanelCollapsed', JSON.stringify(collapsed))
  }

  getSearchPrefs(): SearchPrefs {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('search') as { value: string } | undefined
    if (!row) return { ...DEFAULT_SEARCH_PREFS }
    try {
      return normalizeSearchPrefs(JSON.parse(row.value))
    } catch {
      return { ...DEFAULT_SEARCH_PREFS }
    }
  }

  setSearchPrefs(prefs: SearchPrefs): void {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('search', JSON.stringify(normalizeSearchPrefs(prefs)))
  }

  close(): void {
    this.db.close()
  }
}
