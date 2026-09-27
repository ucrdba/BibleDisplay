import type { CSSProperties } from 'react'
import { buildSegments, type Segment } from '../../../shared/segments'
import { fontStack, type Styles } from '../../../shared/styles'
import type { DisplayGroup, VerseData } from '../../../shared/types'
import './verse.css'

interface Props {
  groups: DisplayGroup[]
  styles: Styles
  blank: boolean
}

function segmentStyle(seg: Segment, styles: Styles): CSSProperties | undefined {
  if (seg.kind === 'highlight') return { color: seg.color }
  if (seg.kind === 'jesus') return { color: styles.jesusColor }
  return undefined
}

function Verse({ v, styles, showChapter }: { v: VerseData; styles: Styles; showChapter: boolean }) {
  return (
    <span className="verse">
      {styles.verseNumbers.show && (
        <sup className="verse-num" style={{ color: styles.verseNumbers.color }}>
          {showChapter ? `${v.chapter}:${v.verse}` : v.verse}
        </sup>
      )}
      <span className="verse-text" data-verse-key={`${v.bookId}.${v.chapter}.${v.verse}`}>
        {buildSegments(v.text, v.redLetter, v.highlights).map(seg => (
          <span key={seg.start} data-offset={seg.start} style={segmentStyle(seg, styles)}>
            {seg.text}
          </span>
        ))}
      </span>{' '}
    </span>
  )
}

export function VerseView({ groups, styles, blank }: Props) {
  const scale = styles.scale
  const headingStyle: CSSProperties = {
    fontFamily: fontStack(styles.heading.font),
    fontSize: styles.heading.size * scale,
    color: styles.heading.color,
    fontWeight: styles.heading.bold ? 700 : 400,
  }
  const bodyStyle: CSSProperties = {
    fontFamily: fontStack(styles.verse.font),
    fontSize: styles.verse.size * scale,
    color: styles.verse.color,
  }
  return (
    <div className="verse-view" style={{ background: styles.background }}>
      {!blank &&
        groups.map((g, gi) => (
          <section className="verse-group" key={`${gi}-${g.label}`}>
            <h2 className="verse-heading" style={headingStyle}>
              {g.label}
            </h2>
            <div className={`verse-body verse-body--${styles.layout}`} style={bodyStyle}>
              {g.verses.map((v, i) => (
                <Verse
                  key={`${v.chapter}:${v.verse}`}
                  v={v}
                  styles={styles}
                  showChapter={i > 0 && v.chapter !== g.verses[i - 1].chapter}
                />
              ))}
            </div>
          </section>
        ))}
    </div>
  )
}
