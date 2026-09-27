import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SelectableList } from '../../src/renderer/src/control/SelectableList'

const noop = () => {}
const render = (selected: number[], problems?: (string | null)[]) =>
  renderToStaticMarkup(
    <SelectableList
      items={['jn 3:16', 'ps 23', 'xyz 2:1']}
      selected={selected}
      problems={problems}
      onClick={noop}
      onContext={noop}
      onDelete={noop}
    />,
  )

describe('SelectableList', () => {
  it('renders rows in order and marks selected rows', () => {
    const out = render([0, 2])
    expect(out.indexOf('jn 3:16')).toBeLessThan(out.indexOf('ps 23'))
    expect(out).toMatch(/class="link-btn is-active"[^>]*>jn 3:16/)
    expect(out).toMatch(/class="link-btn"[^>]*>ps 23/)
    expect(out).toMatch(/class="link-btn is-active"[^>]*>xyz 2:1/)
    expect(out).toContain('aria-selected="true"')
  })

  it('shows problem markers when given', () => {
    const out = render([], [null, null, 'Unknown book "xyz"'])
    expect(out).toContain('class="warn"')
    expect(out).toContain('title="Unknown book &quot;xyz&quot;"')
  })

  it('is focusable for the Delete key and does not show a menu until right-clicked', () => {
    const out = render([])
    expect(out).toContain('tabindex="0"')
    expect(out).not.toContain('context-menu')
  })
})
