import { Fragment } from 'react'
import { splitStrongsRefs } from '../../../shared/strongs'
import type { StrongsEntry } from '../../../shared/types'

interface Props {
  entry: StrongsEntry
  onLink(id: string): void
}

function Linked({ text, onLink }: { text: string; onLink(id: string): void }) {
  return (
    <>
      {splitStrongsRefs(text).map((part, i) =>
        'id' in part ? (
          <button key={i} type="button" className="link-btn strongs-ref" onClick={() => onLink(part.id)}>
            {part.id}
          </button>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  )
}

/** One Strong's entry. Pure (no state or IPC) so the display window can reuse it later. */
export function StrongsEntryView({ entry, onLink }: Props) {
  const hebrew = entry.id.startsWith('H')
  const field = (label: string, text: string) =>
    text && (
      <p className="strongs-entry__field">
        <span className="strongs-entry__label">{label}</span> <Linked text={text} onLink={onLink} />
      </p>
    )
  return (
    <div className="strongs-entry">
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
