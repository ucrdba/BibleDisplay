import { describe, expect, it } from 'vitest'
import { cleanFontNames } from '../../src/main/fonts'

describe('cleanFontNames', () => {
  it('strips quotes, removes duplicates and blanks, and sorts', () => {
    expect(cleanFontNames(['"Segoe UI"', 'Arial', ' Georgia ', '', 'Arial'])).toEqual(['Arial', 'Georgia', 'Segoe UI'])
  })
})
