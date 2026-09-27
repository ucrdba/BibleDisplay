import type { DisplayGroup } from './types'

export function toVerseList(groups: { label: string }[]): string {
  if (groups.length === 0) return ''
  return groups.map(g => `${g.label}\r\n`).join('')
}

export function toVerseText(groups: DisplayGroup[]): string {
  if (groups.length === 0) return ''
  return groups
    .map(g => {
      const lines = g.verses.map((v, i) => {
        const showChapter = i > 0 && v.chapter !== g.verses[i - 1].chapter
        const prefix = showChapter ? `${v.chapter}:${v.verse}` : `${v.verse}`
        return `${prefix} ${v.text}`
      })
      return [`${g.label}`, ...lines].map(l => `${l}\r\n`).join('')
    })
    .join('\r\n')
}
