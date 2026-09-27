import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HelpPanel } from '../../src/renderer/src/control/HelpPanel'

describe('HelpPanel', () => {
  it('covers typing, shortcuts, lists, importing, and highlighting', () => {
    const out = renderToStaticMarkup(<HelpPanel version="0.1.0" onClose={() => {}} />)
    for (const text of ['Typing verses', 'gen 1.1', 'Keyboard shortcuts', 'Esc', 'F1', 'Ctrl+click', 'Shift+click', 'Import list', 'Highlight', 'Blank', 'Save verse list', 'Save verse text']) {
      expect(out).toContain(text)
    }
    expect(out).toContain('aria-label="Close help"')
  })

  it('shows the app version', () => {
    const out = renderToStaticMarkup(<HelpPanel version="1.2.3" onClose={() => {}} />)
    expect(out).toContain('Bible Display — version 1.2.3')
  })
})
