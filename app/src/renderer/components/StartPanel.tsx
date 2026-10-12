import { useEffect, useState } from 'react'
import type { DemoInfo, Settings } from '../../shared/ipc'
import type { Strings } from '../i18n'

interface Props {
  t: Strings
  settings: Settings
  update: (patch: Partial<Settings>) => Promise<void>
}

export function StartPanel({ t, settings, update }: Props) {
  const [mode, setMode] = useState<'live' | 'replay'>('replay')
  const [demos, setDemos] = useState<DemoInfo[]>([])
  const [source, setSource] = useState('')
  const [file, setFile] = useState<string>()
  const [goal, setGoal] = useState('')

  useEffect(() => {
    void window.api.listDemos().then((d) => {
      setDemos(d)
      if (d.length) setSource((s) => s || d[0].id)
    })
  }, [])

  const pick = async () => {
    const path = await window.api.pickTranscript()
    if (path) {
      setFile(path)
      setSource('file')
    }
  }

  const start = () => {
    if (mode === 'live') void window.api.start({ mode: 'live', goal })
    else if (source === 'file' && file) void window.api.start({ mode: 'replay', filePath: file, goal })
    else void window.api.start({ mode: 'replay', demoId: source, goal })
  }

  return (
    <section className="card start">
      <div className="segmented">
        <button className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>
          {t.modeLive}
        </button>
        <button className={mode === 'replay' ? 'on' : ''} onClick={() => setMode('replay')}>
          {t.modeReplay}
        </button>
      </div>

      {mode === 'replay' && (
        <>
          <label className="field">
            <span>{t.replaySource}</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {demos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
              {file && <option value="file">{file.replace(/^.*[\\/]/, '')}</option>}
            </select>
          </label>
          <div className="row">
            <button className="btn ghost small" onClick={() => void pick()}>
              {t.loadFile}
            </button>
            <span className="spacer" />
            <label className="inline">
              {t.replaySpeed}
              <select value={settings.replaySpeed} onChange={(e) => void update({ replaySpeed: Number(e.target.value) })}>
                {[1, 2, 4, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}×
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}

      {mode === 'live' && window.api.platform === 'linux' && <p className="muted small">{t.headphones}</p>}
      {mode === 'live' && window.api.platform !== 'linux' && <div className="notice">{t.liveLinuxOnly}</div>}

      <label className="field">
        <span>{t.goal}</span>
        <input value={goal} placeholder={t.goalPlaceholder} onChange={(e) => setGoal(e.target.value)} />
      </label>

      <button className="btn primary wide" onClick={start} disabled={(mode === 'replay' && !source) || (mode === 'live' && window.api.platform !== 'linux')}>
        {t.start}
      </button>
      <p className="muted small center">{t.idleHint}</p>
    </section>
  )
}
