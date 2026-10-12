// Shared data model for the analysis engine, main process and UI.

export type Lang = 'en' | 'sr'
export type CallLang = Lang | 'mixed'
export type AdviceLang = 'en' | 'sr-Latn' | 'sr-Cyrl'
export type AdviceLangSetting = 'follow' | AdviceLang

/** A = the user (microphone), B = the counterpart (speaker output). */
export type Speaker = 'A' | 'B'

export interface Word {
  w: string
  s: number
  e: number
}

/** One final STT segment. Times are seconds from the start of the call. */
export interface Utterance {
  id: string
  speaker: Speaker
  text: string
  start: number
  end: number
  lang?: Lang
  words?: Word[]
}

export type TagType =
  | 'hedge'
  | 'assurance'
  | 'distancing'
  | 'deflection'
  | 'vagueness'
  | 'commitment'
  | 'negative_softener'
  | 'interest'
  | 'resistance'
  | 'filler'

export interface Tag {
  type: TagType
  span: string
  strength: number
  source: 'lexicon' | 'rule' | 'llm'
}

export type MetricName = 'latency' | 'wpm' | 'words'

export interface TimingMetrics {
  /** Seconds between the end of A's question and the start of B's answer. */
  latency?: number
  wpm?: number
  words: number
  fillers: number
  answersQuestion: boolean
  interrupted: boolean
}

export interface MetricZ {
  metric: MetricName
  value: number
  z: number
  median: number
}

/** A B-turn after analysis: what was said, how, and what stood out. */
export interface AnalyzedTurn {
  utterance: Utterance
  question?: Utterance
  timing: TimingMetrics
  zscores: MetricZ[]
  tags: Tag[]
}

export type ConversationType =
  | 'sales'
  | 'negotiation'
  | 'interview'
  | 'collaboration'
  | 'conflict'
  | 'support'
  | 'personal'
  | 'other'

export type ConversationPhase =
  | 'opening'
  | 'discovery'
  | 'proposal'
  | 'objections'
  | 'agreement'
  | 'closing'

export interface ConversationContext {
  type: ConversationType
  phase: ConversationPhase
  roles: { A: string; B: string }
  userAim: string
  counterpartAim: string
  tone: 'formal' | 'friendly' | 'tense'
  confidence: number
  /** Set when the user corrected the context by hand; the engine then keeps it. */
  manual?: boolean
}

export type AdviceCategory =
  | 'contradiction'
  | 'vagueness'
  | 'assurance'
  | 'deflection'
  | 'distancing'
  | 'hesitation'
  | 'disengagement'
  | 'interest'
  | 'resistance'

export interface AdviceCandidate {
  text: string
  observed: string[]
  channels: Array<'language' | 'timing'>
  confidence: number
  category: AdviceCategory
  priority: 'normal' | 'high'
}

export interface Advice extends AdviceCandidate {
  id: string
  t: number
  lang: AdviceLang
  provider: string
  feedback?: 'up' | 'down'
}

/** A concrete statement by B that later statements are checked against. */
export interface Claim {
  topic: string
  value: string
  quote: string
  t: number
}

export interface Indicators {
  tempoB?: number
  tempoZ?: number
  latencyB?: number
  latencyZ?: number
  talkShareA: number
  baselineProgress: number
  baselineReady: boolean
}

export interface SessionReport {
  title: string
  durationSec: number
  callLang: CallLang
  summary: string[]
  keyMoments: Array<{ t: number; text: string }>
  commitments: Array<{ t: number; text: string }>
  openQuestions: string[]
  nextTime: string[]
  advice: Advice[]
}

export type EngineEvent =
  | { kind: 'utterance'; utterance: Utterance }
  | { kind: 'turn'; turn: AnalyzedTurn }
  | { kind: 'tags'; utteranceId: string; tags: Tag[] }
  | { kind: 'indicators'; indicators: Indicators }
  | { kind: 'context'; context: ConversationContext }
  | { kind: 'advice'; advice: Advice }
  | { kind: 'lang'; callLang: CallLang; adviceLang: AdviceLang }
  | { kind: 'error'; message: string }
