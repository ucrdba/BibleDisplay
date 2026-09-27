import type { ScrollCommand } from '../../../shared/types'

export type KeyAction =
  | { type: 'scroll'; cmd: ScrollCommand }
  | { type: 'scale'; dir: 1 | -1 }
  | { type: 'toggleBlank' }
  | { type: 'clear' }
  | { type: 'help' }

export interface KeyInfo {
  key: string
  ctrlKey: boolean
  inputFocused: boolean
}

const scroll = (kind: 'lineUp' | 'lineDown' | 'pageUp' | 'pageDown' | 'home' | 'end'): KeyAction => ({
  type: 'scroll',
  cmd: { kind },
})

export function keyToAction(k: KeyInfo): KeyAction | null {
  if (k.ctrlKey) {
    if (k.key === '=' || k.key === '+') return { type: 'scale', dir: 1 }
    if (k.key === '-' || k.key === '_') return { type: 'scale', dir: -1 }
    return null
  }
  if (k.key === 'PageUp') return scroll('pageUp')
  if (k.key === 'PageDown') return scroll('pageDown')
  if (k.key === 'Escape') return { type: 'clear' }
  if (k.key === 'F1') return { type: 'help' }
  if (k.inputFocused) return null
  switch (k.key) {
    case 'Home':
      return scroll('home')
    case 'End':
      return scroll('end')
    case 'ArrowUp':
      return scroll('lineUp')
    case 'ArrowDown':
      return scroll('lineDown')
    case 'b':
    case 'B':
      return { type: 'toggleBlank' }
    default:
      return null
  }
}
