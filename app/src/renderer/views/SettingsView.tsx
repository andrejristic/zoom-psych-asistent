import { useEffect, useState, type ReactNode } from 'react'
import type { AudioDevice, SessionSummary, Settings } from '../../shared/ipc'
import { clock } from '../../core/advisor/phrases'
import type { Strings } from '../i18n'
import { Levels } from '../components/Levels'

interface Props {
  t: Strings
  settings: Settings
  update: (patch: Partial<Settings>) => Promise<void>
  levels: { mic: number; speaker: number }
}

function Section({ title, children, disabled }: { title: string; children: ReactNode; disabled?: boolean }) {
  return (
    <section className={`card settings ${disabled ? 'disabled' : ''}`}>
      <h3>{title}</h3>
      {children}
    </section>
  )
}

const AWS_REGIONS = ['ca-central-1', 'us-east-1', 'us-west-2', 'eu-central-1']

export function SettingsView({ t, settings: s, update, levels }: Props) {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    void window.api.listDevices().then(setDevices).catch(() => setDevices([]))
    void window.api.listSessions().then(setSessions)
  }, [])

  const test = () => {
    setTesting(true)
    void window.api.testAudio(5)
    setTimeout(() => setTesting(false), 5200)
  }

  const deviceSelect = (kind: AudioDevice['kind'], value: string, key: 'micDevice' | 'speakerDevice') => (
    <select value={value} onChange={(e) => void update({ [key]: e.target.value })}>
      <option value="">{t.defaultDevice}</option>
      {devices
        .filter((d) => d.kind === kind)
        .map((d) => (
          <option key={d.name} value={d.name}>
            {d.description}
            {d.isDefault ? ' ★' : ''}
          </option>
        ))}
    </select>
  )

  return (
    <div className="settings-view">
      <Section title={t.sLanguage}>
        <label className="field">
          <span>{t.uiLang}</span>
          <select value={s.uiLang} onChange={(e) => void update({ uiLang: e.target.value as Settings['uiLang'] })}>
            <option value="sr">{t.serbian}</option>
            <option value="en">{t.english}</option>
          </select>
        </label>
        <label className="field">
          <span>{t.callLang}</span>
          <select value={s.callLang} onChange={(e) => void update({ callLang: e.target.value as Settings['callLang'] })}>
            <option value="auto">{t.auto}</option>
            <option value="en">{t.english}</option>
            <option value="sr">{t.serbian}</option>
          </select>
        </label>
        <label className="field">
          <span>{t.adviceLang}</span>
          <select value={s.adviceLang} onChange={(e) => void update({ adviceLang: e.target.value as Settings['adviceLang'] })}>
            <option value="follow">{t.follow}</option>
            <option value="en">{t.english}</option>
            <option value="sr-Latn">{t.serbianLat}</option>
            <option value="sr-Cyrl">{t.serbianCyr}</option>
          </select>
        </label>
      </Section>

      <Section title={t.sAi}>
        <label className="field">
          <span>{t.provider}</span>
          <select value={s.provider} onChange={(e) => void update({ provider: e.target.value as Settings['provider'] })}>
            <option value="demo">{t.providerDemo}</option>
            <option value="anthropic" disabled>
              {t.providerAnthropic} ({t.soon})
            </option>
            <option value="bedrock" disabled>
              {t.providerBedrock} ({t.soon})
            </option>
          </select>
        </label>
      </Section>

      <Section title={t.anthropic} disabled>
        <div className="status-row">
          <span className="dot idle" /> {t.notConnected}
        </div>
        <p className="muted small">{t.anthropicHelp}</p>
        <input type="password" placeholder="sk-ant-…" disabled />
        <button className="btn ghost small" onClick={() => void window.api.openExternal('anthropic-console')}>
          {t.openConsole} ↗
        </button>
      </Section>

      <Section title={t.aws} disabled>
        <div className="status-row">
          <span className="dot idle" /> {t.notConnected}
        </div>
        <p className="muted small">{t.awsHelp}</p>
        <label className="field">
          <span>{t.region}</span>
          <select value={s.awsRegion} onChange={(e) => void update({ awsRegion: e.target.value })}>
            {AWS_REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <button className="btn ghost small" disabled>
            {t.awsSso}
          </button>
          <button className="btn ghost small" disabled>
            {t.awsKeys}
          </button>
        </div>
      </Section>

      <Section title={t.sAudio} disabled={window.api.platform !== 'linux'}>
        {window.api.platform !== 'linux' && <p className="muted small">{t.liveLinuxOnly}</p>}
        <label className="field">
          <span>{t.micDevice}</span>
          {deviceSelect('mic', s.micDevice, 'micDevice')}
        </label>
        <label className="field">
          <span>{t.speakerDevice}</span>
          {deviceSelect('speaker', s.speakerDevice, 'speakerDevice')}
        </label>
        <div className="row">
          <button className="btn ghost small" onClick={test} disabled={testing || window.api.platform !== 'linux'}>
            {t.testAudio}
          </button>
        </div>
        {testing && <Levels t={t} levels={levels} />}
        <p className="muted small">{t.headphones}</p>
        <label className="check">
          <input type="checkbox" checked={s.saveAudio} onChange={(e) => void update({ saveAudio: e.target.checked })} />
          {t.saveAudio}
        </label>
      </Section>

      <Section title={t.sWindow}>
        <label className="check">
          <input type="checkbox" checked={s.alwaysOnTop} onChange={(e) => void update({ alwaysOnTop: e.target.checked })} />
          {t.alwaysOnTop}
        </label>
        <p className="muted small">{t.shareNote}</p>
      </Section>

      <Section title={t.sPrivacy}>
        <label className="check">
          <input type="checkbox" checked={s.saveSessions} onChange={(e) => void update({ saveSessions: e.target.checked })} />
          {t.saveSessions}
        </label>
        <button className="btn ghost small" onClick={() => void window.api.openExternal('sessions-folder')}>
          {t.openFolder}
        </button>
        {sessions.length > 0 && (
          <>
            <h4>{t.sessions}</h4>
            <ul className="session-list">
              {sessions.slice(0, 10).map((x) => (
                <li key={x.id}>
                  <span>{x.title}</span>
                  <span className="muted small">
                    {new Date(x.startedAt).toLocaleString()} · {clock(x.durationSec)} · {x.adviceCount}
                  </span>
                  <button className="link small" onClick={() => void window.api.exportReport(x.id)}>
                    {t.exportMd}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <p className="muted small center">{t.about}</p>
    </div>
  )
}
