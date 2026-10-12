import type { AdviceCandidate, AdviceCategory } from '../types'

// Decides whether a candidate advice reaches the user. Too many tips are worse
// than none: the user is in the middle of a conversation.

export interface GateOptions {
  minConfidence: number
  /** Seconds between two normal tips. */
  minInterval: number
  /** Seconds before the same category may be shown again. */
  categoryCooldown: number
}

export const DEFAULT_GATE: GateOptions = { minConfidence: 0.5, minInterval: 30, categoryCooldown: 120 }

export class AdviceGate {
  private lastShown = -Infinity
  private lastByCategory = new Map<AdviceCategory, { t: number; text: string }>()

  constructor(private readonly opts: GateOptions = DEFAULT_GATE) {}

  offer(c: AdviceCandidate, t: number): boolean {
    if (c.confidence < this.opts.minConfidence) return false
    const prev = this.lastByCategory.get(c.category)
    const high = c.priority === 'high'
    if (prev && t - prev.t < this.opts.categoryCooldown && !(high && prev.text !== c.text)) return false
    if (!high && t - this.lastShown < this.opts.minInterval) return false
    this.lastShown = t
    this.lastByCategory.set(c.category, { t, text: c.text })
    return true
  }
}
