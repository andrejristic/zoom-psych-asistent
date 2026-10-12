import type { Strings } from '../i18n'

interface Props {
  t: Strings
  levels: { mic: number; speaker: number }
}

export function Levels({ t, levels }: Props) {
  return (
    <section className="levels">
      <div className="level">
        <span>{t.mic}</span>
        <span className="meter">
          <span style={{ width: `${Math.round(levels.mic * 100)}%` }} />
        </span>
      </div>
      <div className="level">
        <span>{t.speaker}</span>
        <span className="meter">
          <span style={{ width: `${Math.round(levels.speaker * 100)}%` }} />
        </span>
      </div>
    </section>
  )
}
