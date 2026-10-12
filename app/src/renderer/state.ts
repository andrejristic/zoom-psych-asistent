import type {
  Advice,
  AdviceLang,
  AnalyzedTurn,
  CallLang,
  ConversationContext,
  Indicators,
  SessionReport,
  Utterance
} from '../core/types'
import type { MainEvent } from '../shared/ipc'

export interface State {
  status: 'idle' | 'running' | 'finishing'
  mode?: 'replay' | 'live'
  title?: string
  note?: string
  t: number
  utterances: Utterance[]
  turns: Record<string, AnalyzedTurn>
  indicators?: Indicators
  context?: ConversationContext
  advice: Advice[]
  callLang?: CallLang
  adviceLang?: AdviceLang
  levels: { mic: number; speaker: number }
  report?: { report: SessionReport; sessionId: string }
  errors: string[]
  hidden: boolean
}

export const initialState: State = {
  status: 'idle',
  t: 0,
  utterances: [],
  turns: {},
  advice: [],
  levels: { mic: 0, speaker: 0 },
  errors: [],
  hidden: false
}

export type Action =
  | MainEvent
  | { kind: 'feedback'; id: string; rating: 'up' | 'down' | undefined }
  | { kind: 'dismissErrors' }
  | { kind: 'closeReport' }

export function reducer(s: State, a: Action): State {
  switch (a.kind) {
    case 'status':
      if (a.state === 'running') {
        return { ...initialState, status: 'running', mode: a.mode, title: a.title, note: a.note, report: undefined }
      }
      return { ...s, status: a.state }
    case 'time':
      return { ...s, t: a.t }
    case 'utterance':
      return { ...s, utterances: [...s.utterances, a.utterance] }
    case 'turn':
      return { ...s, turns: { ...s.turns, [a.turn.utterance.id]: a.turn } }
    case 'tags': {
      const turn = s.turns[a.utteranceId]
      return turn ? { ...s, turns: { ...s.turns, [a.utteranceId]: { ...turn, tags: a.tags } } } : s
    }
    case 'indicators':
      return { ...s, indicators: a.indicators }
    case 'context':
      return { ...s, context: a.context }
    case 'advice':
      return { ...s, advice: [...s.advice, a.advice] }
    case 'lang':
      return { ...s, callLang: a.callLang, adviceLang: a.adviceLang }
    case 'levels':
      return { ...s, levels: { mic: a.mic, speaker: a.speaker } }
    case 'report':
      return { ...s, report: { report: a.report, sessionId: a.sessionId } }
    case 'visibility':
      return { ...s, hidden: a.hidden }
    case 'error':
      return { ...s, errors: [...s.errors.slice(-4), a.message] }
    case 'feedback':
      return { ...s, advice: s.advice.map((x) => (x.id === a.id ? { ...x, feedback: a.rating } : x)) }
    case 'dismissErrors':
      return { ...s, errors: [] }
    case 'closeReport':
      return { ...s, report: undefined }
  }
}
