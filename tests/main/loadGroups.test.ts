import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BibleDb } from '../../src/main/bibleDb'
import { loadGroups } from '../../src/main/loadGroups'
import { UserDb } from '../../src/main/userDb'
import type { RefGroup } from '../../src/shared/types'
import { makeFixtureBible } from '../helpers/fixtureBible'

describe('loadGroups', () => {
  it('returns labeled groups of verses with their own highlights', () => {
    const bible = BibleDb.open(makeFixtureBible())
    const user = UserDb.open(join(mkdtempSync(join(tmpdir(), 'user-')), 'user.db'))
    user.addHighlights([{ bookId: 43, chapter: 3, verse: 17, start: 0, end: 7 }], 'gold')
    const group: RefGroup = {
      label: 'John 3:16-18', bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 18, inputStart: 0, inputEnd: 10,
    }

    const [g] = loadGroups(bible, user, [group])

    expect(g.label).toBe('John 3:16-18')
    expect(g.verses.map(v => v.verse)).toEqual([16, 17, 18])
    expect(g.verses[0].highlights).toEqual([])
    expect(g.verses[1].highlights).toEqual([{ id: 1, start: 0, end: 7, color: 'gold' }])
    expect(g.verses[0].redLetter.length).toBe(1)
    bible.close()
    user.close()
  })
})
