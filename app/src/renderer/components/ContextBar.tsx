import { useState } from 'react'
import { PHASE_LABEL, TYPE_LABEL } from '../../core/advisor/phrases'
import type { ConversationContext, ConversationPhase, ConversationType } from '../../core/types'
import type { WriteLang } from '../../core/providers/llm'
import type { Strings } from '../i18n'

interface Props {
  t: Strings
  context?: ConversationContext
  lang: WriteLang
}

const BLANK: ConversationContext = {
  type: 'other',
  phase: 'discovery',
  roles: { A: 'you', B: 'counterpart' },
  userAim: '',
  counterpartAim: '',
  tone: 'formal',
  confidence: 1
}

export function ContextBar({ t, context, lang }: Props) {
  const [editing, setEditing] = useState<ConversationContext>()
  const types = Object.keys(TYPE_LABEL[lang]) as ConversationType[]
  const phases = Object.keys(PHASE_LABEL[lang]) as ConversationPhase[]

  if (editing) {
    return (
      <section className="card context editing">
        <label className="inline">
          {t.type}
          <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as ConversationType })}>
            {types.map((x) => (
              <option key={x} value={x}>
                {TYPE_LABEL[lang][x]}
              </option>
            ))}
          </select>
        </label>
        <label className="inline">
          {t.phase}
          <select value={editing.phase} onChange={(e) => setEditing({ ...editing, phase: e.target.value as ConversationPhase })}>
            {phases.map((x) => (
              <option key={x} value={x}>
                {PHASE_LABEL[lang][x]}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <span className="spacer" />
          <button className="btn ghost small" onClick={() => setEditing(undefined)}>
            {t.cancel}
          </button>
          <button
            className="btn primary small"
            onClick={() => {
              void window.api.setContext(editing)
              setEditing(undefined)
            }}
          >
            {t.save}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="context-line" onClick={() => setEditing(context ?? BLANK)} title={t.edit}>
      {context ? (
        <>
          <strong>{TYPE_LABEL[lang][context.type]}</strong>
          <span className="sep">·</span>
          <span>{PHASE_LABEL[lang][context.phase]}</span>
          {context.manual && <span className="chip">✎</span>}
        </>
      ) : (
        <span className="muted">{t.contextUnknown}</span>
      )}
      <span className="spacer" />
      <span className="link small">{t.edit}</span>
    </section>
  )
}
