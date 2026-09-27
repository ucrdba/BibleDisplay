import Database from 'better-sqlite3'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBibleDb, validateChapterCounts } from '../../data/lib/buildBibleDb'
import type { ParsedVerse } from '../../data/lib/osis'
import { parseOsis } from '../../data/lib/osis'
import { BOOKS } from '../../src/shared/books'
import { FIXTURE } from '../helpers/osisFixture'

describe('buildBibleDb', () => {
  it('writes books, aliases, verses, and red-letter spans, skipping Apocrypha', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'bible-')), 'bible.db')
    buildBibleDb(parseOsis(FIXTURE), path)
    const db = new Database(path, { readonly: true })
    expect(db.prepare('SELECT count(*) AS n FROM books').get()).toEqual({ n: 66 })
    expect(db.prepare("SELECT book_id FROM book_aliases WHERE alias = 'jn'").get()).toEqual({ book_id: 43 })
    expect(db.prepare('SELECT count(*) AS n FROM verses').get()).toEqual({ n: 3 })
    expect(db.prepare('SELECT count(*) AS n FROM red_letter').get()).toEqual({ n: 2 })
    const row = db.prepare('SELECT text FROM verses WHERE book_id = 41 AND chapter = 3 AND verse = 3').get() as { text: string }
    expect(row.text).toContain('Stand forth.')
    db.close()
  })
})

describe('validateChapterCounts', () => {
  it('accepts a Bible with every chapter present', () => {
    const verses: ParsedVerse[] = BOOKS.flatMap(b =>
      Array.from({ length: b.chapters }, (_, i) => ({ osisBook: b.osis, chapter: i + 1, verse: 1, text: 'x', redLetter: [] })),
    )
    expect(validateChapterCounts(verses)).toEqual([])
  })

  it('reports books with missing chapters', () => {
    const problems = validateChapterCounts(parseOsis(FIXTURE))
    expect(problems).toContain('Genesis: expected 50 chapters, found 0')
    expect(problems).toContain('Mark: expected 16 chapters, found 3')
  })
})
