import {
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
  type AudioStream,
  type LanguageCode,
  type StartStreamTranscriptionCommandInput
} from '@aws-sdk/client-transcribe-streaming'
import type { Lang, Speaker, Utterance } from '../types'
import type { STTCallbacks, STTProvider } from './stt'

// Amazon Transcribe streaming. One stream per speaker (the microphone is A,
// the speaker monitor is B), so every result already knows who spoke.

export interface AwsCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
}

const SAMPLE_RATE = 16000
/** Transcribe works best with chunks of 50-200 ms; pw-record delivers ~40 ms. */
const CHUNK_BYTES = (SAMPLE_RATE * 2) / 10

/** Turns pushed PCM buffers into the async iterable Transcribe reads from. */
class AudioQueue {
  private pending: Buffer[] = []
  private size = 0
  private ready: Uint8Array[] = []
  private wake?: () => void
  private closed = false

  push(pcm: Buffer): void {
    if (this.closed) return
    this.pending.push(pcm)
    this.size += pcm.length
    if (this.size >= CHUNK_BYTES) {
      this.ready.push(new Uint8Array(Buffer.concat(this.pending)))
      this.pending = []
      this.size = 0
      this.wake?.()
    }
  }

  close(): void {
    this.closed = true
    this.wake?.()
  }

  async *stream(): AsyncGenerator<AudioStream> {
    for (;;) {
      while (this.ready.length) yield { AudioEvent: { AudioChunk: this.ready.shift()! } }
      if (this.closed) return
      await new Promise<void>((r) => (this.wake = r))
      this.wake = undefined
    }
  }
}

const toLang = (code?: string): Lang | undefined =>
  code?.startsWith('sr') ? 'sr' : code?.startsWith('en') ? 'en' : undefined

export class TranscribeSTT implements STTProvider {
  readonly id = 'transcribe'
  private readonly client: TranscribeStreamingClient
  private queues: Partial<Record<Speaker, AudioQueue>> = {}
  private stopped = false
  private t0 = 0
  private seq = 0

  constructor(
    creds: AwsCredentials,
    private readonly callLang: 'auto' | Lang
  ) {
    this.client = new TranscribeStreamingClient({
      region: creds.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken || undefined
      }
    })
  }

  async start(cb: STTCallbacks): Promise<void> {
    this.t0 = Date.now()
    this.stopped = false
    for (const speaker of ['A', 'B'] as const) void this.run(speaker, cb, this.callLang)
  }

  push(speaker: Speaker, pcm: Buffer): void {
    this.queues[speaker]?.push(pcm)
  }

  async stop(): Promise<void> {
    this.stopped = true
    for (const q of Object.values(this.queues)) q.close()
    this.queues = {}
    this.client.destroy()
  }

  private languageParams(lang: 'auto' | Lang): Partial<StartStreamTranscriptionCommandInput> {
    if (lang === 'en') return { LanguageCode: 'en-US' }
    if (lang === 'sr') return { LanguageCode: 'sr-RS' as LanguageCode }
    return { IdentifyLanguage: true, LanguageOptions: 'en-US,sr-RS', PreferredLanguage: 'en-US' }
  }

  private async run(speaker: Speaker, cb: STTCallbacks, lang: 'auto' | Lang): Promise<void> {
    const queue = new AudioQueue()
    this.queues[speaker] = queue
    // Result times are relative to the start of this stream.
    const offset = (Date.now() - this.t0) / 1000
    try {
      const res = await this.client.send(
        new StartStreamTranscriptionCommand({
          ...this.languageParams(lang),
          MediaEncoding: 'pcm',
          MediaSampleRateHertz: SAMPLE_RATE,
          EnablePartialResultsStabilization: true,
          PartialResultsStability: 'medium',
          AudioStream: queue.stream()
        })
      )
      for await (const ev of res.TranscriptResultStream ?? []) {
        for (const r of ev.TranscriptEvent?.Transcript?.Results ?? []) {
          const alt = r.Alternatives?.[0]
          const text = alt?.Transcript?.trim()
          if (!text) continue
          if (r.IsPartial) {
            cb.onPartial?.(speaker, text)
            continue
          }
          const u: Utterance = {
            id: `t${speaker}${this.seq++}`,
            speaker,
            text,
            start: (r.StartTime ?? 0) + offset,
            end: (r.EndTime ?? 0) + offset,
            lang: toLang(r.LanguageCode),
            words: (alt?.Items ?? [])
              .filter((i) => i.Type === 'pronunciation' && i.Content)
              .map((i) => ({ w: i.Content!, s: (i.StartTime ?? 0) + offset, e: (i.EndTime ?? 0) + offset }))
          }
          cb.onFinal(u)
        }
      }
    } catch (err) {
      if (this.stopped) return
      const message = err instanceof Error ? err.message : String(err)
      // Automatic language identification may not be available everywhere; fall back to English.
      if (lang === 'auto') {
        cb.onError(`Transcribe (${speaker}): ${message}. Retrying with English only.`)
        void this.run(speaker, cb, 'en')
        return
      }
      cb.onError(`Transcribe (${speaker}): ${message}`)
    }
  }
}
