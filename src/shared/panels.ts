export const PANEL_NAMES = ['settings', 'browse'] as const
export type PanelName = (typeof PANEL_NAMES)[number]

export const isPanelName = (x: unknown): x is PanelName => (PANEL_NAMES as readonly unknown[]).includes(x)
