import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MonitorSelect } from '../../src/renderer/src/control/MonitorSelect'

const monitors = [
  { id: 1, label: 'Monitor 1 — 1920×1080 (this screen)', primary: true },
  { id: 7, label: 'Monitor 2 — 1920×1080', primary: false },
]

describe('MonitorSelect', () => {
  it('lists Automatic and every monitor, selecting the saved choice', () => {
    const out = renderToStaticMarkup(<MonitorSelect monitors={monitors} chosenId={7} onChange={() => {}} />)
    expect(out).toContain('Display on')
    expect(out).toContain('Automatic')
    expect(out).toContain('Monitor 1 — 1920×1080 (this screen)')
    expect(out).toMatch(/<option value="7" selected="">Monitor 2/)
  })

  it('selects Automatic when there is no saved choice', () => {
    const out = renderToStaticMarkup(<MonitorSelect monitors={monitors} chosenId={null} onChange={() => {}} />)
    expect(out).toMatch(/<option value="auto" selected="">Automatic/)
  })
})
