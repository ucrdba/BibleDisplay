import { describe, expect, it } from 'vitest'
import { previewScale } from '../../src/renderer/src/control/PreviewPanel'

describe('previewScale', () => {
  it('fits the display inside the panel, keeping its shape', () => {
    expect(previewScale({ width: 960, height: 540 }, { width: 1920, height: 1080 })).toBe(0.5)
    expect(previewScale({ width: 960, height: 270 }, { width: 1920, height: 1080 })).toBe(0.25)
  })

  it('returns 0 for empty sizes', () => {
    expect(previewScale({ width: 0, height: 500 }, { width: 1920, height: 1080 })).toBe(0)
    expect(previewScale({ width: 500, height: 500 }, { width: 0, height: 0 })).toBe(0)
  })
})
