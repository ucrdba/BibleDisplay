type HighlightRegistryLike = { set(name: string, h: unknown): void; delete(name: string): void }

const registry = (): HighlightRegistryLike | null =>
  typeof CSS !== 'undefined' && 'highlights' in CSS ? (CSS as unknown as { highlights: HighlightRegistryLike }).highlights : null

/** Paints (or clears) a named CSS Custom Highlight; silently does nothing where the API is missing. */
export function setHighlight(name: string, range: Range | null): void {
  const reg = registry()
  if (!reg || typeof Highlight === 'undefined') return
  if (range) reg.set(name, new Highlight(range))
  else reg.delete(name)
}
