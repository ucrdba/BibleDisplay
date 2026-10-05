import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildStrongs, type StrongsBook } from './lib/strongs/buildStrongs'
import { parseGreekDictionary, parseHebrewDictionary } from './lib/strongs/dictionary'
import { parseUsfmBook, usfmBookId } from './lib/strongs/usfm'

const SOURCE = join(process.cwd(), 'data', 'source')
const USFM_DIR = join(SOURCE, 'eng-kjv2006_usfm')
const HEBREW = join(SOURCE, 'StrongHebrewG.xml')
const GREEK = join(SOURCE, 'strongsgreek.xml')
const DB = join(process.cwd(), 'resources', 'bible.db')

for (const path of [USFM_DIR, HEBREW, GREEK, DB]) {
  if (!existsSync(path)) {
    console.error(`Not found: ${path}`)
    process.exit(1)
  }
}

const books: StrongsBook[] = []
for (const file of readdirSync(USFM_DIR).filter(f => f.endsWith('.usfm'))) {
  const book = usfmBookId(file)
  if (book !== null) books.push({ book, verses: parseUsfmBook(readFileSync(join(USFM_DIR, file), 'utf8')) })
}
if (books.length !== 66) {
  console.error(`Expected 66 books in ${USFM_DIR}, found ${books.length}`)
  process.exit(1)
}

const entries = [...parseHebrewDictionary(readFileSync(HEBREW, 'utf8')), ...parseGreekDictionary(readFileSync(GREEK, 'utf8'))]

try {
  const r = buildStrongs(DB, books, entries)
  console.log(`Tagged words: ${r.tagged}; placed on our text: ${r.placed} (${((100 * r.placed) / r.tagged).toFixed(2)}%)`)
  console.log(`Most common unplaced: ${r.topUnplaced.map(([w, n]) => `${w} (${n})`).join(', ') || 'none'}`)
  console.log(`Dictionary entries: ${r.hebrew} Hebrew, ${r.greek} Greek`)
  if (r.missingEntries.length > 0) console.warn(`Used but missing from the dictionaries: ${r.missingEntries.join(', ')}`)
  console.log(`Wrote Strong's data to ${DB}`)
} catch (e) {
  console.error((e as Error).message)
  process.exit(1)
}
