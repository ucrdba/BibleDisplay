import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLES, clampScale, fontStack, normalizeStyles, stepScale } from '../../src/shared/styles'

describe('normalizeStyles', () => {
  it('returns defaults for missing or invalid input', () => {
    expect(normalizeStyles(undefined)).toEqual(DEFAULT_STYLES)
    expect(normalizeStyles('nonsense')).toEqual(DEFAULT_STYLES)
  })

  it('keeps valid fields and fills the rest from defaults', () => {
    const s = normalizeStyles({ verse: { size: 50 }, jesusColor: '#f00', layout: 'lines' })
    expect(s.verse).toEqual({ ...DEFAULT_STYLES.verse, size: 50 })
    expect(s.jesusColor).toBe('#f00')
    expect(s.layout).toBe('lines')
    expect(s.heading).toEqual(DEFAULT_STYLES.heading)
  })

  it('ignores values of the wrong type', () => {
    const s = normalizeStyles({ heading: { bold: 'yes', size: 'big' }, layout: 'grid', background: 7 })
    expect(s.heading.bold).toBe(DEFAULT_STYLES.heading.bold)
    expect(s.heading.size).toBe(DEFAULT_STYLES.heading.size)
    expect(s.layout).toBe('paragraph')
    expect(s.background).toBe(DEFAULT_STYLES.background)
  })

  it('clamps the scale', () => {
    expect(normalizeStyles({ scale: 10 }).scale).toBe(3)
  })
})

describe('scale helpers', () => {
  it('steps by 0.1 and stays in range', () => {
    expect(stepScale(1, 1)).toBe(1.1)
    expect(stepScale(1.1, -1)).toBe(1)
    expect(stepScale(3, 1)).toBe(3)
    expect(stepScale(0.5, -1)).toBe(0.5)
    expect(clampScale(0.123)).toBe(0.5)
  })
})

describe('fontStack', () => {
  it('quotes the font and falls back to Georgia', () => {
    expect(fontStack('Segoe UI')).toBe('"Segoe UI", Georgia, serif')
  })
})
