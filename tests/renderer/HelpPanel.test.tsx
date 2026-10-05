import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HelpPanel } from '../../src/renderer/src/control/HelpPanel'

describe('HelpPanel', () => {
  it('covers typing, shortcuts, lists, importing, and highlighting', () => {
    const out = renderToStaticMarkup(<HelpPanel version="0.1.0" onClose={() => {}} />)
    for (const text of ['Typing verses', 'gen 1.1', 'Keyboard shortcuts', 'Esc', 'F1', 'Ctrl+click', 'Shift+click', 'Import list', 'Highlight', 'Blank', 'Save verse list', 'Save verse text', 'Print']) {
      expect(out).toContain(text)
    }
    expect(out).toContain('aria-label="Close help"')
  })

  it('explains the Browse picker', () => {
    const out = renderToStaticMarkup(<HelpPanel version="1.2.3" onClose={() => {}} />)
    for (const text of ['Browse', 'Books', 'Chapters', 'Verses', 'Ctrl+click', 'Shift+click', 'Double-click a chapter']) {
      expect(out).toContain(text)
    }
  })

  it('explains Clear in the preview right-click menu', () => {
    const out = renderToStaticMarkup(<HelpPanel version="1.2.3" onClose={() => {}} />)
    expect(out).toMatch(/Right-click[^<]*<strong>Clear<\/strong>/)
  })

  it('shows the app version', () => {
    const out = renderToStaticMarkup(<HelpPanel version="1.2.3" onClose={() => {}} />)
    expect(out).toContain('Bible Display — version 1.2.3')
  })

  it('explains ".." for the rest of a chapter', () => {
    const out = renderToStaticMarkup(<HelpPanel version="1.2.3" onClose={() => {}} />)
    for (const text of ['Rest of a chapter', 'luke 1.18..', 'Luke 1:18-80', 'jn 3:16, 30..', 'luke 1..']) {
      expect(out).toContain(text)
    }
  })

  it('shows the copyright and license terms', () => {
    const out = renderToStaticMarkup(<HelpPanel version="1.2.3" onClose={() => {}} />)
    expect(out).toContain('© 2026 Landmark Missionary Church of Banning CA')
    expect(out).toContain('may not be sold')
    expect(out).toContain('public domain')
  })

  it('explains search', () => {
    const out = renderToStaticMarkup(<HelpPanel version="1.2.3" onClose={() => {}} />)
    for (const text of ['Search', 'Ctrl', 'All words', 'Exact phrase', 'Any word', 'Regex', '?still waters']) {
      expect(out).toContain(text)
    }
  })
})
