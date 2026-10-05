import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { buildStrongs, StrongsBuildError, verseChecksum, type StrongsBook } from '../../data/lib/strongs/buildStrongs'
import type { DictEntry } from '../../data/lib/strongs/dictionary'
import type { Token } from '../../data/lib/strongs/usfm'
import { JOHN_3_16, makeFixtureBible } from '../helpers/fixtureBible'

// JOHN_3_16 = 'For God so loved the world, that he gave his only begotten Son.'
const t = (word: string, strongs: string | null = null): Token => ({ word, strongs })
const JOHN: StrongsBook = {
  book: 43,
  verses: new Map([
    ['3:16', [t('For'), t('God', 'G2316'), t('so'), t('loved', 'G25'), t('the'), t('world', 'G2889')]],
    ['3:17', [t('For'), t('God', 'G2316')]],
  ]),
}
const entry = (id: string): DictEntry => ({ id, lemma: 'x', xlit: 'x', pron: '', derivation: '', definition: `def ${id}`, kjvDef: '' })
const ENTRIES = [entry('G2316'), entry('G25'), entry('H430')]

const rows = (path: string) => {
  const db = new Database(path, { readonly: true })
  try {
    return db
      .prepare('SELECT chapter, verse, start_pos AS s, end_pos AS e, strongs FROM word_strongs ORDER BY chapter, verse, start_pos')
      .all() as { chapter: number; verse: number; s: number; e: number; strongs: string }[]
  } finally {
    db.close()
  }
}

describe('buildStrongs', () => {
  it('writes placed words and dictionary entries without changing verse text', () => {
    const path = makeFixtureBible()
    const db = new Database(path)
    const before = verseChecksum(db)
    db.close()

    const report = buildStrongs(path, [JOHN], ENTRIES)

    const words = rows(path)
    expect(words.filter(w => w.verse === 16).map(w => [JOHN_3_16.slice(w.s, w.e), w.strongs])).toEqual([
      ['God', 'G2316'],
      ['loved', 'G25'],
      ['world', 'G2889'],
    ])
    expect(report).toMatchObject({ tagged: 4, placed: 4, hebrew: 1, greek: 2, missingEntries: ['G2889'] })

    const after = new Database(path, { readonly: true })
    expect(verseChecksum(after)).toEqual(before)
    expect((after.prepare('SELECT definition FROM strongs_entries WHERE id = ?').get('G25') as { definition: string }).definition).toBe('def G25')
    after.close()
  })

  it('replaces earlier rows when run again', () => {
    const path = makeFixtureBible()
    buildStrongs(path, [JOHN], ENTRIES)
    buildStrongs(path, [JOHN], ENTRIES)
    expect(rows(path)).toHaveLength(4)
  })

  it('refuses to write if verse text would change', () => {
    const path = makeFixtureBible()
    buildStrongs(path, [JOHN], ENTRIES)
    const db = new Database(path)
    db.exec("CREATE TRIGGER sabotage AFTER INSERT ON word_strongs BEGIN UPDATE verses SET text = 'changed' WHERE verse = 16; END")
    const before = verseChecksum(db)
    db.close()

    expect(() => buildStrongs(path, [JOHN], [entry('G2316')])).toThrow(StrongsBuildError)

    const after = new Database(path, { readonly: true })
    expect(verseChecksum(after)).toEqual(before)
    expect((after.prepare('SELECT count(*) AS n FROM strongs_entries').get() as { n: number }).n).toBe(3)
    after.close()
  })

  it('computes the checksum over verse text in Bible order', () => {
    const db = new Database(makeFixtureBible(), { readonly: true })
    const sum = verseChecksum(db)
    db.close()
    expect(sum.count).toBe(5)
    expect(sum.sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})
