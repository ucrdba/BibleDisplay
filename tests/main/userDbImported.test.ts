import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UserDb } from '../../src/main/userDb'

const opened: UserDb[] = []
const newPath = () => join(mkdtempSync(join(tmpdir(), 'user-')), 'user.db')
const open = (path: string) => {
  const db = UserDb.open(path)
  opened.push(db)
  return db
}
afterEach(() => {
  while (opened.length) opened.pop()!.close()
})

describe('UserDb imported list', () => {
  it('starts empty', () => {
    expect(open(newPath()).listImported()).toEqual([])
  })

  it('keeps lines in order, including duplicates', () => {
    const db = open(newPath())
    db.setImported(['jn 3:16', 'ps 23', 'jn 3:16'])
    expect(db.listImported()).toEqual(['jn 3:16', 'ps 23', 'jn 3:16'])
  })

  it('replaces the previous list on a new import', () => {
    const db = open(newPath())
    db.setImported(['a', 'b', 'c'])
    db.setImported(['d'])
    expect(db.listImported()).toEqual(['d'])
  })

  it('clears the list', () => {
    const db = open(newPath())
    db.setImported(['a'])
    db.clearImported()
    expect(db.listImported()).toEqual([])
  })

  it('keeps the list after reopening', () => {
    const path = newPath()
    const db = open(path)
    db.setImported(['jn 3:16', 'ps 23'])
    db.close()
    opened.pop()
    expect(open(path).listImported()).toEqual(['jn 3:16', 'ps 23'])
  })

  it('does not touch the recent list', () => {
    const db = open(newPath())
    db.addRecent('mk 3:3')
    db.setImported(['jn 3:16'])
    db.clearImported()
    expect(db.listRecent()).toEqual(['mk 3:3'])
  })

  it('adds the imported table to a user.db from before it existed, without disturbing old data', () => {
    const path = newPath()
    // Pre-Task-17 schema: settings, highlights, recent only — no `imported` table.
    const legacy = new Database(path)
    legacy.exec(`
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
    `)
    legacy.prepare('INSERT INTO recent (input) VALUES (?)').run('mk 3:3')
    legacy.close()

    const db = open(path)
    expect(db.listImported()).toEqual([])
    db.setImported(['jn 3:16'])
    expect(db.listImported()).toEqual(['jn 3:16'])
    expect(db.listRecent()).toEqual(['mk 3:3'])
  })
})
