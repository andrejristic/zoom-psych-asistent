import type { Speaker, Utterance } from '../types'

// Speech-to-text interface. Implementations (Amazon Transcribe first) receive
// 16 kHz mono PCM per speaker stream and report final utterances with times
// in seconds from the start of the call.

export interface STTCallbacks {
  onFinal: (u: Utterance) => void
  /** Interim text while someone is still speaking; used to hold advice while the user talks. */
  onPartial?: (speaker: Speaker, text: string) => void
  onError: (message: string) => void
}

export interface STTProvider {
  readonly id: string
  start(cb: STTCallbacks): Promise<void>
  push(speaker: Speaker, pcm: Buffer): void
  stop(): Promise<void>
}
