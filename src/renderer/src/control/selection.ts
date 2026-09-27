import type { VerseRange } from '../../../shared/types'

function offsetWithin(el: HTMLElement, node: Node, offset: number): number {
  const r = el.ownerDocument.createRange()
  r.setStart(el, 0)
  r.setEnd(node, offset)
  return r.toString().length
}

export function selectionToRanges(root: HTMLElement, range: Range): VerseRange[] {
  const out: VerseRange[] = []
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-verse-key]'))) {
    if (!range.intersectsNode(el)) continue
    const [bookId, chapter, verse] = (el.dataset.verseKey ?? '').split('.').map(Number)
    const length = el.textContent?.length ?? 0
    const start = el.contains(range.startContainer) ? offsetWithin(el, range.startContainer, range.startOffset) : 0
    const end = el.contains(range.endContainer) ? offsetWithin(el, range.endContainer, range.endOffset) : length
    if (end > start) out.push({ bookId, chapter, verse, start, end })
  }
  return out
}
