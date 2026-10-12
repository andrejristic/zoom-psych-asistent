import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { closeSync, openSync, writeSync } from 'node:fs'
import { promisify } from 'node:util'
import type { AudioDevice } from '../shared/ipc'
import type { Speaker } from '../core/types'

// Audio capture through PipeWire (Ubuntu 22.10+ default). Two separate streams:
// the microphone is the user (A), the speaker monitor is everyone else (B).
// Knowing who speaks from the stream itself avoids speaker diarization.

const run = promisify(execFile)

export const SAMPLE_RATE = 16000

interface PwObject {
  type: string
  info?: { props?: Record<string, unknown> }
  props?: Record<string, unknown>
  metadata?: Array<{ key: string; value?: { name?: string } }>
}

export async function listDevices(): Promise<AudioDevice[]> {
  if (process.platform !== 'linux') return []
  const { stdout } = await run('pw-dump', [], { maxBuffer: 32 * 1024 * 1024 })
  const objects = JSON.parse(stdout) as PwObject[]
  let defaultSink = ''
  let defaultSource = ''
  for (const o of objects) {
    if (o.type.endsWith('Metadata') && o.props?.['metadata.name'] === 'default') {
      for (const m of o.metadata ?? []) {
        if (m.key === 'default.audio.sink') defaultSink = m.value?.name ?? ''
        if (m.key === 'default.audio.source') defaultSource = m.value?.name ?? ''
      }
    }
  }
  const devices: AudioDevice[] = []
  for (const o of objects) {
    if (!o.type.endsWith('Node')) continue
    const p = o.info?.props ?? {}
    const cls = String(p['media.class'] ?? '')
    const name = String(p['node.name'] ?? '')
    const description = String(p['node.description'] ?? name)
    if (cls === 'Audio/Source') devices.push({ name, description, kind: 'mic', isDefault: name === defaultSource })
    if (cls === 'Audio/Sink') devices.push({ name, description, kind: 'speaker', isDefault: name === defaultSink })
  }
  return devices
}

/** RMS level of 16-bit PCM, mapped from -60..0 dBFS to 0..1. */
export function level(pcm: Buffer): number {
  const n = Math.floor(pcm.length / 2)
  if (!n) return 0
  let sum = 0
  for (let i = 0; i < n; i++) {
    const v = pcm.readInt16LE(i * 2) / 32768
    sum += v * v
  }
  const db = 10 * Math.log10(sum / n + 1e-12)
  return Math.max(0, Math.min(1, (db + 60) / 60))
}

class WavWriter {
  private fd: number
  private bytes = 0

  constructor(private readonly path: string) {
    this.fd = openSync(path, 'w')
    writeSync(this.fd, Buffer.alloc(44))
  }

  write(pcm: Buffer): void {
    writeSync(this.fd, pcm)
    this.bytes += pcm.length
  }

  close(): void {
    const h = Buffer.alloc(44)
    h.write('RIFF', 0)
    h.writeUInt32LE(36 + this.bytes, 4)
    h.write('WAVE', 8)
    h.write('fmt ', 12)
    h.writeUInt32LE(16, 16)
    h.writeUInt16LE(1, 20)
    h.writeUInt16LE(1, 22)
    h.writeUInt32LE(SAMPLE_RATE, 24)
    h.writeUInt32LE(SAMPLE_RATE * 2, 28)
    h.writeUInt16LE(2, 32)
    h.writeUInt16LE(16, 34)
    h.write('data', 36)
    h.writeUInt32LE(this.bytes, 40)
    writeSync(this.fd, h, 0, 44, 0)
    closeSync(this.fd)
  }

  get file(): string {
    return this.path
  }
}

export interface CaptureOptions {
  micDevice: string
  speakerDevice: string
  /** Base path for WAV files (without extension), or undefined to not record. */
  recordTo?: string
  onPcm: (speaker: Speaker, pcm: Buffer) => void
  onLevels: (mic: number, speaker: number) => void
  onError: (message: string) => void
}

export class AudioCapture {
  private procs: ChildProcess[] = []
  private writers: Partial<Record<Speaker, WavWriter>> = {}
  private levels: Record<Speaker, number> = { A: 0, B: 0 }
  private levelTimer?: ReturnType<typeof setInterval>

  constructor(private readonly opts: CaptureOptions) {}

  start(): void {
    this.spawn('A', this.opts.micDevice, false)
    this.spawn('B', this.opts.speakerDevice, true)
    this.levelTimer = setInterval(() => {
      this.opts.onLevels(this.levels.A, this.levels.B)
      // Decay, so the meter falls when a stream goes quiet.
      this.levels.A *= 0.6
      this.levels.B *= 0.6
    }, 100)
  }

  stop(): string[] {
    for (const p of this.procs) p.kill('SIGTERM')
    this.procs = []
    if (this.levelTimer) clearInterval(this.levelTimer)
    const files: string[] = []
    for (const w of Object.values(this.writers)) {
      w.close()
      files.push(w.file)
    }
    this.writers = {}
    return files
  }

  private spawn(speaker: Speaker, device: string, monitor: boolean): void {
    const args = ['--rate', String(SAMPLE_RATE), '--channels', '1', '--format', 's16', '--latency', '40ms']
    if (device) args.unshift('--target', device)
    if (monitor) args.unshift('-P', '{ stream.capture.sink=true }')
    args.push('-')
    const proc = spawn('pw-record', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    if (this.opts.recordTo) this.writers[speaker] = new WavWriter(`${this.opts.recordTo}-${speaker === 'A' ? 'mic' : 'speaker'}.wav`)
    proc.stdout!.on('data', (pcm: Buffer) => {
      this.levels[speaker] = Math.max(this.levels[speaker], level(pcm))
      this.writers[speaker]?.write(pcm)
      this.opts.onPcm(speaker, pcm)
    })
    let stderr = ''
    proc.stderr!.on('data', (d: Buffer) => (stderr += d.toString()))
    proc.on('error', (err) => this.opts.onError(`pw-record: ${err.message}`))
    proc.on('exit', (code, signal) => {
      if (signal !== 'SIGTERM' && code) this.opts.onError(`pw-record (${speaker}) exited ${code}: ${stderr.trim().slice(0, 200)}`)
    })
    this.procs.push(proc)
  }
}
