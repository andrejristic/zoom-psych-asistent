import type {
  AdviceCandidate,
  AnalyzedTurn,
  CallLang,
  Claim,
  ConversationContext,
  Lang,
  SessionReport,
  Tag,
  Utterance,
  Advice
} from '../types'

// Every AI backend (Demo rules today; Anthropic and AWS Bedrock next) implements
// this interface, so the engine never knows which one it is talking to.

/** Advice text is written in English or Serbian Latin; Cyrillic is converted on output. */
export type WriteLang = 'en' | 'sr'

export interface TagRequest {
  utterance: Utterance
  question?: Utterance
  lang: Lang
  lexiconTags: Tag[]
  context?: ConversationContext
}

export interface AnalyzeRequest {
  now: number
  callLang: CallLang
  writeLang: WriteLang
  goal?: string
  context?: ConversationContext
  /** Last ~2 minutes of the conversation, both speakers. */
  recent: Utterance[]
  /** B-turns that arrived since the previous analysis. */
  fresh: AnalyzedTurn[]
  /** All analyzed B-turns so far (for trends). */
  history: AnalyzedTurn[]
  claims: Claim[]
}

export interface AnalyzeResult {
  advice?: AdviceCandidate
  newClaims: Claim[]
}

export interface ContextRequest {
  transcript: Utterance[]
  now: number
  callLang: CallLang
  goal?: string
  previous?: ConversationContext
  turns: AnalyzedTurn[]
}

export interface ReportRequest {
  transcript: Utterance[]
  turns: AnalyzedTurn[]
  advice: Advice[]
  context?: ConversationContext
  callLang: CallLang
  writeLang: WriteLang
  durationSec: number
  title: string
}

export interface LLMProvider {
  readonly id: string
  tag(req: TagRequest): Promise<Tag[]>
  analyze(req: AnalyzeRequest): Promise<AnalyzeResult>
  context(req: ContextRequest): Promise<ConversationContext | undefined>
  report(req: ReportRequest): Promise<SessionReport>
}
