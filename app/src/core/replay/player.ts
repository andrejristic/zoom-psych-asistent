import type { Engine } from '../engine'
import type { Transcript } from './transcript'

/**
 * Plays a transcript into the engine as if it were a live call: each utterance
 * arrives when it ends (like a final STT result), and the engine ticks once per
 * second of call time. `speed` compresses real time.
 */
export class ReplayPlayer {
  private timer?: ReturnType<typeof setTimeout>
  private stopped = false
  private startedAt = 0
  private index = 0
  private callTime = 0

  constructor(
    private readonly transcript: Transcript,
    private readonly engine: Engine,
    private readonly speed: number,
    private readonly onTime: (t: number) => void,
    private readonly onDone: () => void
  ) {}

  start(): void {
    this.startedAt = Date.now()
    this.loop()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
  }

  private loop(): void {
    if (this.stopped) return
    const now = ((Date.now() - this.startedAt) / 1000) * this.speed
    const list = this.transcript.utterances
    while (this.index < list.length && list[this.index].end <= now) {
      void this.engine.addUtterance(list[this.index])
      this.index++
    }
    if (Math.floor(now) > Math.floor(this.callTime)) void this.engine.tick(now)
    this.callTime = now
    this.onTime(now)
    if (this.index >= list.length) {
      void this.engine.tick(now).then(() => this.onDone())
      return
    }
    this.timer = setTimeout(() => this.loop(), 100)
  }
}
