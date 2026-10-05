import { describe, expect, it } from 'vitest'
import { alignStrongs, normalizeWord, ourWords } from '../../data/lib/strongs/align'
import type { Token } from '../../data/lib/strongs/usfm'

const AE = '\u00e6'
const RSQUO = '\u2019'
const t = (word: string, strongs: string | null = null): Token => ({ word, strongs })
const placed = (text: string, tokens: Token[]) =>
  alignStrongs(text, tokens).spans.map(s => `${text.slice(s.start, s.end)}=${s.strongs}`)

describe('normalizeWord', () => {
  it('ignores case, punctuation, hyphens and the ae ligature', () => {
    expect(normalizeWord('Beth-el')).toBe('bethel')
    expect(normalizeWord(`C${AE}sar`)).toBe('caesar')
    expect(normalizeWord(`LORD${RSQUO}S`)).toBe(normalizeWord("LORD's"))
  })
})

describe('ourWords', () => {
  it('gives each word with its offsets', () => {
    expect(ourWords('In the beginning, God.')).toEqual([
      { word: 'In', start: 0, end: 2 },
      { word: 'the', start: 3, end: 6 },
      { word: 'beginning', start: 7, end: 16 },
      { word: 'God', start: 18, end: 21 },
    ])
  })
})

describe('alignStrongs', () => {
  it('places tags on identical text', () => {
    const text = 'In the beginning God created the heaven.'
    const tokens = [t('In'), t('the'), t('beginning', 'H7225'), t('God', 'H430'), t('created', 'H1254'), t('the'), t('heaven', 'H8064')]
    expect(placed(text, tokens)).toEqual(['beginning=H7225', 'God=H430', 'created=H1254', 'heaven=H8064'])
  })

  it('places tags across edition spellings', () => {
    const text = `unto Bethel, and Caesar; the LORD${RSQUO}S house`
    const tokens = [t('unto'), t('Beth-el', 'H1008'), t('and'), t(`C${AE}sar`, 'G2541'), t('the'), t("LORD's", 'H3068'), t('house', 'H1004')]
    expect(placed(text, tokens)).toEqual(['Bethel=H1008', 'Caesar=G2541', `LORD${RSQUO}S=H3068`, 'house=H1004'])
  })

  it('pairs a one-for-one different word', () => {
    expect(placed('east of Eden Cherubim, and', [t('east'), t('of'), t('Eden', 'H5731'), t('Cherubims', 'H3742'), t('and')])).toEqual([
      'Eden=H5731',
      'Cherubim=H3742',
    ])
  })

  it('leaves split words unplaced', () => {
    const result = alignStrongs('I cannot go', [t('I'), t('can', 'H3201'), t('not', 'H3808'), t('go', 'H1980')])
    expect(result.spans.map(s => s.strongs)).toEqual(['H1980'])
    expect(result.unplaced).toEqual(['can', 'not'])
  })

  it('handles a verse with no tokens', () => {
    expect(alignStrongs('Selah.', [])).toEqual({ spans: [], unplaced: [] })
  })
})
