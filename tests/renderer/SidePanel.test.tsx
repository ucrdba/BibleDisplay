import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SidePanel } from '../../src/renderer/src/control/SidePanel'

const noop = () => {}
const render = (side: 'left' | 'right', collapsed: boolean, label = 'settings') =>
  renderToStaticMarkup(
    <SidePanel side={side} label={label} className="panel--x" collapsed={collapsed} onToggle={noop}>
      <p>contents here</p>
    </SidePanel>,
  )

describe('SidePanel', () => {
  it('shows its contents and a Hide button when expanded', () => {
    const out = render('right', false)
    expect(out).toContain('contents here')
    expect(out).toContain('title="Hide settings"')
    expect(out).toContain('class="panel panel--x"')
    expect(out).not.toContain('panel--collapsed')
  })

  it('hides its contents and shows a Show button when collapsed', () => {
    const out = render('right', true)
    expect(out).not.toContain('contents here')
    expect(out).toContain('title="Show settings"')
    expect(out).toContain('panel--collapsed')
  })

  it('points the arrows outward for each side', () => {
    expect(render('right', false)).toContain('>\u00bb</button>')
    expect(render('right', true)).toContain('>\u00ab</button>')
    expect(render('left', false, 'Browse')).toContain('>\u00ab</button>')
    expect(render('left', true, 'Browse')).toContain('>\u00bb</button>')
    expect(render('left', false, 'Browse')).toContain('title="Hide Browse"')
  })
})
