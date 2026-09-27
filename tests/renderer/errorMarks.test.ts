import { describe, expect, it } from 'vitest'
import { markErrors } from '../../src/renderer/src/control/errorMarks'

describe('markErrors', () => {
  it('splits the input into plain and error pieces', () => {
    const input = 'jn 1:3-5, xyz 2:1, mk 3:99'
    expect(
      markErrors(input, [
        { message: 'B', inputStart: 19, inputEnd: 26 },
        { message: 'A', inputStart: 10, inputEnd: 17 },
      ]),
    ).toEqual([
      { text: 'jn 1:3-5, ' },
      { text: 'xyz 2:1', error: 'A' },
      { text: ', ' },
      { text: 'mk 3:99', error: 'B' },
    ])
  })

  it('returns the whole input when there are no errors', () => {
    expect(markErrors('jn 3:16', [])).toEqual([{ text: 'jn 3:16' }])
    expect(markErrors('', [])).toEqual([])
  })
})
