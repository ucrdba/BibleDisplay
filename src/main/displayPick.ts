import type { MonitorInfo } from '../shared/types'

export interface DisplayLike {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
}

export function pickDisplay<T extends DisplayLike>(displays: T[], primaryId: number, preferredId: number | null = null): T | null {
  if (preferredId !== null) {
    const preferred = displays.find(d => d.id === preferredId)
    if (preferred) return preferred
  }
  return displays.find(d => d.id !== primaryId) ?? null
}

export function describeMonitors(displays: DisplayLike[], primaryId: number): MonitorInfo[] {
  return [...displays]
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y)
    .map((d, i) => ({
      id: d.id,
      label: `Monitor ${i + 1} — ${d.bounds.width}×${d.bounds.height}${d.id === primaryId ? ' (this screen)' : ''}`,
      primary: d.id === primaryId,
    }))
}
