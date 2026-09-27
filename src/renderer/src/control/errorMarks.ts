import type { RefError } from '../../../shared/types'

export interface MarkPiece {
  text: string
  error?: string
}

export function markErrors(input: string, errors: RefError[]): MarkPiece[] {
  const out: MarkPiece[] = []
  let pos = 0
  for (const e of [...errors].sort((a, b) => a.inputStart - b.inputStart)) {
    if (e.inputStart < pos) continue
    if (e.inputStart > pos) out.push({ text: input.slice(pos, e.inputStart) })
    out.push({ text: input.slice(e.inputStart, e.inputEnd), error: e.message })
    pos = e.inputEnd
  }
  if (pos < input.length) out.push({ text: input.slice(pos) })
  return out
}
