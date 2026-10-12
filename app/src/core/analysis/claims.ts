import type { Claim } from '../types'
import { foldForMatch } from '../language/srScript'

// Extracts concrete quantities (durations, money, percentages, counts) from a
// statement, so a later statement about the same topic can be compared. The
// Demo provider uses this; an LLM provider returns its own claims.

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, hundred: 100,
  a: 1, an: 1, couple: 2, few: 3,
  jedan: 1, jedna: 1, jednu: 1, jedno: 1, dva: 2, dve: 2, dvije: 2, tri: 3, cetiri: 4, pet: 5,
  sest: 6, sedam: 7, osam: 8, devet: 9, deset: 10, petnaest: 15, dvadeset: 20, trideset: 30,
  cetrdeset: 40, pedeset: 50, sto: 100, par: 2, nekoliko: 3
}

const UNITS: Array<{ re: RegExp; unit: string; factor: number }> = [
  { re: /^(day|days|dan|dana)$/, unit: 'days', factor: 1 },
  { re: /^(week|weeks|nedelja|nedelje|nedelju|sedmica|sedmice|sedmicu)$/, unit: 'days', factor: 7 },
  { re: /^(month|months|mesec|meseca|meseci|mjesec|mjeseca|mjeseci)$/, unit: 'days', factor: 30 },
  { re: /^(percent|posto|odsto|procenata|%)$/, unit: 'percent', factor: 1 },
  { re: /^(dollars|dolara|usd|cad|eur|evra|eura|euros)$/, unit: 'money', factor: 1 },
  { re: /^(k|thousand|hiljada|hiljade)$/, unit: 'money', factor: 1000 },
  { re: /^(people|developers|engineers|ljudi|developera|programera|inzenjera)$/, unit: 'people', factor: 1 }
]

const TOPICS: Array<{ topic: string; re: RegExp }> = [
  { topic: 'delivery', re: /deliver|deadline|launch|ready|ship|go live|rollout|isporu|rok|spremn|lansir|zavrs|montir|gotov/ },
  { topic: 'price', re: /price|cost|budget|discount|fee|pay|cen[aeu]|cijen|kosta|popust|budzet|plat/ },
  { topic: 'team', re: /team|people|developers|engineers|tim|ljud|programer|developer/ },
  { topic: 'onboarding', re: /onboard|setup|integrat|implement|uvodjen|integraci|implementaci|podesav/ }
]

function parseNumber(token: string): number | undefined {
  if (/^\d+([.,]\d+)?$/.test(token)) return Number(token.replace(',', '.'))
  return NUMBER_WORDS[token]
}

/** Maps a quote built from folded tokens back to the original wording ("cetiri nedelje" -> "četiri nedelje"). */
function originalSpan(text: string, quote: string): string {
  const want = quote.split(' ')
  const words = [...text.matchAll(/\S+/g)].map((m) => ({
    start: m.index!,
    end: m.index! + m[0].length,
    folded: foldForMatch(m[0]).replace(/[^a-z0-9%]/g, '')
  }))
  for (let i = 0; i + want.length <= words.length; i++) {
    if (want.every((w, k) => words[i + k].folded === w)) {
      return text.slice(words[i].start, words[i + want.length - 1].end).replace(/[.,;:!?]+$/, '')
    }
  }
  return quote
}

export interface Quantity {
  unit: string
  min: number
  max: number
  quote: string
}

/** Finds "3 weeks", "six to eight weeks", "2-3 meseca", "20 posto", "$50k". */
export function extractQuantities(text: string): Quantity[] {
  const tokens = foldForMatch(text)
    .replace(/\$\s?(\d+)/g, '$1 dollars ')
    .replace(/(\d)(k|%)\b/g, '$1 $2')
    .replace(/(\d)\s*[-–]\s*(\d)/g, '$1 to $2')
    .split(/[^a-z0-9%.,]+/)
    .map((t) => t.replace(/[.,]$/, ''))
    .filter(Boolean)
  const found: Quantity[] = []
  for (let i = 0; i < tokens.length; i++) {
    const n1 = parseNumber(tokens[i])
    if (n1 === undefined) continue
    let j = i + 1
    let n2 = n1
    if ((tokens[j] === 'to' || tokens[j] === 'do' || tokens[j] === 'or' || tokens[j] === 'ili') && parseNumber(tokens[j + 1] ?? '') !== undefined) {
      n2 = parseNumber(tokens[j + 1])!
      j += 2
    }
    if (tokens[j] === 'of' || tokens[j] === 'more') j++
    const unit = UNITS.find((u) => u.re.test(tokens[j] ?? ''))
    if (!unit) continue
    found.push({
      unit: unit.unit,
      min: Math.min(n1, n2) * unit.factor,
      max: Math.max(n1, n2) * unit.factor,
      quote: originalSpan(text, tokens.slice(i, j + 1).join(' '))
    })
    i = j
  }
  return found
}

export function topicOf(text: string): string | undefined {
  const folded = foldForMatch(text)
  return TOPICS.find((t) => t.re.test(folded))?.topic
}

/** Claims made in a statement. The question being answered defines the topic best; otherwise the statement itself. */
export function extractClaims(text: string, t: number, questionText?: string): Claim[] {
  const topic = (questionText ? topicOf(questionText) : undefined) ?? topicOf(text)
  return extractQuantities(text).map((q) => ({
    topic: `${topic ?? 'general'}:${q.unit}`,
    value: `${q.min}-${q.max}`,
    quote: q.quote,
    t
  }))
}

function range(value: string): [number, number] {
  const [a, b] = value.split('-').map(Number)
  return [a, b]
}

/** Two claims conflict when they talk about the same topic and their ranges do not overlap (with 15% slack). */
export function conflicts(a: Claim, b: Claim): boolean {
  if (a.topic !== b.topic || a.topic.startsWith('general:')) return false
  const [a1, a2] = range(a.value)
  const [b1, b2] = range(b.value)
  const slack = 0.15 * Math.max(a2, b2)
  return a2 + slack < b1 || b2 + slack < a1
}

