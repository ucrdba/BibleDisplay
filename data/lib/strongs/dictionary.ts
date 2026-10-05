import { decodeEntities } from '../osis'

export interface DictEntry {
  id: string
  lemma: string
  xlit: string
  pron: string
  derivation: string
  definition: string
  kjvDef: string
}

const ATTR_RE = /([\w:]+)="([^"]*)"/g

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of tag.matchAll(ATTR_RE)) out[m[1]] = decodeEntities(m[2])
  return out
}

const clean = (s: string) =>
  decodeEntities(s.replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim()

// ---- Hebrew (OSIS: StrongHebrewG.xml) ----

const HEB_NOTE_RE = /<note type="(exegesis|explanation|translation)">([\s\S]*?)<\/note>/g

const hebText = (s: string) =>
  clean(
    s.replace(/<w\b([^>]*)\/>/g, (_m, a: string) => {
      const at = attrs(a)
      if (!at.src) return at.lemma ?? ''
      return at.lemma ? `H${Number(at.src)} (${at.lemma})` : `H${Number(at.src)}`
    }),
  )

export function parseHebrewDictionary(xml: string): DictEntry[] {
  const out: DictEntry[] = []
  for (const m of xml.matchAll(/<div type="entry"[^>]*>([\s\S]*?)<\/div>/g)) {
    // Typo notes can nest inside the other notes; drop them before reading those.
    const body = m[1].replace(/<note type="x-typo">[\s\S]*?<\/note>/g, '')
    const w = /<w\b([^>]*\bID="H(\d+)"[^>]*)>/.exec(body)
    if (!w) continue
    const at = attrs(w[1])
    const notes: Record<string, string> = {}
    for (const n of body.matchAll(HEB_NOTE_RE)) notes[n[1]] = hebText(n[2])
    out.push({
      id: `H${Number(w[2])}`,
      lemma: at.lemma ?? '',
      xlit: at.xlit ?? '',
      pron: at.POS ?? '',
      derivation: notes.exegesis ?? '',
      definition: notes.explanation ?? '',
      kjvDef: notes.translation ?? '',
    })
  }
  return out
}

// ---- Greek (strongsgreek.xml) ----

const grkText = (s: string) =>
  clean(
    s
      .replace(/<strongsref\b([^>]*)\/>/g, (_m, a: string) => {
        const at = attrs(a)
        return `${at.language === 'HEBREW' ? 'H' : 'G'}${Number(at.strongs)}`
      })
      .replace(/<greek\b([^>]*)\/>/g, (_m, a: string) => attrs(a).unicode ?? '')
      .replace(/<pronunciation\b[^>]*\/>/g, ''),
  )

const part = (body: string, tag: string) => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body)
  return m ? grkText(m[1]) : ''
}

export function parseGreekDictionary(xml: string): DictEntry[] {
  const out: DictEntry[] = []
  for (const m of xml.matchAll(/<entry strongs="(\d+)">([\s\S]*?)<\/entry>/g)) {
    const body = m[2]
    const g = /<greek\b([^>]*)\/>/.exec(body)
    const greek = g ? attrs(g[1]) : {}
    const p = /<pronunciation\b([^>]*)\/>/.exec(body)
    const endDef = body.indexOf('</kjv_def>')
    const trailing = endDef >= 0 ? grkText(body.slice(endDef + '</kjv_def>'.length)) : ''
    const definition = [part(body, 'strongs_def'), trailing].filter(Boolean).join(' ')
    out.push({
      id: `G${Number(m[1])}`,
      lemma: greek.unicode ?? '',
      xlit: greek.translit ?? '',
      pron: p ? (attrs(p[1]).strongs ?? '') : '',
      derivation: part(body, 'strongs_derivation'),
      definition,
      kjvDef: part(body, 'kjv_def').replace(/^:?--\s*/, ''),
    })
  }
  return out
}
