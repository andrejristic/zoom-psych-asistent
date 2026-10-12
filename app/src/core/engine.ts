import type {
  Advice,
  AdviceLang,
  AdviceLangSetting,
  AnalyzedTurn,
  CallLang,
  Claim,
  ConversationContext,
  EngineEvent,
  Indicators,
  Lang,
  MetricZ,
  SessionReport,
  Tag,
  Utterance
} from './types'
import type { LLMProvider, WriteLang } from './providers/llm'
import { CallLangTracker } from './language/detect'
import { hasCyrillic, toCyrillic, toLatin } from './language/srScript'
import { scanLexicon } from './language/lexicons'
import { SpeakerBaseline, Z_SIGNAL } from './analysis/baseline'
import { measure, talkShareA } from './analysis/timing'
import { AdviceGate, DEFAULT_GATE, type GateOptions } from './advisor/gate'

export interface EngineOptions {
  provider: LLMProvider
  callLang: 'auto' | Lang
  adviceLang: AdviceLangSetting
  goal?: string
  baselineMinSamples?: number
  /** Seconds of call time between deep analyses. */
  analyzeEvery?: number
  /** Seconds of call time between context updates. */
  contextEvery?: number
  gate?: GateOptions
  emit: (ev: EngineEvent) => void
}

let seq = 0
const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`

/**
 * The analysis pipeline for one call. Feed it final utterances (from STT or a
 * replay) and call tick() with the call time; it emits transcript, signals,
 * context and advice events. All work runs through one queue, in order.
 */
export class Engine {
  readonly utterances: Utterance[] = []
  readonly turns: AnalyzedTurn[] = []
  readonly advice: Advice[] = []
  readonly claims: Claim[] = []
  context?: ConversationContext
  callLang: CallLang = 'en'

  private readonly baseline: SpeakerBaseline
  private readonly gate: AdviceGate
  private readonly langTracker = new CallLangTracker()
  private fresh: AnalyzedTurn[] = []
  private lastAnalysis = 0
  private lastContext = 0
  private now = 0
  private queue: Promise<void> = Promise.resolve()
  private adviceLangSent?: AdviceLang
  private pendingType?: ConversationContext['type']
  private userSpeaking = false
  private held?: Advice

  constructor(private readonly opts: EngineOptions) {
    this.baseline = new SpeakerBaseline(opts.baselineMinSamples ?? 8)
    this.gate = new AdviceGate(opts.gate ?? DEFAULT_GATE)
    if (opts.callLang !== 'auto') this.callLang = opts.callLang
  }

  get provider(): LLMProvider {
    return this.opts.provider
  }

  get adviceLang(): AdviceLang {
    const s = this.opts.adviceLang
    if (s !== 'follow') return s
    return this.callLang === 'en' ? 'en' : 'sr-Latn'
  }

  private get writeLang(): WriteLang {
    return this.adviceLang === 'en' ? 'en' : 'sr'
  }

  addUtterance(u: Utterance): Promise<void> {
    return this.enqueue(() => this.handleUtterance(u))
  }

  tick(now: number): Promise<void> {
    return this.enqueue(() => this.handleTick(now))
  }

  /** The user corrected the context; it stays until they change it again. */
  setContext(ctx: ConversationContext): void {
    this.context = { ...ctx, manual: true }
    this.opts.emit({ kind: 'context', context: this.context })
  }

  /**
   * While the user is talking, new advice waits, so it does not appear in the
   * middle of their sentence. Live STT reports this from interim results.
   */
  setUserSpeaking(speaking: boolean): void {
    this.userSpeaking = speaking
    if (!speaking && this.held) {
      const advice = this.held
      this.held = undefined
      this.opts.emit({ kind: 'advice', advice })
    }
  }

  feedback(adviceId: string, rating: 'up' | 'down' | undefined): void {
    const a = this.advice.find((x) => x.id === adviceId)
    if (a) a.feedback = rating
  }

  async finish(title: string): Promise<SessionReport> {
    await this.queue
    if (this.fresh.length) await this.runAnalysis(this.now)
    return this.opts.provider.report({
      transcript: this.utterances,
      turns: this.turns,
      advice: this.advice,
      context: this.context,
      callLang: this.callLang,
      writeLang: this.writeLang,
      durationSec: this.now,
      title
    })
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(job).catch((err: unknown) => {
      this.opts.emit({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    })
    return this.queue
  }

  private langOf(u: Utterance): Lang {
    if (u.lang) return u.lang
    if (this.callLang === 'sr') return 'sr'
    return 'en'
  }

  private updateLang(text: string): Lang | undefined {
    const detected = this.langTracker.add(text)
    if (this.opts.callLang === 'auto') {
      const current = this.langTracker.current
      if (current) this.callLang = current
      else if (detected && this.utterances.length === 0) this.callLang = detected
    }
    if (this.adviceLang !== this.adviceLangSent) {
      this.adviceLangSent = this.adviceLang
      this.opts.emit({ kind: 'lang', callLang: this.callLang, adviceLang: this.adviceLang })
    }
    return detected
  }

  private async handleUtterance(raw: Utterance): Promise<void> {
    const detected = this.updateLang(raw.text)
    const lang = raw.lang ?? (this.callLang === 'mixed' ? detected : undefined) ?? (this.callLang === 'sr' ? 'sr' : detected ?? 'en')
    // Serbian is analyzed in Latin script; STT services return either script.
    const text = lang === 'sr' || hasCyrillic(raw.text) ? toLatin(raw.text) : raw.text
    const u: Utterance = { ...raw, text, lang }
    const prev = this.utterances[this.utterances.length - 1]
    this.utterances.push(u)
    this.now = Math.max(this.now, u.end)
    this.opts.emit({ kind: 'utterance', utterance: u })

    if (u.speaker === 'B') {
      const turn = await this.analyzeTurn(u, prev)
      this.turns.push(turn)
      this.fresh.push(turn)
      this.opts.emit({ kind: 'turn', turn })
      const signal = turn.tags.some((t) => t.type !== 'filler') || turn.zscores.some((m) => Math.abs(m.z) >= Z_SIGNAL)
      if (turn.question && signal) await this.runAnalysis(u.end)
    }
    this.emitIndicators()
  }

  private async analyzeTurn(u: Utterance, prev: Utterance | undefined): Promise<AnalyzedTurn> {
    const lang = this.langOf(u)
    const timing = measure(u, prev, lang)
    const question = prev && prev.speaker === 'A' && timing.answersQuestion ? prev : undefined
    const values: Array<[MetricZ['metric'], number | undefined]> = [
      ['latency', timing.latency],
      ['wpm', timing.wpm],
      ['words', timing.words]
    ]
    const zscores: MetricZ[] = []
    for (const [metric, value] of values) {
      if (value === undefined) continue
      const base = this.baseline.metrics[metric]
      const z = this.baseline.ready ? base.z(value) : 0
      if (this.baseline.ready) zscores.push({ metric, value, z, median: base.median })
      // Outliers stay out of the baseline, so a tense moment does not become "normal".
      if (!this.baseline.ready || Math.abs(z) < Z_SIGNAL) base.add(value)
    }

    const lexiconTags = scanLexicon(u.text, lang)
    let tags: Tag[]
    try {
      tags = await this.opts.provider.tag({ utterance: u, question, lang, lexiconTags, context: this.context })
    } catch (err) {
      tags = lexiconTags
      this.opts.emit({ kind: 'error', message: `tag: ${err instanceof Error ? err.message : String(err)}` })
    }
    return { utterance: u, question, timing, zscores, tags }
  }

  private async handleTick(now: number): Promise<void> {
    this.now = Math.max(this.now, now)
    const every = this.opts.analyzeEvery ?? 15
    if (this.fresh.length && now - this.lastAnalysis >= every) await this.runAnalysis(now)
    // Until the type of conversation is known, look more often.
    const known = this.context && this.context.type !== 'other'
    const ctxEvery = known ? (this.opts.contextEvery ?? 60) : 30
    const due = this.context ? now - this.lastContext >= ctxEvery : now - this.lastContext >= 45
    if (due && !this.context?.manual) await this.runContext(now)
  }

  private async runAnalysis(now: number): Promise<void> {
    const fresh = this.fresh
    this.fresh = []
    this.lastAnalysis = now
    const result = await this.opts.provider.analyze({
      now,
      callLang: this.callLang,
      writeLang: this.writeLang,
      goal: this.opts.goal,
      context: this.context,
      recent: this.utterances.filter((u) => u.end > now - 120),
      fresh,
      history: this.turns,
      claims: this.claims
    })
    this.claims.push(...result.newClaims)
    const c = result.advice
    if (!c || !this.gate.offer(c, now)) return
    const cyr = this.adviceLang === 'sr-Cyrl'
    const advice: Advice = {
      ...c,
      text: cyr ? toCyrillic(c.text) : c.text,
      observed: cyr ? c.observed.map(toCyrillic) : c.observed,
      id: newId('adv'),
      t: now,
      lang: this.adviceLang,
      provider: this.opts.provider.id
    }
    this.advice.push(advice)
    if (this.userSpeaking) this.held = advice
    else this.opts.emit({ kind: 'advice', advice })
  }

  private async runContext(now: number): Promise<void> {
    this.lastContext = now
    const ctx = await this.opts.provider.context({
      transcript: this.utterances,
      now,
      callLang: this.callLang,
      goal: this.opts.goal,
      previous: this.context,
      turns: this.turns
    })
    if (!ctx || this.context?.manual) return
    const prev = this.context
    // Inertia: type changes only when two estimates in a row agree.
    if (prev && prev.type !== 'other' && ctx.type !== prev.type && this.pendingType !== ctx.type) {
      this.pendingType = ctx.type
      this.context = { ...ctx, type: prev.type, roles: prev.roles }
    } else {
      this.pendingType = undefined
      this.context = ctx
    }
    this.opts.emit({ kind: 'context', context: this.context })
  }


  private emitIndicators(): void {
    const lastB = [...this.turns].reverse()
    const tempoTurn = lastB.find((t) => t.timing.wpm !== undefined)
    const latTurn = lastB.find((t) => t.timing.latency !== undefined && t.timing.answersQuestion)
    const indicators: Indicators = {
      tempoB: tempoTurn?.timing.wpm,
      tempoZ: tempoTurn?.zscores.find((m) => m.metric === 'wpm')?.z,
      latencyB: latTurn?.timing.latency,
      latencyZ: latTurn?.zscores.find((m) => m.metric === 'latency')?.z,
      talkShareA: talkShareA(this.utterances, this.now),
      baselineProgress: this.baseline.progress,
      baselineReady: this.baseline.ready
    }
    this.opts.emit({ kind: 'indicators', indicators })
  }
}
