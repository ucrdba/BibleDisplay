import { describe, expect, it } from 'vitest'
import { parseGreekDictionary, parseHebrewDictionary } from '../../data/lib/strongs/dictionary'

const ELOHIM = '\u05d0\u05b1\u05dc\u05b9\u05d4\u05b4\u05d9\u05dd'
const ELOAH = '\u05d0\u05b1\u05dc\u05d5\u05b9\u05d4\u05b7\u05bc'
const AGAPE = '\u1f00\u03b3\u03ac\u03c0\u03b7'

const HEBREW = `<osis><osisText>
      <div type="entry" n="430">
        <w gloss="93c" lemma="${ELOHIM}" morph="n-m" POS="el-o-heem'" xlit="elohiym" ID="H430" xml:lang="heb">x</w>
        <foreign xml:lang="grc"><w gloss="G:2316" /></foreign>
        <list><item>1) (plural)</item><item>1a) rulers</item></list>
        <note type="exegesis">plural of <w lemma="${ELOAH}" POS="el-o'-ah" src="433" xlit="eloahh"/>;</note>
        <note type="explanation"><hi>gods</hi> in the ordinary sense; &amp; more</note>
        <note type="translation">angels, God (gods).</note>
        <note type="x-typo">ignore me</note>
      </div>
      <div type="entry" n="348">
        <w lemma="x" POS="p" xlit="ayal" ID="H348" xml:lang="heb">x</w>
        <note type="exegesis">from <w src="336" lemma="LEMMA" xlit="i"/><note type="x-typo">lemma missing vowel</note> and <w src="2083" xlit="z"/>;</note>
        <note type="explanation">a ram</note>
      </div>
      <div type="entry" n="1">
        <w lemma="a" POS="awb" xlit="ab" ID="H1" xml:lang="heb">a</w>
        <note type="explanation">father</note>
      </div>
</osisText></osis>`

const GREEK = `<strongsdictionary><entries>
<entry strongs="00026">
 <strongs>26</strongs>   <greek BETA="A)GA/PH" unicode="${AGAPE}" translit="agape"/>   <pronunciation strongs="ag-ah'-pay"/>
 <strongs_derivation>from <strongsref language="GREEK" strongs="25"/>;</strongs_derivation><strongs_def> love, i.e. affection or
 benevolence</strongs_def><kjv_def>:--(feast of) charity(-ably), dear, love.</kjv_def>
<see language="GREEK" strongs="25"/>
</entry>
<entry strongs="00025">
 <strongs>25</strongs> <greek BETA="A)GAPA/W" unicode="x" translit="agapao"/>
 <strongs_derivation>perhaps from <greek BETA="A)/GAN" unicode="y"/>;</strongs_derivation><strongs_def> to love</strongs_def><kjv_def>--Alpha.</kjv_def>
 Compare <strongsref language="GREEK" strongs="05368"/>.<see language="GREEK" strongs="26"/>
</entry>
<entry strongs="04533">
 <strongs>4533</strongs> <greek BETA="SALMW/N" unicode="x" translit="Salmon"/>
 <strongs_derivation>of Hebrew origin (<strongsref language="HEBREW" strongs="08012"/>);</strongs_derivation><strongs_def> Salmon</strongs_def>
</entry>
</entries></strongsdictionary>`

describe('parseHebrewDictionary', () => {
  const entries = parseHebrewDictionary(HEBREW)

  it('reads each entry', () => {
    expect(entries.map(e => e.id)).toEqual(['H430', 'H348', 'H1'])
    expect(entries[0]).toEqual({
      id: 'H430',
      lemma: ELOHIM,
      xlit: 'elohiym',
      pron: "el-o-heem'",
      derivation: `plural of H433 (${ELOAH});`,
      definition: 'gods in the ordinary sense; & more',
      kjvDef: 'angels, God (gods).',
    })
  })

  it('drops nested x-typo notes without losing the rest of the field', () => {
    expect(entries[1].derivation).toBe('from H336 (LEMMA) and H2083;')
    expect(entries[1].definition).toBe('a ram')
  })

  it('leaves missing parts empty', () => {
    expect(entries[2]).toMatchObject({ id: 'H1', derivation: '', definition: 'father', kjvDef: '' })
  })
})

describe('parseGreekDictionary', () => {
  const entries = parseGreekDictionary(GREEK)

  it('reads each entry and its cross-references', () => {
    expect(entries[0]).toEqual({
      id: 'G26',
      lemma: AGAPE,
      xlit: 'agape',
      pron: "ag-ah'-pay",
      derivation: 'from G25;',
      definition: 'love, i.e. affection or benevolence',
      kjvDef: '(feast of) charity(-ably), dear, love.',
    })
  })

  it('appends text after the kjv_def and strips a leading --', () => {
    expect(entries[1].definition).toBe('to love Compare G5368.')
    expect(entries[1].kjvDef).toBe('Alpha.')
    expect(entries[1].definition).not.toContain('see')
  })

  it('writes Hebrew references without leading zeros and tolerates missing parts', () => {
    expect(entries[2]).toMatchObject({ id: 'G4533', pron: '', derivation: 'of Hebrew origin (H8012);', kjvDef: '' })
  })
})
