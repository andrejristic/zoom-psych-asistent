import { useEffect, useState } from 'react'
import { clock } from '../../core/advisor/phrases'
import type { Advice } from '../../core/types'
import type { Strings } from '../i18n'

interface Props {
  t: Strings
  advice: Advice[]
  onFeedback: (id: string, rating: 'up' | 'down' | undefined) => void
}

export function AdviceCard({ t, advice, onFeedback }: Props) {
  const latest = advice[advice.length - 1]
  const [glowId, setGlowId] = useState<string>()
  const [showPrev, setShowPrev] = useState(false)

  useEffect(() => {
    if (!latest) return
    setGlowId(latest.id)
    const timer = setTimeout(() => setGlowId(undefined), 8000)
    return () => clearTimeout(timer)
  }, [latest?.id])

  if (!latest) {
    return (
      <section className="card advice empty">
        <p className="muted">{t.waitingAdvice}</p>
      </section>
    )
  }

  const rate = (a: Advice, r: 'up' | 'down') => onFeedback(a.id, a.feedback === r ? undefined : r)
  const earlier = advice.slice(0, -1).reverse()

  return (
    <section className={`card advice cat-${latest.category} ${glowId === latest.id ? 'glow' : ''}`} key={latest.id}>
      <div className="advice-head">
        <span className="advice-time">{clock(latest.t)}</span>
        {latest.priority === 'high' && <span className="badge high">!</span>}
        <span className="spacer" />
        <span className="conf" title={t.confidence}>
          <span className="conf-bar" style={{ width: `${Math.round(latest.confidence * 100)}%` }} />
        </span>
      </div>
      <p className="advice-text">{latest.text}</p>
      <div className="why">
        <span className="why-label">{t.why}</span>
        <ul>
          {latest.observed.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      </div>
      <div className="row">
        {latest.channels.map((c) => (
          <span key={c} className="chip">
            {c === 'language' ? t.chLanguage : t.chTiming}
          </span>
        ))}
        <span className="spacer" />
        <button className={`icon ${latest.feedback === 'up' ? 'active' : ''}`} title={t.helpful} onClick={() => rate(latest, 'up')}>
          👍
        </button>
        <button className={`icon ${latest.feedback === 'down' ? 'active' : ''}`} title={t.notHelpful} onClick={() => rate(latest, 'down')}>
          👎
        </button>
      </div>
      {earlier.length > 0 && (
        <div className="prev">
          <button className="link" onClick={() => setShowPrev(!showPrev)}>
            {t.previous} ({earlier.length}) {showPrev ? '▴' : '▾'}
          </button>
          {showPrev &&
            earlier.map((a) => (
              <div key={a.id} className="prev-item" title={a.observed.join('\n')}>
                <span className="advice-time">{clock(a.t)}</span> {a.text}
              </div>
            ))}
        </div>
      )}
    </section>
  )
}
