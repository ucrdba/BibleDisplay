// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BrowsePanel } from '../../src/renderer/src/control/BrowsePanel'
import type { Passage } from '../../src/shared/pickerSelection'
import { fakeIndex } from '../helpers/fakeIndex'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const john316: Passage = { bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16, whole: false }
const psalm23: Passage = { bookId: 19, startChapter: 23, startVerse: 1, endChapter: 23, endVerse: 6, whole: true }

// Mirrors ControlScreen: the list is set only after an async load, and the jump is bumped after that.
const present = async (next: Passage[], set: (p: Passage[]) => void) => {
  await new Promise(r => setTimeout(r, 0))
  set(next)
}

let actions: { removeFirst(): Promise<void>; clear(): Promise<void> }

function Host() {
  const [groups, setGroups] = useState<Passage[]>([john316, psalm23])
  const [jump, setJump] = useState(1)
  actions = {
    removeFirst: async () => {
      await present(groups.slice(1), setGroups)
      setJump(n => n + 1)
    },
    clear: async () => {
      await present([], setGroups)
      setJump(n => n + 1)
    },
  }
  return <BrowsePanel index={fakeIndex} passages={groups} jumpSignal={jump} onChange={setGroups} />
}

// Run an async action outside act() so React renders between its steps, like in the real app.
async function run(action: () => Promise<void>) {
  const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  env.IS_REACT_ACT_ENVIRONMENT = false
  await action()
  await new Promise(r => setTimeout(r, 20))
  env.IS_REACT_ACT_ENVIRONMENT = true
}

let container: HTMLElement
let root: Root
let scrolled: Element[]

beforeEach(() => {
  scrolled = []
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this)
  }
  container = document.createElement('div')
  document.body.replaceChildren(container)
  root = createRoot(container)
})

afterEach(() => act(() => root.unmount()))

const current = (attr: 'data-book' | 'data-chapter') => container.querySelector(`[${attr}].is-current`)?.getAttribute(attr)

describe('BrowsePanel jump signal', () => {
  it('jumps to the new first passage after Remove, and scrolls the current items into view', async () => {
    await act(async () => root.render(<Host />))
    expect(current('data-book')).toBe('43')
    expect(current('data-chapter')).toBe('3')
    expect(scrolled.some(el => el.getAttribute('data-book') === '43')).toBe(true)
    expect(scrolled.some(el => el.getAttribute('data-chapter') === '3')).toBe(true)

    await run(() => actions.removeFirst())
    expect(current('data-book')).toBe('19')
    expect(current('data-chapter')).toBe('23')
  })

  it('leaves navigation unchanged after Clear', async () => {
    await act(async () => root.render(<Host />))
    await act(async () => container.querySelector<HTMLElement>('[data-book="45"]')!.click())
    expect(current('data-book')).toBe('45')

    await run(() => actions.clear())
    expect(current('data-book')).toBe('45')
  })
})
