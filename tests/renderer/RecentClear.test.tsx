// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RecentList } from '../../src/renderer/src/control/RecentList'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const noop = () => {}
let root: Root | null = null
let host: HTMLDivElement

function render(items: string[], onClear = noop) {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  act(() =>
    root!.render(<RecentList items={items} selected={[]} onClick={noop} onContext={noop} onDelete={noop} onClear={onClear} />),
  )
}

const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent === label)

afterEach(() => {
  act(() => root?.unmount())
  root = null
  document.body.replaceChildren()
})

describe('RecentList Clear list', () => {
  it('is disabled when the list is empty', () => {
    render([])
    expect(button('Clear list')?.disabled).toBe(true)
  })

  it('asks before clearing, with the number of entries', () => {
    const onClear = vi.fn()
    render(['jn 3:16', 'ps 23'], onClear)
    act(() => button('Clear list')!.click())
    expect(host.textContent).toContain('Clear all 2 recent entries?')
    expect(onClear).not.toHaveBeenCalled()
  })

  it('Cancel puts the button back without clearing', () => {
    const onClear = vi.fn()
    render(['jn 3:16'], onClear)
    act(() => button('Clear list')!.click())
    act(() => button('Cancel')!.click())
    expect(button('Clear list')).toBeDefined()
    expect(host.textContent).not.toContain('recent entr')
    expect(onClear).not.toHaveBeenCalled()
  })

  it('Clear clears once and puts the button back', () => {
    const onClear = vi.fn()
    render(['jn 3:16'], onClear)
    act(() => button('Clear list')!.click())
    act(() => button('Clear')!.click())
    expect(onClear).toHaveBeenCalledTimes(1)
    expect(button('Clear list')).toBeDefined()
  })

  it('uses the singular for one entry', () => {
    render(['jn 3:16'])
    act(() => button('Clear list')!.click())
    expect(host.textContent).toContain('Clear all 1 recent entry?')
  })
})
