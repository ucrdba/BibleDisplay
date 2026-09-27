import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { fontOptions } from '../../src/renderer/src/control/FontSelect'
import { StylePanel } from '../../src/renderer/src/control/StylePanel'
import { DEFAULT_STYLES } from '../../src/shared/styles'

const noop = () => {}
const render = (hasSelection: boolean, fonts = ['Arial', 'Georgia']) =>
  renderToStaticMarkup(
    <StylePanel
      styles={DEFAULT_STYLES}
      fonts={fonts}
      onChange={noop}
      blank={false}
      onToggleBlank={noop}
      hasSelection={hasSelection}
      onHighlight={noop}
      onRemoveHighlight={noop}
    />,
  )

describe('fontOptions', () => {
  it('marks a saved font that is not installed', () => {
    expect(fontOptions(['Arial'], 'Georgia')).toEqual([
      { value: 'Georgia', label: 'Georgia (missing)' },
      { value: 'Arial', label: 'Arial' },
    ])
  })

  it('does not mark fonts as missing before the list has loaded', () => {
    expect(fontOptions([], 'Georgia')).toEqual([{ value: 'Georgia', label: 'Georgia' }])
  })

  it('lists installed fonts as they are', () => {
    expect(fontOptions(['Arial', 'Georgia'], 'Georgia')).toEqual([
      { value: 'Arial', label: 'Arial' },
      { value: 'Georgia', label: 'Georgia' },
    ])
  })
})

describe('StylePanel', () => {
  it('shows every style section and the current scale', () => {
    const out = render(false)
    for (const text of ['Reference heading', 'Verse text', 'Jesus&#x27; words', 'Verse numbers', 'Background', 'A−', 'A+', '100%', 'Blank']) {
      expect(out).toContain(text)
    }
  })

  it('disables highlight tools until words are selected', () => {
    expect(render(false)).toContain('Select words in the preview first.')
    expect(render(false)).toMatch(/<button[^>]*disabled=""[^>]*>Remove highlight/)
    expect(render(true)).toContain('Pick a color for the selected words.')
    expect(render(true)).not.toMatch(/<button[^>]*disabled=""[^>]*>Remove highlight/)
  })

  it('shows a missing saved font', () => {
    expect(render(false, ['Arial'])).toContain('Georgia (missing)')
  })
})
