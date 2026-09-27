export interface ListSelection {
  selected: number[]
  anchor: number | null
}

export const EMPTY_SELECTION: ListSelection = { selected: [], anchor: null }

const sorted = (xs: Iterable<number>) => [...new Set(xs)].sort((a, b) => a - b)

export function clickSelection(sel: ListSelection, index: number, mods: { ctrl: boolean; shift: boolean }): ListSelection {
  if (mods.shift && sel.anchor !== null) {
    const lo = Math.min(sel.anchor, index)
    const hi = Math.max(sel.anchor, index)
    const range = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
    return { selected: sorted(mods.ctrl ? [...sel.selected, ...range] : range), anchor: sel.anchor }
  }
  if (mods.ctrl) {
    const has = sel.selected.includes(index)
    return { selected: has ? sel.selected.filter(i => i !== index) : sorted([...sel.selected, index]), anchor: index }
  }
  return { selected: [index], anchor: index }
}

export function contextSelection(sel: ListSelection, index: number): ListSelection {
  return sel.selected.includes(index) ? sel : { selected: [index], anchor: index }
}

export function joinSelected(items: string[], selected: number[]): string {
  return sorted(selected)
    .map(i => items[i])
    .filter((s): s is string => s !== undefined)
    .join(', ')
}

export function removeIndices(items: string[], selected: number[]): string[] {
  const drop = new Set(selected)
  return items.filter((_, i) => !drop.has(i))
}
