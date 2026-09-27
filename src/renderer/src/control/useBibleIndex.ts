import { useEffect, useState } from 'react'
import { createIndex } from '../../../shared/bibleIndex'
import type { BibleIndex } from '../../../shared/types'

export function useBibleIndex(): BibleIndex | null {
  const [index, setIndex] = useState<BibleIndex | null>(null)
  useEffect(() => {
    void window.bible.control.verseCounts().then(counts => setIndex(createIndex(counts)))
  }, [])
  return index
}
