import type { StrongsEntry } from '../../../shared/types'

export type StrongsView =
  | { kind: 'empty' }
  | { kind: 'unavailable' }
  | { kind: 'untagged'; word: string }
  | { kind: 'missing'; id: string }
  | { kind: 'entry'; entry: StrongsEntry; context: string | null }

export interface StrongsState {
  view: StrongsView
  back: StrongsView[]
}

export const INITIAL_STRONGS: StrongsState = { view: { kind: 'empty' }, back: [] }

/** A lookup from the preview starts a fresh history. */
export const showLookup = (view: StrongsView): StrongsState => ({ view, back: [] })

/** Following a cross-reference keeps the current view for Back. */
export function followLink(state: StrongsState, view: StrongsView): StrongsState {
  const cur = state.view
  if (cur.kind === 'entry' && view.kind === 'entry' && cur.entry.id === view.entry.id) return state
  return { view, back: [...state.back, cur] }
}

export function goBack(state: StrongsState): StrongsState {
  if (state.back.length === 0) return state
  return { view: state.back[state.back.length - 1], back: state.back.slice(0, -1) }
}
