import { describe, expect, it } from 'vitest'
import { EMPTY_SELECTION, clickSelection, contextSelection, joinSelected, removeIndices } from '../../src/shared/listSelection'

const plain = { ctrl: false, shift: false }
const ctrl = { ctrl: true, shift: false }
const shift = { ctrl: false, shift: true }
const both = { ctrl: true, shift: true }

describe('clickSelection', () => {
  it('plain click selects one row and sets the anchor', () => {
    expect(clickSelection({ selected: [0, 3], anchor: 0 }, 2, plain)).toEqual({ selected: [2], anchor: 2 })
  })

  it('ctrl+click toggles a row and moves the anchor', () => {
    const a = clickSelection({ selected: [1], anchor: 1 }, 4, ctrl)
    expect(a).toEqual({ selected: [1, 4], anchor: 4 })
    expect(clickSelection(a, 1, ctrl)).toEqual({ selected: [4], anchor: 1 })
  })

  it('shift+click selects the range from the anchor, in either direction, keeping the anchor', () => {
    expect(clickSelection({ selected: [2], anchor: 2 }, 5, shift)).toEqual({ selected: [2, 3, 4, 5], anchor: 2 })
    expect(clickSelection({ selected: [5], anchor: 5 }, 3, shift)).toEqual({ selected: [3, 4, 5], anchor: 5 })
  })

  it('shift+click replaces other selected rows; ctrl+shift adds the range', () => {
    expect(clickSelection({ selected: [0, 7], anchor: 7 }, 5, shift)).toEqual({ selected: [5, 6, 7], anchor: 7 })
    expect(clickSelection({ selected: [0, 7], anchor: 7 }, 5, both)).toEqual({ selected: [0, 5, 6, 7], anchor: 7 })
  })

  it('shift+click with no anchor acts like a plain click', () => {
    expect(clickSelection(EMPTY_SELECTION, 3, shift)).toEqual({ selected: [3], anchor: 3 })
  })
})

describe('contextSelection', () => {
  it('keeps the selection when right-clicking a selected row', () => {
    const sel = { selected: [1, 2], anchor: 1 }
    expect(contextSelection(sel, 2)).toBe(sel)
  })

  it('selects just the row when right-clicking an unselected row', () => {
    expect(contextSelection({ selected: [1, 2], anchor: 1 }, 4)).toEqual({ selected: [4], anchor: 4 })
  })
})

describe('joinSelected / removeIndices', () => {
  const items = ['jn 3:16', 'ps 23', 'rom 8:28', 'mk 3:3']

  it('joins selected rows in list order', () => {
    expect(joinSelected(items, [2, 0])).toBe('jn 3:16, rom 8:28')
    expect(joinSelected(items, [])).toBe('')
  })

  it('removes the given rows', () => {
    expect(removeIndices(items, [0, 2])).toEqual(['ps 23', 'mk 3:3'])
    expect(removeIndices(items, [])).toEqual(items)
  })
})
