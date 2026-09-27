import { describe, expect, it } from 'vitest'
import { keyToAction } from '../../src/renderer/src/control/keys'

const k = (key: string, inputFocused = false, ctrlKey = false) => keyToAction({ key, ctrlKey, inputFocused })

describe('keyToAction', () => {
  it('scrolls a page with PgUp/PgDn even while typing', () => {
    expect(k('PageDown', true)).toEqual({ type: 'scroll', cmd: { kind: 'pageDown' } })
    expect(k('PageUp', true)).toEqual({ type: 'scroll', cmd: { kind: 'pageUp' } })
  })

  it('uses arrows, Home, End, and B only when not typing', () => {
    expect(k('ArrowDown')).toEqual({ type: 'scroll', cmd: { kind: 'lineDown' } })
    expect(k('ArrowUp')).toEqual({ type: 'scroll', cmd: { kind: 'lineUp' } })
    expect(k('Home')).toEqual({ type: 'scroll', cmd: { kind: 'home' } })
    expect(k('End')).toEqual({ type: 'scroll', cmd: { kind: 'end' } })
    expect(k('b')).toEqual({ type: 'toggleBlank' })
    expect(k('B')).toEqual({ type: 'toggleBlank' })
    expect(k('ArrowDown', true)).toBeNull()
    expect(k('b', true)).toBeNull()
  })

  it('scales with Ctrl + and Ctrl -', () => {
    expect(k('=', true, true)).toEqual({ type: 'scale', dir: 1 })
    expect(k('+', false, true)).toEqual({ type: 'scale', dir: 1 })
    expect(k('-', true, true)).toEqual({ type: 'scale', dir: -1 })
  })

  it('clears with Esc, even while typing', () => {
    expect(k('Escape')).toEqual({ type: 'clear' })
    expect(k('Escape', true)).toEqual({ type: 'clear' })
    expect(k('Escape', false, true)).toBeNull()
  })

  it('ignores other keys', () => {
    expect(k('x')).toBeNull()
    expect(k('b', false, true)).toBeNull()
  })
})
