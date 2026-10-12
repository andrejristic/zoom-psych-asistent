import type { AdviceLangSetting, ConversationContext, EngineEvent, Lang, SessionReport } from '../core/types'
import type { ClaudeModel } from '../core/providers/models'

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
  fastModel: ClaudeModel
  deepModel: ClaudeModel
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
  awsRegion: 'ca-central-1',
  fastModel: 'claude-haiku-5-5',
  deepModel: 'claude-sonnet-5-5'
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

/** What is connected right now. Never contains a key, only a masked label. */
export interface Connections {
  anthropic: { connected: boolean; label: string }
  aws: { connected: boolean; label: string; region: string }
}

export interface AwsInput {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
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
  | { kind: 'status'; state: 'idle' | 'running' | 'finishing'; mode?: 'replay' | 'live'; title?: string; note?: string; provider?: string }
  | { kind: 'report'; report: SessionReport; sessionId: string }
  | { kind: 'visibility'; hidden: boolean }

export interface Api {
  /** Node's process.platform: live audio capture exists on 'linux' only for now. */
  platform: string
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
  getConnections(): Promise<Connections>
  connectAnthropic(key: string): Promise<Connections>
  connectAws(input: AwsInput): Promise<Connections>
  disconnect(kind: 'anthropic' | 'aws'): Promise<Connections>
  onEvent(cb: (ev: MainEvent) => void): () => void
}
