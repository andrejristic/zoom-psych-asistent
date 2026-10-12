import { useEffect, useState, type ReactNode } from 'react'
import { CLAUDE_MODELS, type ClaudeModel } from '../../core/providers/models'
import type { Connections, Settings } from '../../shared/ipc'
import type { Strings } from '../i18n'

interface Props {
  t: Strings
  settings: Settings
  update: (patch: Partial<Settings>) => Promise<void>
}

const AWS_REGIONS = ['ca-central-1', 'us-east-1', 'us-west-2', 'eu-central-1', 'eu-west-1']

const MODEL_LABEL: Record<ClaudeModel, string> = {
  'claude-haiku-5-5': 'Claude Haiku 5.5',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5',
  'claude-opus-5-5': 'Claude Opus 5.5'
}

/** Electron wraps errors from the main process; show only the message. */
const clean = (err: unknown) => String(err instanceof Error ? err.message : err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card settings">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function Status({ t, on, label }: { t: Strings; on: boolean; label: string }) {
  return (
    <div className="status-row">
      <span className={`dot ${on ? 'running' : 'idle'}`} /> {on ? `${t.connected}: ${label}` : t.notConnected}
    </div>
  )
}

export function AiSettings({ t, settings: s, update }: Props) {
  const [conn, setConn] = useState<Connections>()
  const [key, setKey] = useState('')
  const [aws, setAws] = useState({ accessKeyId: '', secretAccessKey: '', sessionToken: '' })
  const [busy, setBusy] = useState<'anthropic' | 'aws'>()
  const [error, setError] = useState<{ kind: 'anthropic' | 'aws'; text: string }>()

  useEffect(() => {
    void window.api.getConnections().then(setConn)
  }, [])

  const run = async (kind: 'anthropic' | 'aws', job: () => Promise<Connections>) => {
    setBusy(kind)
    setError(undefined)
    try {
      setConn(await job())
      if (kind === 'anthropic') setKey('')
      else setAws({ accessKeyId: '', secretAccessKey: '', sessionToken: '' })
    } catch (err) {
      setError({ kind, text: clean(err) })
    } finally {
      setBusy(undefined)
    }
  }

  const anthropicOn = !!conn?.anthropic.connected
  const awsOn = !!conn?.aws.connected

  return (
    <>
      <Card title={t.sAi}>
        <label className="field">
          <span>{t.provider}</span>
          <select value={s.provider} onChange={(e) => void update({ provider: e.target.value as Settings['provider'] })}>
            <option value="demo">{t.providerDemo}</option>
            <option value="anthropic">
              {t.providerAnthropic}
              {anthropicOn ? '' : ` (${t.notConnectedChoice})`}
            </option>
            <option value="bedrock">
              {t.providerBedrock}
              {awsOn ? '' : ` (${t.notConnectedChoice})`}
            </option>
          </select>
        </label>
        {s.provider !== 'demo' && (
          <>
            <label className="field">
              <span>{t.fastModel}</span>
              <select value={s.fastModel} onChange={(e) => void update({ fastModel: e.target.value as ClaudeModel })}>
                {CLAUDE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {MODEL_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t.deepModel}</span>
              <select value={s.deepModel} onChange={(e) => void update({ deepModel: e.target.value as ClaudeModel })}>
                {CLAUDE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {MODEL_LABEL[m]}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <p className="muted small">{t.privacyAi}</p>
      </Card>

      <Card title={t.anthropic}>
        <Status t={t} on={anthropicOn} label={conn?.anthropic.label ?? ''} />
        <p className="muted small">{t.anthropicHelp}</p>
        {anthropicOn ? (
          <button className="btn ghost small" onClick={() => void run('anthropic', () => window.api.disconnect('anthropic'))}>
            {t.disconnect}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void run('anthropic', () => window.api.connectAnthropic(key))
            }}
          >
            <input type="password" placeholder="sk-ant-…" value={key} autoComplete="off" onChange={(e) => setKey(e.target.value)} />
            <div className="row">
              <button className="btn primary small" type="submit" disabled={!key.trim() || busy === 'anthropic'}>
                {busy === 'anthropic' ? t.connecting : t.connect}
              </button>
              <button className="btn ghost small" type="button" onClick={() => void window.api.openExternal('anthropic-console')}>
                {t.openConsole} ↗
              </button>
            </div>
          </form>
        )}
        {error?.kind === 'anthropic' && <p className="form-error">{error.text}</p>}
      </Card>

      <Card title={t.aws}>
        <Status t={t} on={awsOn} label={conn?.aws.label ? `${conn.aws.label} · ${conn.aws.region}` : ''} />
        <p className="muted small">{t.awsHelp}</p>
        {awsOn ? (
          <button className="btn ghost small" onClick={() => void run('aws', () => window.api.disconnect('aws'))}>
            {t.disconnect}
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void run('aws', () => window.api.connectAws({ ...aws, region: s.awsRegion }))
            }}
          >
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
            <label className="field">
              <span>{t.accessKeyId}</span>
              <input value={aws.accessKeyId} autoComplete="off" placeholder="AKIA…" onChange={(e) => setAws({ ...aws, accessKeyId: e.target.value })} />
            </label>
            <label className="field">
              <span>{t.secretKey}</span>
              <input type="password" autoComplete="off" value={aws.secretAccessKey} onChange={(e) => setAws({ ...aws, secretAccessKey: e.target.value })} />
            </label>
            <label className="field">
              <span>{t.sessionToken}</span>
              <input type="password" autoComplete="off" value={aws.sessionToken} onChange={(e) => setAws({ ...aws, sessionToken: e.target.value })} />
            </label>
            <div className="row">
              <button className="btn primary small" type="submit" disabled={!aws.accessKeyId.trim() || !aws.secretAccessKey.trim() || busy === 'aws'}>
                {busy === 'aws' ? t.connecting : t.connect}
              </button>
              <button className="btn ghost small" type="button" onClick={() => void window.api.openExternal('aws-console')}>
                {t.openAwsConsole} ↗
              </button>
            </div>
          </form>
        )}
        {error?.kind === 'aws' && <p className="form-error">{error.text}</p>}
      </Card>
    </>
  )
}
