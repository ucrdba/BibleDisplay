import type { BibleIndex } from '../../src/shared/types'

// Real KJV verse counts for the chapters used in tests. Key: "bookId.chapter".
const COUNTS: Record<string, number> = {
  '1.1': 31, // Genesis 1
  '19.23': 6, // Psalms 23
  '19.24': 10,
  '19.25': 22,
  '41.3': 35, // Mark 3
  '42.1': 80, // Luke 1
  '43.1': 51, // John 1
  '43.2': 25,
  '43.3': 36,
  '43.4': 54,
  '62.3': 24, // 1 John 3
  '65.1': 25, // Jude 1
}

export const fakeIndex: BibleIndex = {
  verseCount: (bookId, chapter) => COUNTS[`${bookId}.${chapter}`] ?? 0,
}
