import type { VersePoint } from '../../../shared/strongs'
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

/** The verse and character offset of a point in the verse text (e.g. a click's caret), or null outside verse text. */
export function pointToVerseOffset(root: HTMLElement, node: Node, offset: number): VersePoint | null {
  const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  const el = start?.closest<HTMLElement>('[data-verse-key]')
  if (!el || !root.contains(el)) return null
  const [bookId, chapter, verse] = (el.dataset.verseKey ?? '').split('.').map(Number)
  return { bookId, chapter, verse, offset: offsetWithin(el, node, offset) }
}

/** A DOM range over characters [start, end) of one verse's text, or null if that verse isn't shown. */
export function verseTextRange(root: HTMLElement, verseKey: string, start: number, end: number): Range | null {
  const el = root.querySelector<HTMLElement>(`[data-verse-key="${verseKey}"]`)
  if (!el) return null
  const doc = el.ownerDocument
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = doc.createRange()
  let pos = 0
  let started = false
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = n.textContent?.length ?? 0
    if (!started && start <= pos + len) {
      range.setStart(n, start - pos)
      started = true
    }
    if (started && end <= pos + len) {
      range.setEnd(n, end - pos)
      return range
    }
    pos += len
  }
  return null
}
