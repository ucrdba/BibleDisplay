export const IMPORT_LIMIT = 500

export function parseImportText(text: string): string[] {
  return text
    .replace(/^﻿/, '')
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .slice(0, IMPORT_LIMIT)
}
