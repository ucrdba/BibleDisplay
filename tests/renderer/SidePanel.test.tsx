import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SidePanel } from '../../src/renderer/src/control/SidePanel'

const noop = () => {}

describe('SidePanel', () => {
  it('shows its contents and a Hide settings button when expanded', () => {
    const out = renderToStaticMarkup(
      <SidePanel collapsed={false} onToggle={noop}>
        <p>settings here</p>
      </SidePanel>,
    )
    expect(out).toContain('settings here')
    expect(out).toContain('title="Hide settings"')
    expect(out).not.toContain('panel--collapsed')
  })

  it('hides its contents and shows a Show settings button when collapsed', () => {
    const out = renderToStaticMarkup(
      <SidePanel collapsed onToggle={noop}>
        <p>settings here</p>
      </SidePanel>,
    )
    expect(out).not.toContain('settings here')
    expect(out).toContain('title="Show settings"')
    expect(out).toContain('panel--collapsed')
  })
})
