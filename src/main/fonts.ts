const FALLBACK_FONTS = ['Arial', 'Calibri', 'Cambria', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana']

export function cleanFontNames(raw: string[]): string[] {
  const names = raw.map(n => n.trim().replace(/^"(.*)"$/, '$1').trim()).filter(n => n.length > 0)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b))
}

export async function listFonts(): Promise<string[]> {
  try {
    const mod = (await import('font-list')) as {
      getFonts?: (o?: object) => Promise<string[]>
      default?: { getFonts: (o?: object) => Promise<string[]> }
    }
    const getFonts = mod.getFonts ?? mod.default?.getFonts
    if (!getFonts) return FALLBACK_FONTS
    const fonts = cleanFontNames(await getFonts({ disableQuoting: true }))
    return fonts.length > 0 ? fonts : FALLBACK_FONTS
  } catch {
    return FALLBACK_FONTS
  }
}
