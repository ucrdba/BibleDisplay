export interface DisplayLike {
  id: number
  bounds: { x: number; y: number; width: number; height: number }
}

export function pickDisplay<T extends DisplayLike>(displays: T[], primaryId: number): T | null {
  return displays.find(d => d.id !== primaryId) ?? null
}
