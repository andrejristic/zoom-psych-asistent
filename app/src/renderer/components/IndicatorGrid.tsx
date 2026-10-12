import type { Indicators } from '../../core/types'
import type { Strings } from '../i18n'

interface Props {
  t: Strings
  indicators?: Indicators
}

function trend(t: Strings, z?: number, invert = false): { cls: string; label: string } {
  if (z === undefined || Math.abs(z) < 1.5) return { cls: '', label: t.usual }
  const higher = z > 0
  const slower = invert ? higher : !higher
  return { cls: Math.abs(z) >= 2 ? 'alert' : 'warn', label: slower ? t.slower : t.faster }
}

export function IndicatorGrid({ t, indicators: i }: Props) {
  const tempo = trend(t, i?.tempoZ)
  const lat = trend(t, i?.latencyZ, true)
  const shareA = Math.round((i?.talkShareA ?? 0.5) * 100)
  return (
    <section className="grid">
      <div className={`tile ${i?.baselineReady ? tempo.cls : ''}`}>
        <span className="tile-label">{t.tempo}</span>
        <span className="tile-value">{i?.tempoB ? Math.round(i.tempoB) : '–'}</span>
        <span className="tile-sub">{i?.baselineReady && i.tempoB ? tempo.label : t.wpm}</span>
      </div>
      <div className={`tile ${i?.baselineReady ? lat.cls : ''}`}>
        <span className="tile-label">{t.latency}</span>
        <span className="tile-value">{i?.latencyB !== undefined ? `${i.latencyB.toFixed(1)} s` : '–'}</span>
        <span className="tile-sub">{i?.baselineReady && i.latencyB !== undefined ? lat.label : ''}</span>
      </div>
      <div className={`tile ${shareA > 70 ? 'warn' : ''}`}>
        <span className="tile-label">{t.talkShare}</span>
        <span className="tile-value">
          {shareA}% / {100 - shareA}%
        </span>
        <span className="share">
          <span style={{ width: `${shareA}%` }} />
        </span>
      </div>
      <div className="tile">
        <span className="tile-label">{t.baseline}</span>
        <span className="tile-value">{i?.baselineReady ? '✓' : `${Math.round((i?.baselineProgress ?? 0) * 100)}%`}</span>
        <span className="tile-sub">{i?.baselineReady ? t.baselineReady : ''}</span>
      </div>
    </section>
  )
}
