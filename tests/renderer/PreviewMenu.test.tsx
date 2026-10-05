// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreviewMenu } from '../../src/renderer/src/control/PreviewMenu'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const noop = () => {}
const props = (canSave: boolean) => ({
  x: 10,
  y: 20,
  menuRef: createRef<HTMLDivElement>(),
  canSave,
  onClose: noop,
  onSaveList: noop,
  onSaveText: noop,
  onPrint: noop,
  onAddRecent: noop,
  onClear: noop,
})

describe('PreviewMenu', () => {
  it('lists Save verse list, Save verse text, Print, then Add to Recent and Clear', () => {
    const out = renderToStaticMarkup(<PreviewMenu {...props(true)} />)
    const at = (s: string) => out.indexOf(s)
    expect(at('Save verse list')).toBeGreaterThan(-1)
    expect(at('Save verse list')).toBeLessThan(at('Save verse text'))
    expect(at('Save verse text')).toBeLessThan(at('Print'))
    expect(at('Print')).toBeLessThan(at('context-menu__sep'))
    expect(at('context-menu__sep')).toBeLessThan(at('>Add to Recent<'))
    expect(at('>Add to Recent<')).toBeLessThan(at('>Clear<'))
    expect(out).not.toContain('disabled')
  })

  it('disables every item when nothing is shown', () => {
    const out = renderToStaticMarkup(<PreviewMenu {...props(false)} />)
    expect(out.match(/disabled=""/g)).toHaveLength(5)
    expect(out).toMatch(/disabled=""[^>]*>Add to Recent</)
    expect(out).toMatch(/disabled=""[^>]*>Clear</)
  })

  describe('clicking Clear', () => {
    let root: Root | null = null
    afterEach(() => {
      act(() => root?.unmount())
      root = null
      document.body.replaceChildren()
    })

    it('closes the menu and clears', () => {
      const calls: string[] = []
      const onClose = vi.fn(() => calls.push('close'))
      const onClear = vi.fn(() => calls.push('clear'))
      const host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      act(() => root!.render(<PreviewMenu {...props(true)} onClose={onClose} onClear={onClear} />))
      const clearButton = [...host.querySelectorAll('button')].find(b => b.textContent === 'Clear')!
      act(() => clearButton.click())
      expect(calls).toEqual(['close', 'clear'])
    })

    it('closes the menu and adds to Recent', () => {
      const calls: string[] = []
      const onClose = vi.fn(() => calls.push('close'))
      const onAddRecent = vi.fn(() => calls.push('recent'))
      const host = document.createElement('div')
      document.body.append(host)
      root = createRoot(host)
      act(() => root!.render(<PreviewMenu {...props(true)} onClose={onClose} onAddRecent={onAddRecent} />))
      const button = [...host.querySelectorAll('button')].find(b => b.textContent === 'Add to Recent')!
      act(() => button.click())
      expect(calls).toEqual(['close', 'recent'])
    })
  })
})
