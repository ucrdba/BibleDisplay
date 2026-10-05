import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { UserDb } from '../../src/main/userDb'
import { DEFAULT_STYLES } from '../../src/shared/styles'

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

const JOHN_3 = { bookId: 43, startChapter: 3, startVerse: 1, endChapter: 3, endVerse: 36 }
const brief = (db: UserDb) => db.highlightsFor(JOHN_3).map(h => [h.verse, h.start, h.end, h.color])

describe('UserDb styles', () => {
  it('starts with default styles', () => {
    expect(open(newPath()).getStyles()).toEqual(DEFAULT_STYLES)
  })

  it('saves styles and keeps them after reopening', () => {
    const path = newPath()
    const db = open(path)
    db.setStyles({ ...DEFAULT_STYLES, jesusColor: '#cc0000', scale: 1.5 })
    db.close()
    opened.pop()
    const again = open(path).getStyles()
    expect(again.jesusColor).toBe('#cc0000')
    expect(again.scale).toBe(1.5)
  })

  it('replaces a corrupt file with a fresh one and keeps the old one as .bad', () => {
    const path = newPath()
    writeFileSync(path, 'this is not a database, just some text that is long enough to be read')
    const db = open(path)
    expect(existsSync(`${path}.bad`)).toBe(true)
    expect(db.getStyles()).toEqual(DEFAULT_STYLES)
  })
})

describe('UserDb highlights', () => {
  it('adds highlights and returns only those in the span', () => {
    const db = open(newPath())
    db.addHighlights(
      [
        { bookId: 43, chapter: 3, verse: 16, start: 0, end: 10 },
        { bookId: 43, chapter: 3, verse: 17, start: 4, end: 8 },
        { bookId: 43, chapter: 4, verse: 1, start: 0, end: 5 },
        { bookId: 43, chapter: 3, verse: 18, start: 5, end: 5 },
      ],
      '#ffd84a',
    )
    expect(brief(db)).toEqual([
      [16, 0, 10, '#ffd84a'],
      [17, 4, 8, '#ffd84a'],
    ])
  })

  it('removes only the selected part of a highlight', () => {
    const db = open(newPath())
    db.addHighlights([{ bookId: 43, chapter: 3, verse: 16, start: 0, end: 20 }], 'gold')
    db.removeHighlights([{ bookId: 43, chapter: 3, verse: 16, start: 5, end: 10 }])
    expect(brief(db)).toEqual([
      [16, 0, 5, 'gold'],
      [16, 10, 20, 'gold'],
    ])
  })

  it('removes a highlight completely when the selection covers it', () => {
    const db = open(newPath())
    db.addHighlights([{ bookId: 43, chapter: 3, verse: 16, start: 3, end: 8 }], 'gold')
    db.removeHighlights([{ bookId: 43, chapter: 3, verse: 16, start: 0, end: 30 }])
    expect(brief(db)).toEqual([])
  })
})

describe('UserDb recent inputs', () => {
  it('lists newest first, removes duplicates, and keeps 20', () => {
    const db = open(newPath())
    for (let i = 1; i <= 22; i++) db.addRecent(`jn 3:${i}`)
    db.addRecent('  jn 3:5  ')
    db.addRecent('   ')
    const list = db.listRecent()
    expect(list).toHaveLength(20)
    expect(list[0]).toBe('jn 3:5')
    expect(list[1]).toBe('jn 3:22')
    expect(list.filter(x => x === 'jn 3:5')).toHaveLength(1)
    expect(list).not.toContain('jn 3:1')
  })
})

describe('UserDb display monitor', () => {
  it('starts as automatic and remembers a choice across reopening', () => {
    const path = newPath()
    const db = open(path)
    expect(db.getDisplayMonitorId()).toBeNull()
    db.setDisplayMonitorId(42)
    db.close()
    opened.pop()
    const again = open(path)
    expect(again.getDisplayMonitorId()).toBe(42)
    again.setDisplayMonitorId(null)
    expect(again.getDisplayMonitorId()).toBeNull()
  })
})

describe('UserDb right panel', () => {
  it('starts expanded and remembers collapsing across reopening', () => {
    const path = newPath()
    const db = open(path)
    expect(db.getPanelCollapsed()).toBe(false)
    db.setPanelCollapsed(true)
    db.close()
    opened.pop()
    const again = open(path)
    expect(again.getPanelCollapsed()).toBe(true)
    again.setPanelCollapsed(false)
    expect(again.getPanelCollapsed()).toBe(false)
  })
})
