import type { CallLang, Lang } from '../types'
import { foldForMatch, hasCyrillic } from './srScript'

const SR_WORDS = new Set([
  'je', 'da', 'ne', 'sta', 'sto', 'kako', 'koliko', 'nije', 'sam', 'smo', 'ste', 'su', 'ali',
  'i', 'u', 'za', 'na', 'se', 'to', 'ja', 'mi', 'vi', 'ovo', 'ono', 'li', 'kad', 'kada', 'zato',
  'jer', 'ako', 'bih', 'bi', 'mozemo', 'moze', 'treba', 'hvala', 'dobro', 'zdravo', 'cao', 'onda',
  'jos', 'vec', 'samo', 'malo', 'nesto', 'nista', 'ima', 'imamo', 'nema', 'jeste'
])

const EN_WORDS = new Set([
  'the', 'is', 'are', 'and', 'to', 'you', 'we', 'that', 'it', 'of', 'what', 'this', 'with',
  'for', 'have', 'be', 'was', 'not', 'can', 'will', 'would', 'about', 'they', 'our', 'your',
  'just', 'so', 'yeah', 'yes', 'no', 'do', 'does', 'how', 'when', 'there', 'thanks', 'okay',
  'i', 'me', 'my', 'an', 'a', 'if', 'but', 'really', 'think'
])

// Words present in both lists ("i", "a", "no") count for neither.
const SHARED = new Set([...SR_WORDS].filter((w) => EN_WORDS.has(w)))

export interface LangScore {
  en: number
  sr: number
}

export function scoreLang(text: string): LangScore {
  if (hasCyrillic(text)) return { en: 0, sr: 10 }
  const score: LangScore = { en: 0, sr: 0 }
  if (/[čćšžđ]/i.test(text)) score.sr += 2
  for (const raw of foldForMatch(text).split(/[^a-z']+/)) {
    if (!raw || SHARED.has(raw)) continue
    if (SR_WORDS.has(raw)) score.sr += 1
    if (EN_WORDS.has(raw)) score.en += 1
  }
  return score
}

export function detectLang(text: string): Lang | undefined {
  const s = scoreLang(text)
  if (s.en === 0 && s.sr === 0) return undefined
  return s.sr > s.en ? 'sr' : 'en'
}

/** Tracks the language of the whole call from the utterances seen so far. */
export class CallLangTracker {
  private en = 0
  private sr = 0

  add(text: string): Lang | undefined {
    const s = scoreLang(text)
    this.en += s.en
    this.sr += s.sr
    return detectLang(text)
  }

  get current(): CallLang | undefined {
    const total = this.en + this.sr
    if (total < 6) return undefined
    const srShare = this.sr / total
    if (srShare > 0.75) return 'sr'
    if (srShare < 0.25) return 'en'
    return 'mixed'
  }
}
