import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ImportedList } from '../../src/renderer/src/control/ImportedList'

const noop = () => {}
const render = (props: Partial<Parameters<typeof ImportedList>[0]> = {}) =>
  renderToStaticMarkup(
    <ImportedList
      items={[]}
      problems={[]}
      selected={[]}
      error={null}
      onClick={noop}
      onContext={noop}
      onDelete={noop}
      onImport={noop}
      onClear={noop}
      {...props}
    />,
  )

describe('ImportedList', () => {
  it('shows the import button and an empty message', () => {
    const out = render()
    expect(out).toContain('Imported')
    expect(out).toContain('Import list…')
    expect(out).toContain('No list imported')
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*>Clear list/)
  })

  it('lists lines in order and marks the active one', () => {
    const out = render({ items: ['jn 3:16', 'ps 23'], problems: [null, null], selected: [1] })
    expect(out.indexOf('jn 3:16')).toBeLessThan(out.indexOf('ps 23'))
    expect(out).toMatch(/class="link-btn is-active"[^>]*>ps 23/)
    expect(out).not.toMatch(/class="link-btn is-active"[^>]*>jn 3:16/)
    expect(out).not.toMatch(/<button[^>]*disabled=""[^>]*>Clear list/)
  })

  it('flags lines with problems and gives the reason', () => {
    const out = render({ items: ['xyz 2:1'], problems: ['Unknown book "xyz"'] })
    expect(out).toContain('class="warn"')
    expect(out).toContain('title="Unknown book &quot;xyz&quot;"')
  })

  it('shows an import error', () => {
    expect(render({ error: 'Could not read the file' })).toContain('Could not read the file')
  })
})
