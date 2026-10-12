import { clock } from '../../core/advisor/phrases'
import type { Strings } from '../i18n'
import type { State } from '../state'
import { Icon } from './Icon'

interface Props {
  t: Strings
  state: State
  inSettings: boolean
  onSettings: () => void
}

export function TitleBar({ t, state, inSettings, onSettings }: Props) {
  const running = state.status === 'running'
  return (
    <header className="titlebar">
      <span className={`dot ${state.status}`} />
      <span className="app-name">{t.appName}</span>
      {state.status !== 'idle' && <span className="clock">{clock(state.t)}</span>}
      <span className="spacer" />
      {running && (
        <button className="btn danger small" onClick={() => void window.api.stop()}>
          {t.stop}
        </button>
      )}
      {state.status === 'finishing' && <span className="muted small">{t.finishing}</span>}
      <button className="icon" title={t.hide} onClick={() => void window.api.window('hide')}>
        <Icon name="hide" />
      </button>
      <button className={`icon ${inSettings ? 'active' : ''}`} title={inSettings ? t.back : t.settings} onClick={onSettings}>
        <Icon name={inSettings ? 'back' : 'settings'} />
      </button>
      <button className="icon" title={t.minimize} onClick={() => void window.api.window('minimize')}>
        <Icon name="minimize" />
      </button>
      <button className="icon" title={t.close} onClick={() => void window.api.window('close')}>
        <Icon name="close" />
      </button>
    </header>
  )
}
