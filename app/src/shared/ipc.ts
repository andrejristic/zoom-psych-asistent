import type { AdviceLangSetting, ConversationContext, EngineEvent, Lang, SessionReport } from '../core/types'

export type UiLang = 'sr' | 'en'
export type ProviderId = 'demo' | 'anthropic' | 'bedrock'

/** Non-secret settings, saved to disk. API keys are never part of this. */
export interface Settings {
  uiLang: UiLang
  callLang: 'auto' | Lang
  adviceLang: AdviceLangSetting
  provider: ProviderId
  alwaysOnTop: boolean
  micDevice: string
  speakerDevice: string
  saveSessions: boolean
  saveAudio: boolean
  replaySpeed: number
  awsRegion: string
}

export const DEFAULT_SETTINGS: Settings = {
  uiLang: 'sr',
  callLang: 'auto',
  adviceLang: 'follow',
  provider: 'demo',
  alwaysOnTop: true,
  micDevice: '',
  speakerDevice: '',
  saveSessions: true,
  saveAudio: false,
  replaySpeed: 4,
  awsRegion: 'ca-central-1'
}

export interface AudioDevice {
  name: string
  description: string
  kind: 'mic' | 'speaker'
  isDefault: boolean
}

export interface DemoInfo {
  id: string
  title: string
}

export type StartOptions =
  | { mode: 'replay'; demoId?: string; filePath?: string; goal?: string }
  | { mode: 'live'; goal?: string }

export interface SessionSummary {
  id: string
  title: string
  startedAt: string
  durationSec: number
  adviceCount: number
}

export type MainEvent =
  | EngineEvent
  | { kind: 'time'; t: number }
  | { kind: 'levels'; mic: number; speaker: number }
  | { kind: 'status'; state: 'idle' | 'running' | 'finishing'; mode?: 'replay' | 'live'; title?: string; note?: string }
  | { kind: 'report'; report: SessionReport; sessionId: string }
  | { kind: 'visibility'; hidden: boolean }

export interface Api {
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  listDevices(): Promise<AudioDevice[]>
  listDemos(): Promise<DemoInfo[]>
  pickTranscript(): Promise<string | undefined>
  start(opts: StartOptions): Promise<void>
  stop(): Promise<void>
  testAudio(seconds: number): Promise<void>
  feedback(adviceId: string, rating: 'up' | 'down' | undefined): Promise<void>
  setContext(ctx: ConversationContext): Promise<void>
  exportReport(sessionId: string): Promise<string | undefined>
  listSessions(): Promise<SessionSummary[]>
  openExternal(url: 'anthropic-console' | 'aws-console' | 'sessions-folder'): Promise<void>
  window(action: 'minimize' | 'close' | 'hide'): Promise<void>
  onEvent(cb: (ev: MainEvent) => void): () => void
}
