import type { BibleIndex, VerseCounts } from './types'

export function createIndex(counts: VerseCounts): BibleIndex {
  return {
    verseCount: (bookId, chapter) => counts[bookId]?.[chapter - 1] ?? 0,
  }
}
