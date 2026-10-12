import { useEffect, useRef, type ReactNode } from 'react'
import { clock } from '../../core/advisor/phrases'
import type { WriteLang } from '../../core/providers/llm'
import type { AnalyzedTurn, Tag, TagType, Utterance } from '../../core/types'
import type { Strings } from '../i18n'

interface Props {
  t: Strings
  utterances: Utterance[]
  turns: Record<string, AnalyzedTurn>
  lang: WriteLang
}

const TAG_LABEL: Record<WriteLang, Record<TagType, string>> = {
  en: {
    hedge: 'hedge', assurance: 'reassurance', distancing: 'distancing', deflection: 'deflection',
    vagueness: 'vague', commitment: 'commitment', negative_softener: 'softener', interest: 'interest',
    resistance: 'objection', filler: 'filler'
  },
  sr: {
    hedge: 'ograda', assurance: 'uveravanje', distancing: 'distanciranje', deflection: 'izbegavanje',
    vagueness: 'neodređeno', commitment: 'obećanje', negative_softener: 'umirivanje', interest: 'interes',
    resistance: 'otpor', filler: 'poštapalica'
  }
}

/** Wraps each tagged span of the text in a highlight. */
function highlight(text: string, tags: Tag[], lang: WriteLang): ReactNode[] {
  const marks: Array<{ start: number; end: number; tag: Tag }> = []
  const lower = text.toLowerCase()
  for (const tag of tags) {
    const i = lower.indexOf(tag.span.toLowerCase())
    if (i < 0 || !tag.span) continue
    if (marks.some((m) => i < m.end && i + tag.span.length > m.start)) continue
    marks.push({ start: i, end: i + tag.span.length, tag })
  }
  marks.sort((a, b) => a.start - b.start)
  const out: ReactNode[] = []
  let pos = 0
  for (const m of marks) {
    if (m.start > pos) out.push(text.slice(pos, m.start))
    out.push(
      <mark key={m.start} className={`tag-${m.tag.type}`} title={TAG_LABEL[lang][m.tag.type]}>
        {text.slice(m.start, m.end)}
      </mark>
    )
    pos = m.end
  }
  if (pos < text.length) out.push(text.slice(pos))
  return out
}

export function Transcript({ t, utterances, turns, lang }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => {
    const el = box.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [utterances.length])

  return (
    <section className="transcript">
      <div className="section-title">{t.transcript}</div>
      <div
        className="lines"
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {utterances.map((u) => {
          const turn = turns[u.id]
          const lat = turn?.zscores.find((z) => z.metric === 'latency')
          const slow = lat && lat.z >= 2 && turn?.timing.answersQuestion
          return (
            <div key={u.id} className={`line ${u.speaker === 'A' ? 'me' : 'them'}`}>
              <span className="who">
                {u.speaker === 'A' ? t.you : t.them} <span className="ts">{clock(u.start)}</span>
              </span>
              {slow && <span className="chip warn">⏱ {lat.value.toFixed(1)} s</span>}
              <span className="text">{turn ? highlight(u.text, turn.tags, lang) : u.text}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
