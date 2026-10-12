import { useState } from 'react'
import { clock } from '../../core/advisor/phrases'
import type { SessionReport } from '../../core/types'
import type { Strings } from '../i18n'

interface Props {
  t: Strings
  report: SessionReport
  sessionId: string
  onClose: () => void
}

function List({ t, items }: { t: Strings; items: string[] }) {
  if (!items.length) return <p className="muted small">{t.none}</p>
  return (
    <ul>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  )
}

export function ReportView({ t, report: r, sessionId, onClose }: Props) {
  const [saved, setSaved] = useState<string>()
  return (
    <div className="report">
      <section className="card">
        <h2>{r.title}</h2>
        <h3>{t.summary}</h3>
        <List t={t} items={r.summary} />
        <h3>{t.keyMoments}</h3>
        <List t={t} items={r.keyMoments.map((m) => `${clock(m.t)}  ${m.text}`)} />
        <h3>{t.commitments}</h3>
        <List t={t} items={r.commitments.map((c) => `${clock(c.t)}  ${c.text}`)} />
        <h3>{t.openQuestions}</h3>
        <List t={t} items={r.openQuestions} />
        <h3>{t.nextTime}</h3>
        <List t={t} items={r.nextTime} />
      </section>
      <div className="row">
        <button className="btn ghost" onClick={async () => setSaved(await window.api.exportReport(sessionId))}>
          {t.exportMd}
        </button>
        <span className="spacer" />
        <button className="btn primary" onClick={onClose}>
          {t.newSession}
        </button>
      </div>
      {saved && (
        <p className="muted small">
          {t.exported}: {saved}
        </p>
      )}
    </div>
  )
}
