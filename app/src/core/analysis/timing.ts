import type { Lang, TimingMetrics, Utterance } from '../types'
import { countFillers } from '../language/lexicons'
import { foldForMatch } from '../language/srScript'

/** Pauses shorter than this between the same speaker's segments are one turn. */
export const SAME_TURN_GAP = 0.7

const QUESTION_START: Record<Lang, RegExp> = {
  en: /^(what|why|how|when|where|who|which|whose|can|could|would|will|do|does|did|is|are|was|were|have|has|should|shall|may)\b/,
  sr: /^(sta|sto|zasto|kako|kada|kad|gde|gdje|ko|koji|koja|koje|koliko|cije|da li|je l|jel|jesi li|jeste li|mozete li|mozes li|imate li|imas li)\b/
}

export function isQuestion(text: string, lang: Lang): boolean {
  if (text.trim().endsWith('?')) return true
  const folded = foldForMatch(text.trim())
  // Also catch a question in the last sentence: "Okay. And when can you deliver"
  const last = folded.split(/[.!]\s+/).pop() ?? folded
  return QUESTION_START[lang].test(last) || QUESTION_START[lang].test(folded)
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
}

/**
 * Timing for one B utterance, given the utterance right before it.
 * Latency exists only when B starts right after A (a real answer to A).
 */
export function measure(u: Utterance, prev: Utterance | undefined, lang: Lang): TimingMetrics {
  const words = wordCount(u.text)
  const duration = u.end - u.start
  const metrics: TimingMetrics = {
    words,
    fillers: countFillers(u.text, lang),
    answersQuestion: false,
    interrupted: false
  }
  if (duration >= 1.5 && words >= 4) metrics.wpm = (words / duration) * 60
  if (prev && prev.speaker !== u.speaker) {
    const gap = u.start - prev.end
    metrics.latency = Math.max(0, gap)
    metrics.interrupted = gap < -0.3
    metrics.answersQuestion = isQuestion(prev.text, lang)
  }
  return metrics
}

/** Share of talk time by the user in a time window that ends at `now`. */
export function talkShareA(utterances: Utterance[], now: number, window = 180): number {
  let a = 0
  let b = 0
  for (const u of utterances) {
    if (u.end < now - window) continue
    const d = Math.max(0, u.end - Math.max(u.start, now - window))
    if (u.speaker === 'A') a += d
    else b += d
  }
  return a + b > 0 ? a / (a + b) : 0.5
}
