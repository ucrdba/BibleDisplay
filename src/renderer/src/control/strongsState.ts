import type { DisplayStrongs, StrongsEntry, VerseRange } from '../../../shared/types'

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

/**
 * What the display's Strong's band shows: the current entry when the toggle is on, tinting the
 * looked-up word only while that original entry is shown (no Back history).
 */
export function displayStrongs(state: StrongsState, onDisplay: boolean, mark: VerseRange | null): DisplayStrongs | null {
  if (!onDisplay || state.view.kind !== 'entry') return null
  return { entry: state.view.entry, mark: state.back.length === 0 ? mark : null }
}
