import { app } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Engine } from '../core/engine'
import { DemoProvider } from '../core/providers/demo'
import type { LLMProvider } from '../core/providers/llm'
import type { STTProvider } from '../core/providers/stt'
import { ReplayPlayer } from '../core/replay/player'
import { parseTranscript, type Transcript } from '../core/replay/transcript'
import type { DemoInfo, MainEvent, Settings, StartOptions } from '../shared/ipc'
import { AudioCapture } from './audio'
import { recordingsDir, saveSession, type StoredSession } from './store'

function demosDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'demos') : join(app.getAppPath(), 'resources', 'demos')
}

export function listDemos(): DemoInfo[] {
  const dir = demosDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.txt') || f.endsWith('.json'))
    .map((f) => ({ id: f, title: parseTranscript(readFileSync(join(dir, f), 'utf8'), f).title }))
}

function loadTranscript(opts: Extract<StartOptions, { mode: 'replay' }>): Transcript {
  const file = opts.filePath ?? join(demosDir(), opts.demoId ?? '')
  return parseTranscript(readFileSync(file, 'utf8'), file)
}

/**
 * Runs one session at a time: a replay of a transcript, or a live call
 * (audio capture + STT). Both feed the same analysis engine.
 */
export class SessionManager {
  private engine?: Engine
  private player?: ReplayPlayer
  private capture?: AudioCapture
  private stt?: STTProvider
  private clock?: ReturnType<typeof setInterval>
  private id = ''
  private title = ''
  private startedAt = ''
  private finishing = false
  /** The last finished session, kept in memory so it can be exported even when not saved to disk. */
  last?: StoredSession

  constructor(
    private readonly send: (ev: MainEvent) => void,
    private readonly settings: () => Settings
  ) {}

  get running(): boolean {
    return !!this.engine
  }

  /** The AI backend for analysis. Only Demo exists until the connections are added. */
  private provider(): LLMProvider {
    return new DemoProvider()
  }

  /** The speech-to-text backend for live calls; none is connected yet. */
  private sttProvider(): STTProvider | undefined {
    return undefined
  }

  async start(opts: StartOptions): Promise<void> {
    if (this.engine) await this.stop()
    const s = this.settings()
    this.id = new Date().toISOString().replace(/[:.]/g, '-')
    this.startedAt = new Date().toISOString()
    const engine = new Engine({
      provider: this.provider(),
      callLang: s.callLang,
      adviceLang: s.adviceLang,
      goal: opts.goal?.trim() || undefined,
      emit: (ev) => this.send(ev)
    })
    this.engine = engine
    this.finishing = false

    if (opts.mode === 'replay') {
      const transcript = loadTranscript(opts)
      this.title = transcript.title
      this.send({ kind: 'status', state: 'running', mode: 'replay', title: this.title })
      this.player = new ReplayPlayer(
        transcript,
        engine,
        s.replaySpeed,
        (t) => this.send({ kind: 'time', t }),
        () => void this.stop()
      )
      this.player.start()
      return
    }

    if (process.platform !== 'linux') {
      this.engine = undefined
      this.send({ kind: 'error', message: 'Live audio capture is available on Linux only in this version.' })
      return
    }
    this.title = `Zoom ${new Date().toLocaleString()}`
    const t0 = Date.now()
    this.stt = this.sttProvider()
    if (this.stt) {
      await this.stt.start({
        onFinal: (u) => void engine.addUtterance(u),
        onError: (message) => this.send({ kind: 'error', message })
      })
    }
    this.capture = new AudioCapture({
      micDevice: s.micDevice,
      speakerDevice: s.speakerDevice,
      recordTo: s.saveAudio ? join(recordingsDir(), this.id) : undefined,
      onPcm: (speaker, pcm) => this.stt?.push(speaker, pcm),
      onLevels: (mic, speaker) => this.send({ kind: 'levels', mic, speaker }),
      onError: (message) => this.send({ kind: 'error', message })
    })
    this.capture.start()
    this.clock = setInterval(() => {
      const t = (Date.now() - t0) / 1000
      this.send({ kind: 'time', t })
      void engine.tick(t)
    }, 1000)
    this.send({
      kind: 'status',
      state: 'running',
      mode: 'live',
      title: this.title,
      note: this.stt ? undefined : 'stt-missing'
    })
  }

  async stop(): Promise<void> {
    const engine = this.engine
    if (!engine || this.finishing) return
    this.finishing = true
    this.send({ kind: 'status', state: 'finishing' })
    this.player?.stop()
    if (this.clock) clearInterval(this.clock)
    this.capture?.stop()
    await this.stt?.stop()
    this.player = undefined
    this.capture = undefined
    this.stt = undefined
    try {
      const report = await engine.finish(this.title)
      this.last = { id: this.id, startedAt: this.startedAt, report, transcript: engine.utterances }
      if (this.settings().saveSessions) saveSession(this.last)
      this.send({ kind: 'report', report, sessionId: this.id })
    } catch (err) {
      this.send({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    } finally {
      this.engine = undefined
      this.finishing = false
      this.send({ kind: 'status', state: 'idle' })
    }
  }

  feedback(adviceId: string, rating: 'up' | 'down' | undefined): void {
    this.engine?.feedback(adviceId, rating)
  }

  setContext(ctx: Parameters<Engine['setContext']>[0]): void {
    this.engine?.setContext(ctx)
  }

  /** Short capture to check that both streams have sound. Levels only, nothing is saved. */
  testAudio(seconds: number): void {
    if (this.capture || process.platform !== 'linux') return
    const s = this.settings()
    const cap = new AudioCapture({
      micDevice: s.micDevice,
      speakerDevice: s.speakerDevice,
      onPcm: () => {},
      onLevels: (mic, speaker) => this.send({ kind: 'levels', mic, speaker }),
      onError: (message) => this.send({ kind: 'error', message })
    })
    cap.start()
    setTimeout(() => {
      cap.stop()
      this.send({ kind: 'levels', mic: 0, speaker: 0 })
    }, seconds * 1000)
  }
}
