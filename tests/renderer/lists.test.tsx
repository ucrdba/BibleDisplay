import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RecentList } from '../../src/renderer/src/control/RecentList'
import { SelectedList } from '../../src/renderer/src/control/SelectedList'
import type { RefGroup } from '../../src/shared/types'

const group: RefGroup = { label: 'John 1:3-5', bookId: 43, startChapter: 1, startVerse: 3, endChapter: 1, endVerse: 5, whole: false, inputStart: 0, inputEnd: 8 }

describe('SelectedList', () => {
  it('lists groups with remove buttons', () => {
    const out = renderToStaticMarkup(<SelectedList groups={[group]} onRemove={() => {}} />)
    expect(out).toContain('John 1:3-5')
    expect(out).toContain('Remove John 1:3-5')
  })

  it('says when nothing is on screen', () => {
    expect(renderToStaticMarkup(<SelectedList groups={[]} onRemove={() => {}} />)).toContain('Nothing on screen')
  })
})

describe('RecentList', () => {
  it('lists recent inputs', () => {
    const out = renderToStaticMarkup(
      <RecentList items={['jn 3:16', 'ps 23']} selected={[]} onClick={() => {}} onContext={() => {}} onDelete={() => {}} />,
    )
    expect(out).toContain('jn 3:16')
    expect(out).toContain('ps 23')
  })
})
