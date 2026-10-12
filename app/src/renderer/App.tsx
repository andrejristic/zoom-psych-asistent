import { useEffect, useReducer, useState } from 'react'
import { DEFAULT_SETTINGS, type Settings } from '../shared/ipc'
import { STRINGS } from './i18n'
import { initialState, reducer } from './state'
import { TitleBar } from './components/TitleBar'
import { StartPanel } from './components/StartPanel'
import { AdviceCard } from './components/AdviceCard'
import { ContextBar } from './components/ContextBar'
import { IndicatorGrid } from './components/IndicatorGrid'
import { Levels } from './components/Levels'
import { Transcript } from './components/Transcript'
import { SettingsView } from './views/SettingsView'
import { ReportView } from './views/ReportView'

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [view, setView] = useState<'main' | 'settings'>('main')
  const t = STRINGS[settings.uiLang]

  useEffect(() => {
    void window.api.getSettings().then(setSettings)
    return window.api.onEvent(dispatch)
  }, [])

  const updateSettings = async (patch: Partial<Settings>) => setSettings(await window.api.setSettings(patch))
  const running = state.status !== 'idle'

  let body
  if (view === 'settings') {
    body = <SettingsView t={t} settings={settings} update={updateSettings} levels={state.levels} />
  } else if (state.report && !running) {
    body = (
      <ReportView
        t={t}
        report={state.report.report}
        sessionId={state.report.sessionId}
        onClose={() => dispatch({ kind: 'closeReport' })}
      />
    )
  } else {
    body = (
      <>
        {!running && <StartPanel t={t} settings={settings} update={updateSettings} />}
        {running && (
          <>
            {state.note === 'stt-missing' && <div className="notice">{t.sttMissing}</div>}
            <AdviceCard
              t={t}
              advice={state.advice}
              onFeedback={(id, rating) => {
                dispatch({ kind: 'feedback', id, rating })
                void window.api.feedback(id, rating)
              }}
            />
            <ContextBar t={t} context={state.context} lang={settings.uiLang} />
            <IndicatorGrid t={t} indicators={state.indicators} />
            {state.mode === 'live' && <Levels t={t} levels={state.levels} />}
            <Transcript t={t} utterances={state.utterances} turns={state.turns} lang={settings.uiLang} />
          </>
        )}
      </>
    )
  }

  return (
    <div className="app">
      <TitleBar
        t={t}
        state={state}
        inSettings={view === 'settings'}
        onSettings={() => setView(view === 'settings' ? 'main' : 'settings')}
      />
      <main className="body">{body}</main>
      {state.errors.length > 0 && (
        <div className="errors" onClick={() => dispatch({ kind: 'dismissErrors' })}>
          <strong>{t.error}:</strong> {state.errors[state.errors.length - 1]}
        </div>
      )}
      <footer className="footer">{t.ethics}</footer>
    </div>
  )
}
