import { Fragment } from 'react'
import { splitStrongsRefs } from '../../../shared/strongs'
import type { StrongsEntry } from '../../../shared/types'

interface Props {
  entry: StrongsEntry
  onLink?(id: string): void
  /** false on the display: references render as plain text. */
  linkable?: boolean
  /** Show "<id> · Hebrew|Greek" as a first line (the display band). */
  showId?: boolean
}

const DOT = '\u00b7'

function Linked({ text, onLink, linkable }: { text: string; onLink?(id: string): void; linkable: boolean }) {
  return (
    <>
      {splitStrongsRefs(text).map((part, i) =>
        'id' in part ? (
          linkable ? (
            <button key={i} type="button" className="link-btn strongs-ref" onClick={() => onLink?.(part.id)}>
              {part.id}
            </button>
          ) : (
            <span key={i} className="strongs-ref">
              {part.id}
            </span>
          )
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}

/** One Strong's entry. Pure (no state or IPC) so the display window can reuse it. */
export function StrongsEntryView({ entry, onLink, linkable = true, showId = false }: Props) {
  const hebrew = entry.id.startsWith('H')
  const field = (label: string, text: string) =>
    text && (
      <p className="strongs-entry__field">
        <span className="strongs-entry__label">{label}</span> <Linked text={text} onLink={onLink} linkable={linkable} />
      </p>
    )
  return (
    <div className="strongs-entry">
      {showId && <p className="strongs-entry__label strongs-entry__id">{`${entry.id} ${DOT} ${hebrew ? 'Hebrew' : 'Greek'}`}</p>}
      <div className="strongs-entry__head">
        <span className="strongs-entry__lemma" lang={hebrew ? 'he' : 'grc'} dir={hebrew ? 'rtl' : undefined}>
          {entry.lemma}
        </span>{' '}
        <span className="strongs-entry__xlit">{entry.xlit}</span>
        {entry.pron && <span className="strongs-entry__pron"> ({entry.pron})</span>}
      </div>
      {field('Derivation', entry.derivation)}
      {field('Definition', entry.definition)}
      {field('KJV', entry.kjvDef)}
    </div>
  )
}
