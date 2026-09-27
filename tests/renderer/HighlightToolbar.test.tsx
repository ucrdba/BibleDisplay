import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HIGHLIGHT_COLORS } from '../../src/renderer/src/control/ColorField'
import { HighlightToolbar } from '../../src/renderer/src/control/HighlightToolbar'

const noop = () => {}

describe('HighlightToolbar', () => {
  it('renders one swatch per highlight color', () => {
    const out = renderToStaticMarkup(<HighlightToolbar x={10} y={20} onHighlight={noop} onRemove={noop} onClose={noop} />)
    for (const color of HIGHLIGHT_COLORS) {
      expect(out).toContain(`aria-label="Highlight ${color}"`)
    }
  })

  it('offers white and black first, for dark and light backgrounds', () => {
    expect(HIGHLIGHT_COLORS.slice(0, 2)).toEqual(['#ffffff', '#000000'])
    const out = renderToStaticMarkup(<HighlightToolbar x={10} y={20} onHighlight={noop} onRemove={noop} onClose={noop} />)
    expect(out).toContain('aria-label="Highlight #ffffff"')
    expect(out).toContain('aria-label="Highlight #000000"')
  })

  it('renders a Remove highlight button and a Close button', () => {
    const out = renderToStaticMarkup(<HighlightToolbar x={10} y={20} onHighlight={noop} onRemove={noop} onClose={noop} />)
    expect(out).toContain('Remove highlight')
    expect(out).toContain('aria-label="Close"')
  })

  it('positions itself from the x/y props', () => {
    const out = renderToStaticMarkup(<HighlightToolbar x={42} y={99} onHighlight={noop} onRemove={noop} onClose={noop} />)
    expect(out).toContain('left:42px')
    expect(out).toContain('top:99px')
  })
})
