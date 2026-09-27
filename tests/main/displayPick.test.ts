import { describe, expect, it } from 'vitest'
import { pickDisplay } from '../../src/main/displayPick'

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
