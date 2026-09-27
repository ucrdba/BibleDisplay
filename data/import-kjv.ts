import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { BOOKS } from '../src/shared/books'
import { buildBibleDb, validateChapterCounts } from './lib/buildBibleDb'
import { parseOsis } from './lib/osis'

const EXPECTED_VERSES = 31102
const SOURCE = join(process.cwd(), 'data', 'source', 'eng-kjv.osis.xml')
const OUT = join(process.cwd(), 'resources', 'bible.db')

if (!existsSync(SOURCE)) {
  console.error(`Source not found: ${SOURCE}`)
  process.exit(1)
}

const canonical = new Set(BOOKS.map(b => b.osis))
const verses = parseOsis(readFileSync(SOURCE, 'utf8')).filter(v => canonical.has(v.osisBook))

const problems = validateChapterCounts(verses)
if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
if (verses.length !== EXPECTED_VERSES) {
  console.error(`Expected ${EXPECTED_VERSES} verses, found ${verses.length}`)
  process.exit(1)
}

rmSync(OUT, { force: true })
mkdirSync(dirname(OUT), { recursive: true })
buildBibleDb(verses, OUT)
const spans = verses.reduce((n, v) => n + v.redLetter.length, 0)
console.log(`Wrote ${verses.length} verses and ${spans} red-letter spans to ${OUT}`)
