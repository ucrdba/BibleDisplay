import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HelpPanel } from '../../src/renderer/src/control/HelpPanel'

describe('HelpPanel', () => {
  it('covers typing, shortcuts, lists, importing, and highlighting', () => {
    const out = renderToStaticMarkup(<HelpPanel onClose={() => {}} />)
    for (const text of ['Typing verses', 'gen 1.1', 'Keyboard shortcuts', 'Esc', 'F1', 'Ctrl+click', 'Shift+click', 'Import list', 'Highlight', 'Blank']) {
      expect(out).toContain(text)
    }
    expect(out).toContain('aria-label="Close help"')
  })
})
