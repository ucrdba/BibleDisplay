import type { DisplayGroup, RefGroup } from '../shared/types'
import type { BibleDb } from './bibleDb'
import type { UserDb } from './userDb'

export function loadGroups(
  bible: Pick<BibleDb, 'getVerses'>,
  user: Pick<UserDb, 'highlightsFor'>,
  groups: RefGroup[],
): DisplayGroup[] {
  return groups.map(g => {
    const highlights = user.highlightsFor(g)
    return {
      label: g.label,
      verses: bible.getVerses(g).map(v => ({
        ...v,
        highlights: highlights
          .filter(h => h.chapter === v.chapter && h.verse === v.verse)
          .map(({ id, start, end, color }) => ({ id, start, end, color })),
      })),
    }
  })
}
