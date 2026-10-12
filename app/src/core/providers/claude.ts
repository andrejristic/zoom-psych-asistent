import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk'
import { z } from 'zod'
import type { AdviceCandidate, Claim, ConversationContext, SessionReport, Tag, Utterance } from '../types'
import type { AnalyzeRequest, AnalyzeResult, ContextRequest, LLMProvider, ReportRequest, TagRequest, WriteLang } from './llm'
import { clock } from '../advisor/phrases'

// Claude as the analysis backend, through the Anthropic API or Amazon Bedrock.
// Both clients expose the same beta.messages surface; only model IDs differ.

import type { ClaudeModel } from './models'

export interface ClaudeModels {
  /** Per-utterance tagging: must answer in about a second. */
  fast: ClaudeModel
  /** Advice, context and report. */
  deep: ClaudeModel
}

const TAG_TYPES = [
  'hedge', 'assurance', 'distancing', 'deflection', 'vagueness', 'commitment',
  'negative_softener', 'interest', 'resistance'
] as const
const CATEGORIES = [
  'contradiction', 'vagueness', 'assurance', 'deflection', 'distancing', 'hesitation',
  'disengagement', 'interest', 'resistance'
] as const

const TagOut = z.object({
  tags: z.array(z.object({ type: z.enum(TAG_TYPES), span: z.string(), strength: z.number() }))
})

const AnalyzeOut = z.object({
  advice: z.array(
    z.object({
      text: z.string(),
      observed: z.array(z.string()),
      channels: z.array(z.enum(['language', 'timing'])),
      confidence: z.number(),
      category: z.enum(CATEGORIES),
      priority: z.enum(['normal', 'high'])
    })
  ),
  claims: z.array(z.object({ topic: z.string(), value: z.string(), quote: z.string(), t: z.number() }))
})

const ContextOut = z.object({
  type: z.enum(['sales', 'negotiation', 'interview', 'collaboration', 'conflict', 'support', 'personal', 'other']),
  phase: z.enum(['opening', 'discovery', 'proposal', 'objections', 'agreement', 'closing']),
  roleA: z.string(),
  roleB: z.string(),
  userAim: z.string(),
  counterpartAim: z.string(),
  tone: z.enum(['formal', 'friendly', 'tense']),
  confidence: z.number()
})

const ReportOut = z.object({
  summary: z.array(z.string()),
  keyMoments: z.array(z.object({ t: z.number(), text: z.string() })),
  commitments: z.array(z.object({ t: z.number(), text: z.string() })),
  openQuestions: z.array(z.string()),
  nextTime: z.array(z.string())
})

const SYSTEM = `You are a conversation coach that runs beside a live video call. Speaker A is the user you coach. Speaker B is the person they are talking with.

You notice small, concrete signals in what B says and how B answers: hedging, over-assurance, deflection, distancing, vagueness about numbers and dates, statements that contradict earlier ones, rising interest, forming objections, and timing that deviates from B's own baseline (given as z-scores; |z| >= 2 is unusual for this person).

Rules:
- Never say or imply that someone is lying. Describe what does not add up and suggest what A could ask or do next.
- Analyze quotes in their original language and never translate them. Quotes in "observed" must be exact words from the transcript.
- Prefer silence to noise: when the evidence is weak or ambiguous, give no advice. One good tip beats three weak ones.
- Advice is one short, actionable sentence A can use within seconds, at most 20 words, addressed to A as "you" (in Serbian: "ti").
- Judge timing and style against B's own baseline and B's culture, not against a generic norm.`

const langName = (l: WriteLang) => (l === 'sr' ? 'Serbian (Latin script, ekavian)' : 'English')

function line(u: Utterance): string {
  return `[${clock(u.start)}] ${u.speaker}: ${u.text}`
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

type Client = Anthropic | AnthropicBedrockMantle

export class ClaudeProvider implements LLMProvider {
  constructor(
    readonly id: 'anthropic' | 'bedrock',
    private readonly client: Client,
    private readonly models: ClaudeModels
  ) {}

  private model(m: ClaudeModel): string {
    return this.id === 'bedrock' ? `anthropic.${m}` : m
  }

  /** One structured call. Returns undefined on a refusal or an unparsable answer. */
  private async call<T extends z.ZodType>(
    tier: keyof ClaudeModels,
    schema: T,
    user: string,
    effort: 'low' | 'medium',
    maxTokens: number
  ): Promise<z.infer<T> | undefined> {
    const model = this.models[tier]
    // Server-side refusal fallback exists only on the Anthropic API, for these models.
    const fallback = this.id === 'anthropic' && (model === 'claude-sonnet-5-5' || model === 'claude-opus-5-5')
    const res = await this.client.beta.messages.parse({
      model: this.model(model),
      max_tokens: maxTokens,
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
      output_config: { effort, format: betaZodOutputFormat(schema) },
      ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {})
    })
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return undefined
    return (res.parsed_output ?? undefined) as z.infer<T> | undefined
  }

  async tag(req: TagRequest): Promise<Tag[]> {
    // Most utterances are ordinary; only ask Claude when there is something to look at.
    if (!req.lexiconTags.length && !req.question) return req.lexiconTags
    const prompt = [
      req.question ? `A asked: ${req.question.text}` : 'A did not ask a question right before this.',
      `B answered: ${req.utterance.text}`,
      req.lexiconTags.length ? `Phrase-list hits (hints only): ${req.lexiconTags.map((t) => `${t.type} "${t.span}"`).join(', ')}` : '',
      req.context ? `Conversation: ${req.context.type}, phase ${req.context.phase}.` : '',
      '',
      'Tag the signals in B\'s answer. "span" must be an exact substring of B\'s answer. Use "vagueness" when A asked for a number, date or commitment and B gave none. strength is 0..1. Return an empty list when nothing stands out.'
    ]
      .filter(Boolean)
      .join('\n')
    const out = await this.call('fast', TagOut, prompt, 'low', 1500)
    if (!out) return req.lexiconTags
    const text = req.utterance.text.toLowerCase()
    return out.tags
      .filter((t) => t.span && text.includes(t.span.toLowerCase()))
      .map((t) => ({ type: t.type, span: t.span, strength: clamp01(t.strength), source: 'llm' as const }))
  }

  async analyze(req: AnalyzeRequest): Promise<AnalyzeResult> {
    const signals = req.fresh.map((turn) => {
      const z = turn.zscores.map((m) => `${m.metric} ${m.value.toFixed(1)} (usual ${m.median.toFixed(1)}, z ${m.z.toFixed(1)})`).join('; ')
      const tags = turn.tags.map((t) => `${t.type} "${t.span}"`).join(', ')
      return `- [${clock(turn.utterance.start)}] "${turn.utterance.text}"${turn.question ? ` (answer to: "${turn.question.text}")` : ''}\n  timing: ${z || 'baseline not ready'}\n  tags: ${tags || 'none'}`
    })
    const ctx = req.context
    const prompt = [
      ctx ? `Conversation: ${ctx.type}, phase ${ctx.phase}. A is ${ctx.roles.A}, B is ${ctx.roles.B}. Tone: ${ctx.tone}.` : 'Conversation type not known yet.',
      req.goal ? `A's goal: ${req.goal}` : '',
      req.claims.length ? `Concrete claims B made earlier:\n${req.claims.map((c) => `- [${clock(c.t)}] ${c.topic}: ${c.value} ("${c.quote}")`).join('\n')}` : 'No earlier claims recorded.',
      `Recent transcript (seconds from start):\n${req.recent.map(line).join('\n')}`,
      `New answers by B since the last check:\n${signals.join('\n')}`,
      '',
      `Task: decide whether A should get advice right now, about the new answers. Return at most one item in "advice" (or none), written in ${langName(req.writeLang)}. "observed" lists 1-3 short pieces of evidence (exact quotes, pauses in seconds compared with B's usual, earlier statement and its time). Use category "contradiction" with priority "high" only when a new statement conflicts with an earlier claim. confidence is 0..1.`,
      'Also return in "claims" every new concrete claim B made in the new answers (numbers, dates, prices, commitments, facts), with t = start time in seconds.'
    ]
      .filter(Boolean)
      .join('\n\n')
    const out = await this.call('deep', AnalyzeOut, prompt, 'medium', 4000)
    if (!out) return { newClaims: [] }
    const a = out.advice[0]
    const advice: AdviceCandidate | undefined = a && {
      text: a.text,
      observed: a.observed.slice(0, 3),
      channels: a.channels.length ? a.channels : ['language'],
      confidence: clamp01(a.confidence),
      category: a.category,
      priority: a.priority
    }
    const newClaims: Claim[] = out.claims.map((c) => ({ topic: c.topic, value: c.value, quote: c.quote, t: c.t }))
    return { advice, newClaims }
  }

  async context(req: ContextRequest): Promise<ConversationContext | undefined> {
    if (req.now < 45 || req.transcript.length < 4) return undefined
    const recent = req.transcript.filter((u) => u.end > req.now - 300)
    const prompt = [
      req.goal ? `A's own note about the goal: ${req.goal}` : '',
      req.previous ? `Previous estimate: ${req.previous.type}, phase ${req.previous.phase}.` : '',
      `Transcript (last 5 minutes):\n${recent.map(line).join('\n')}`,
      '',
      'Estimate the conversation type, its current phase, the roles of A and B in a few words each, what each side seems to want, and the tone. Write the free-text fields in English. confidence is 0..1.'
    ]
      .filter(Boolean)
      .join('\n\n')
    const out = await this.call('deep', ContextOut, prompt, 'low', 1500)
    if (!out) return undefined
    return {
      type: out.type,
      phase: out.phase,
      roles: { A: out.roleA, B: out.roleB },
      userAim: out.userAim,
      counterpartAim: out.counterpartAim,
      tone: out.tone,
      confidence: clamp01(out.confidence)
    }
  }

  async report(req: ReportRequest): Promise<SessionReport> {
    const prompt = [
      req.context ? `Conversation: ${req.context.type}. A is ${req.context.roles.A}, B is ${req.context.roles.B}.` : '',
      `Advice shown during the call:\n${req.advice.map((a) => `- [${clock(a.t)}] ${a.text}${a.feedback ? ` (A rated it ${a.feedback})` : ''}`).join('\n') || 'none'}`,
      `Full transcript:\n${req.transcript.map(line).join('\n')}`,
      '',
      `Write a short report for A in ${langName(req.writeLang)}: "summary" 2-4 sentences; "keyMoments" the 3-6 moments that mattered (t in seconds); "commitments" what B promised (t in seconds); "openQuestions" questions B did not really answer, quoted as A asked them; "nextTime" 2-4 concrete suggestions for the next conversation. Never claim anyone lied.`
    ]
      .filter(Boolean)
      .join('\n\n')
    const out = await this.call('deep', ReportOut, prompt, 'medium', 8000)
    return {
      title: req.title,
      durationSec: req.durationSec,
      callLang: req.callLang,
      summary: out?.summary ?? [],
      keyMoments: out?.keyMoments ?? [],
      commitments: out?.commitments ?? [],
      openQuestions: out?.openQuestions ?? [],
      nextTime: out?.nextTime ?? [],
      advice: req.advice
    }
  }
}
