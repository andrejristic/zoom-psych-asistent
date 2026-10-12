import type {
  Advice,
  AdviceCandidate,
  AnalyzedTurn,
  Claim,
  ConversationContext,
  ConversationPhase,
  ConversationType,
  SessionReport,
  Tag
} from '../types'
import type {
  AnalyzeRequest,
  AnalyzeResult,
  ContextRequest,
  LLMProvider,
  ReportRequest,
  TagRequest,
  WriteLang
} from './llm'
import { conflicts, extractClaims } from '../analysis/claims'
import { Z_SIGNAL } from '../analysis/baseline'
import { foldForMatch } from '../language/srScript'
import { CATEGORY_LABEL, clock, phrase, PHASE_LABEL, TYPE_LABEL } from '../advisor/phrases'

// Rule-based provider. It needs no network and no key, so the whole app can be
// exercised end to end. It is deliberately conservative: an LLM provider sees
// far more than these rules do.

const ASKS_FOR_NUMBER = /\b(how much|how many|how long|when|what date|which date|by when|koliko|kada|kad|do kada|kog datuma|kojeg datuma)\b/
const HAS_NUMBER = /\d|\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|twenty|thirty|fifty|hundred|monday|tuesday|wednesday|thursday|friday|january|february|march|april|may|june|july|august|september|october|november|december|jedan|jedna|dva|dve|tri|cetiri|pet|sest|sedam|osam|devet|deset|dvadeset|ponedeljak|ponedjeljak|utorak|sreda|srijeda|cetvrtak|petak|januar|februar|mart|april|maj|jun|jul|avgust|septembar|oktobar|novembar|decembar)\b/

function z(turn: AnalyzedTurn, metric: 'latency' | 'wpm' | 'words'): number | undefined {
  return turn.zscores.find((m) => m.metric === metric)?.z
}

function fmt(n: number): string {
  return n >= 10 ? Math.round(n).toString() : n.toFixed(1)
}

function has(turn: AnalyzedTurn, type: Tag['type']): Tag | undefined {
  return turn.tags.find((t) => t.type === type)
}

export class DemoProvider implements LLMProvider {
  readonly id = 'demo'

  async tag(req: TagRequest): Promise<Tag[]> {
    const tags = [...req.lexiconTags]
    if (req.question) {
      const q = foldForMatch(req.question.text)
      const a = foldForMatch(req.utterance.text)
      if (ASKS_FOR_NUMBER.test(q) && !HAS_NUMBER.test(a)) {
        tags.push({ type: 'vagueness', span: req.utterance.text.slice(0, 60), strength: 0.6, source: 'rule' })
      }
    }
    return tags
  }

  async analyze(req: AnalyzeRequest): Promise<AnalyzeResult> {
    const L = req.writeLang
    const newClaims: Claim[] = []
    const candidates: AdviceCandidate[] = []
    const known = [...req.claims]

    for (const turn of req.fresh) {
      const u = turn.utterance
      for (const claim of extractClaims(u.text, u.start, turn.question?.text)) {
        const earlier = known.find((c) => conflicts(c, claim))
        if (earlier) {
          candidates.push({
            text: phrase(L, 'contradiction', { a: earlier.quote, b: claim.quote }),
            observed: [phrase(L, 'obsEarlier', { t: clock(earlier.t), s: earlier.quote }), phrase(L, 'obsQuote', { s: claim.quote })],
            channels: ['language'],
            confidence: 0.8,
            category: 'contradiction',
            priority: 'high'
          })
        }
        known.push(claim)
        newClaims.push(claim)
      }
      candidates.push(...this.turnCandidates(turn, L))
    }

    const trend = this.trendCandidate(req.history, L)
    if (trend) candidates.push(trend)

    candidates.sort((a, b) => (b.priority === 'high' ? 1 : 0) - (a.priority === 'high' ? 1 : 0) || b.confidence - a.confidence)
    return { advice: candidates[0], newClaims }
  }

  private turnCandidates(turn: AnalyzedTurn, L: WriteLang): AdviceCandidate[] {
    const out: AdviceCandidate[] = []
    const latZ = z(turn, 'latency')
    const lat = turn.zscores.find((m) => m.metric === 'latency')
    const slow = latZ !== undefined && latZ >= Z_SIGNAL && turn.timing.answersQuestion
    const pauseObs = lat && slow ? phrase(L, 'obsPause', { v: fmt(lat.value), m: fmt(lat.median) }) : undefined
    const withPause = (obs: string[]) => (pauseObs ? [...obs, pauseObs] : obs)
    const channels = (): Array<'language' | 'timing'> => (slow ? ['language', 'timing'] : ['language'])
    const boost = slow ? 0.15 : 0

    const deflect = has(turn, 'deflection')
    if (deflect && turn.question) {
      out.push({
        text: phrase(L, 'deflection', { q: turn.question.text }),
        observed: withPause([phrase(L, 'obsQuote', { s: deflect.span })]),
        channels: channels(), confidence: 0.6 + boost, category: 'deflection', priority: 'normal'
      })
    }
    const vague = has(turn, 'vagueness')
    const hedge = has(turn, 'hedge')
    if (vague) {
      const obs = [phrase(L, 'obsNoNumber')]
      if (hedge) obs.unshift(phrase(L, 'obsQuote', { s: hedge.span }))
      out.push({
        text: phrase(L, 'vagueness'), observed: withPause(obs),
        channels: channels(), confidence: 0.55 + boost + (hedge ? 0.1 : 0), category: 'vagueness', priority: 'normal'
      })
    }
    const assure = has(turn, 'assurance')
    if (assure) {
      const obs = [phrase(L, 'obsQuote', { s: assure.span })]
      if (hedge) obs.push(phrase(L, 'obsQuote', { s: hedge.span }))
      out.push({
        text: phrase(L, 'assurance'), observed: withPause(obs),
        channels: channels(), confidence: 0.5 + boost + (hedge ? 0.1 : 0), category: 'assurance', priority: 'normal'
      })
    }
    const soft = has(turn, 'negative_softener')
    if (soft) {
      out.push({
        text: phrase(L, 'softener'), observed: withPause([phrase(L, 'obsQuote', { s: soft.span })]),
        channels: channels(), confidence: 0.5 + boost, category: 'resistance', priority: 'normal'
      })
    }
    const distance = has(turn, 'distancing')
    if (distance) {
      out.push({
        text: phrase(L, 'distancing'), observed: withPause([phrase(L, 'obsQuote', { s: distance.span })]),
        channels: channels(), confidence: 0.55 + boost, category: 'distancing', priority: 'normal'
      })
    }
    const resist = has(turn, 'resistance')
    if (resist) {
      out.push({
        text: phrase(L, 'resistance'), observed: withPause([phrase(L, 'obsQuote', { s: resist.span })]),
        channels: channels(), confidence: 0.55 + boost, category: 'resistance', priority: 'normal'
      })
    }
    if (slow && latZ! >= 2.5 && out.length === 0) {
      const obs = [pauseObs!]
      if (turn.timing.fillers >= 2) obs.push(phrase(L, 'obsFillers', { v: turn.timing.fillers }))
      out.push({
        text: phrase(L, 'hesitation'), observed: obs,
        channels: ['timing'], confidence: 0.5 + (turn.timing.fillers >= 2 ? 0.1 : 0), category: 'hesitation', priority: 'normal'
      })
    }
    return out
  }

  /** Signals that only show over several answers. */
  private trendCandidate(history: AnalyzedTurn[], L: WriteLang): AdviceCandidate | undefined {
    const last = history.slice(-3)
    if (last.length < 3) return undefined
    const shortZ = last.map((t) => z(t, 'words') ?? 0)
    if (shortZ.every((v) => v <= -1.2)) {
      const avg = last.reduce((s, t) => s + t.timing.words, 0) / last.length
      const med = last[last.length - 1].zscores.find((m) => m.metric === 'words')?.median ?? 0
      return {
        text: phrase(L, 'disengagement'), observed: [phrase(L, 'obsShort', { v: fmt(avg), m: fmt(med) })],
        channels: ['timing'], confidence: 0.55, category: 'disengagement', priority: 'normal'
      }
    }
    const interest = last.map((t) => has(t, 'interest')).filter((t): t is Tag => !!t)
    if (interest.length >= 2) {
      return {
        text: phrase(L, 'interest'), observed: interest.map((t) => phrase(L, 'obsInterest', { s: t.span })),
        channels: ['language'], confidence: 0.6, category: 'interest', priority: 'normal'
      }
    }
    return undefined
  }

  async context(req: ContextRequest): Promise<ConversationContext | undefined> {
    if (req.now < 45 || req.transcript.length < 4) return undefined
    const all = foldForMatch(req.transcript.map((u) => u.text).join(' '))
    const type = pickType(all, req.goal)
    const recent = foldForMatch(req.transcript.filter((u) => u.end > req.now - 60).map((u) => u.text).join(' '))
    const recentTurns = req.turns.filter((t) => t.utterance.end > req.now - 60)
    const phase = pickPhase(recent, req.now, recentTurns)
    const roles = ROLES[type]
    return {
      type,
      phase,
      roles: { A: roles[0], B: roles[1] },
      userAim: req.goal ?? '',
      counterpartAim: '',
      tone: /(unacceptable|disappointed|frustrat|neprihvatljiv|razocar|ljut)/.test(all) ? 'tense' : 'formal',
      confidence: 0.5
    }
  }

  async report(req: ReportRequest): Promise<SessionReport> {
    const L = req.writeLang
    const sr = L === 'sr'
    const counts = new Map<Advice['category'], number>()
    for (const a of req.advice) counts.set(a.category, (counts.get(a.category) ?? 0) + 1)
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
    const ctx = req.context
    const summary: string[] = [
      sr
        ? `Trajanje ${clock(req.durationSec)}, jezik: ${req.callLang}, ${req.transcript.length} izjava.`
        : `Duration ${clock(req.durationSec)}, language: ${req.callLang}, ${req.transcript.length} utterances.`
    ]
    if (ctx) {
      summary.push(
        sr
          ? `Tip razgovora: ${TYPE_LABEL.sr[ctx.type]}, završna faza: ${PHASE_LABEL.sr[ctx.phase]}.`
          : `Conversation type: ${TYPE_LABEL.en[ctx.type]}, last phase: ${PHASE_LABEL.en[ctx.phase]}.`
      )
    }
    summary.push(
      sr
        ? `Saveta: ${req.advice.length}${top.length ? ` (najčešće: ${top.map(([c, n]) => `${CATEGORY_LABEL.sr[c]} ×${n}`).join(', ')})` : ''}.`
        : `Advice given: ${req.advice.length}${top.length ? ` (most common: ${top.map(([c, n]) => `${CATEGORY_LABEL.en[c]} ×${n}`).join(', ')})` : ''}.`
    )

    const commitments = req.turns
      .filter((t) => has(t, 'commitment'))
      .map((t) => ({ t: t.utterance.start, text: t.utterance.text }))
    const openQuestions = req.turns
      .filter((t) => t.question && (has(t, 'deflection') || has(t, 'vagueness')))
      .map((t) => t.question!.text)
    const nextTime = top.map(([category]) => phrase(L, `next_${category}`))
    return {
      title: req.title,
      durationSec: req.durationSec,
      callLang: req.callLang,
      summary,
      keyMoments: req.advice.map((a) => ({ t: a.t, text: a.text })),
      commitments,
      openQuestions: [...new Set(openQuestions)],
      nextTime,
      advice: req.advice
    }
  }
}

const TYPE_KEYWORDS: Array<[ConversationType, RegExp]> = [
  ['sales', /\b(pricing|price|license|demo|product|subscription|seats|cen[aeu]|cijen|licenc|proizvod|pretplat)/g],
  ['negotiation', /\b(terms|deal|offer|counter|budget|contract|discount|uslov|dogovor|ponud|budzet|ugovor|popust)/g],
  ['interview', /\b(experience|role|position|salary|candidate|resume|iskustv|pozicij|plat[aeu]|kandidat|radno mesto)/g],
  ['support', /\b(issue|bug|ticket|error|not working|ne radi|greska|kvar|tiket)/g],
  ['conflict', /\b(unacceptable|disappointed|complaint|frustrat|neprihvatljiv|razocar|zalb)/g],
  ['collaboration', /\b(together|partnership|roadmap|plan|zajedno|partnerstv|saradnj)/g],
  ['personal', /\b(family|vacation|weekend|kids|porodic|odmor|vikend|deca|djeca)/g]
]

function pickType(text: string, goal?: string): ConversationType {
  const hay = goal ? `${text} ${foldForMatch(goal)} ${foldForMatch(goal)}` : text
  let best: ConversationType = 'other'
  let bestScore = 1
  for (const [type, re] of TYPE_KEYWORDS) {
    const score = hay.match(re)?.length ?? 0
    if (score > bestScore) {
      best = type
      bestScore = score
    }
  }
  return best
}

function pickPhase(recent: string, now: number, turns: AnalyzedTurn[]): ConversationPhase {
  if (now < 75) return 'opening'
  if (/(next steps|follow up|send (you|over)|talk soon|sledeci koraci|sljedeci koraci|cujemo se|javim|poslacu)/.test(recent)) return 'closing'
  if (/(we agree|deal|let's sign|sounds like a plan|dogovoreno|vazi|potpis|slazem se)/.test(recent)) return 'agreement'
  if (turns.some((t) => has(t, 'resistance') || has(t, 'negative_softener'))) return 'objections'
  if (/(offer|proposal|price|quote|we can do|ponud|cen[aeu]|cijen|mozemo da)/.test(recent)) return 'proposal'
  return 'discovery'
}

const ROLES: Record<ConversationType, [string, string]> = {
  sales: ['seller', 'buyer'],
  negotiation: ['negotiator', 'counterparty'],
  interview: ['interviewer', 'candidate'],
  collaboration: ['partner', 'partner'],
  conflict: ['party', 'party'],
  support: ['support', 'customer'],
  personal: ['you', 'them'],
  other: ['you', 'counterpart']
}
