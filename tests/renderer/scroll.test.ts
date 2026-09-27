import { describe, expect, it } from 'vitest'
import { lineHeightPx, scrollTarget } from '../../src/renderer/src/display/scroll'
import { DEFAULT_STYLES } from '../../src/shared/styles'

const m = { top: 500, clientHeight: 1000, scrollHeight: 3000, lineHeight: 50 }

describe('scrollTarget', () => {
  it('moves by two lines, a page, or to the ends', () => {
    expect(scrollTarget({ kind: 'lineDown' }, m)).toBe(600)
    expect(scrollTarget({ kind: 'lineUp' }, m)).toBe(400)
    expect(scrollTarget({ kind: 'pageDown' }, m)).toBe(1400)
    expect(scrollTarget({ kind: 'pageUp' }, m)).toBe(0)
    expect(scrollTarget({ kind: 'home' }, m)).toBe(0)
    expect(scrollTarget({ kind: 'end' }, m)).toBe(2000)
    expect(scrollTarget({ kind: 'by', px: 120 }, m)).toBe(620)
  })

  it('stays within bounds', () => {
    expect(scrollTarget({ kind: 'by', px: 99999 }, m)).toBe(2000)
    expect(scrollTarget({ kind: 'end' }, { ...m, scrollHeight: 800 })).toBe(0)
  })
})

describe('lineHeightPx', () => {
  it('is 1.4 × verse size × scale', () => {
    expect(lineHeightPx({ ...DEFAULT_STYLES, scale: 2 })).toBeCloseTo(DEFAULT_STYLES.verse.size * 2 * 1.4)
  })
})
