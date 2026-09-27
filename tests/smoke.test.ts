import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'

describe('toolchain', () => {
  it("runs under Electron's Node", () => {
    expect(process.versions.electron).toBeTruthy()
  })

  it('loads better-sqlite3', () => {
    const db = new Database(':memory:')
    expect(db.prepare('SELECT 1 AS x').get()).toEqual({ x: 1 })
    db.close()
  })
})
