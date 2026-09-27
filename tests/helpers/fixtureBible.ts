import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildBibleDb } from '../../data/lib/buildBibleDb'
import type { ParsedVerse } from '../../data/lib/osis'

export const JOHN_3_16 = 'For God so loved the world, that he gave his only begotten Son.'
export const MARK_3_3 = 'And he saith unto the man which had the withered hand, Stand forth.'

export const FIXTURE_VERSES: ParsedVerse[] = [
  { osisBook: 'John', chapter: 3, verse: 16, text: JOHN_3_16, redLetter: [{ start: 0, end: JOHN_3_16.length }] },
  { osisBook: 'John', chapter: 3, verse: 17, text: 'For God sent not his Son into the world to condemn the world.', redLetter: [] },
  { osisBook: 'John', chapter: 3, verse: 18, text: 'He that believeth on him is not condemned.', redLetter: [] },
  { osisBook: 'John', chapter: 4, verse: 1, text: 'When therefore the Lord knew how the Pharisees had heard.', redLetter: [] },
  { osisBook: 'Mark', chapter: 3, verse: 3, text: MARK_3_3, redLetter: [{ start: MARK_3_3.indexOf('Stand'), end: MARK_3_3.length }] },
]

export function makeFixtureBible(): string {
  const path = join(mkdtempSync(join(tmpdir(), 'bible-')), 'bible.db')
  buildBibleDb(FIXTURE_VERSES, path)
  return path
}
