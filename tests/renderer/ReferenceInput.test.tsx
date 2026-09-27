import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ReferenceInput } from '../../src/renderer/src/control/ReferenceInput'
import type { RefError } from '../../src/shared/types'
import { fakeIndex } from '../helpers/fakeIndex'

const render = (value: string, errors: RefError[] = []) =>
  renderToStaticMarkup(<ReferenceInput value={value} onChange={() => {}} onSubmit={() => {}} errors={errors} index={fakeIndex} />)

describe('ReferenceInput', () => {
  it('shows matching books as you type', () => {
    const out = render('l')
    expect(out).toContain('ref-input__menu')
    for (const name of ['Leviticus', 'Lamentations', 'Luke']) expect(out).toContain(name)
    expect(out).toContain('Luk')
  })

  it('shows a verse-count hint after a chapter and colon', () => {
    expect(render('Luke 1:')).toContain('80 verses')
  })

  it('underlines and lists errors', () => {
    const out = render('xyz 2:1', [{ message: 'Unknown book "xyz"', inputStart: 0, inputEnd: 7 }])
    expect(out).toContain('ref-input__error')
    expect(out).toContain('Unknown book')
  })

  it('shows no menu without an index', () => {
    const out = renderToStaticMarkup(<ReferenceInput value="l" onChange={() => {}} onSubmit={() => {}} errors={[]} index={null} />)
    expect(out).not.toContain('ref-input__menu')
  })
})
