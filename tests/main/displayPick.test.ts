import { describe, expect, it } from 'vitest'
import { describeMonitors, pickDisplay } from '../../src/main/displayPick'

const d = (id: number, x: number) => ({ id, bounds: { x, y: 0, width: 1920, height: 1080 } })

describe('pickDisplay', () => {
  it('picks the first non-primary display', () => {
    expect(pickDisplay([d(1, 0), d(2, 1920), d(3, 3840)], 1)?.id).toBe(2)
    expect(pickDisplay([d(2, 1920), d(1, 0)], 1)?.id).toBe(2)
  })

  it('returns null with only one display', () => {
    expect(pickDisplay([d(1, 0)], 1)).toBeNull()
  })
})

describe('pickDisplay with a preferred monitor', () => {
  const all = [d(1, 0), d(2, 1920), d(3, 3840)]

  it('uses the preferred monitor when it is connected', () => {
    expect(pickDisplay(all, 1, 3)?.id).toBe(3)
    expect(pickDisplay(all, 1, 1)?.id).toBe(1)
  })

  it('falls back to automatic when the preferred monitor is missing or not set', () => {
    expect(pickDisplay(all, 1, 99)?.id).toBe(2)
    expect(pickDisplay(all, 1, null)?.id).toBe(2)
  })
})

describe('describeMonitors', () => {
  it('numbers monitors left to right and marks the main one', () => {
    expect(describeMonitors([d(3, 3840), d(1, 0), d(2, -1920)], 1)).toEqual([
      { id: 2, label: 'Monitor 1 — 1920×1080', primary: false },
      { id: 1, label: 'Monitor 2 — 1920×1080 (this screen)', primary: true },
      { id: 3, label: 'Monitor 3 — 1920×1080', primary: false },
    ])
  })
})
