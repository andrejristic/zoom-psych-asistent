import type { MetricName } from '../types'

// Robust per-speaker baseline: median and MAD, so one odd answer does not
// shift the reference. A value is a signal only as a deviation from how this
// person normally talks, never as an absolute threshold.

export const Z_SIGNAL = 2

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export class MetricBaseline {
  private values: number[] = []

  constructor(
    /** Floor for the spread, so a very regular speaker does not make every tiny change a signal. */
    private readonly minScale: number,
    private readonly window = 40
  ) {}

  get n(): number {
    return this.values.length
  }

  add(value: number): void {
    this.values.push(value)
    if (this.values.length > this.window) this.values.shift()
  }

  get median(): number {
    return this.values.length ? median(this.values) : 0
  }

  z(value: number): number {
    if (!this.values.length) return 0
    const med = median(this.values)
    const mad = median(this.values.map((v) => Math.abs(v - med)))
    const scale = Math.max(1.4826 * mad, this.minScale)
    return (value - med) / scale
  }
}

export class SpeakerBaseline {
  readonly metrics: Record<MetricName, MetricBaseline> = {
    latency: new MetricBaseline(0.35),
    wpm: new MetricBaseline(18),
    words: new MetricBaseline(4)
  }

  constructor(readonly minSamples = 8) {}

  /** How many answers are in; latency only exists for answers to questions, so words count. */
  get samples(): number {
    return this.metrics.words.n
  }

  get ready(): boolean {
    return this.samples >= this.minSamples
  }

  get progress(): number {
    return Math.min(1, this.samples / this.minSamples)
  }
}
