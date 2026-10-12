import type { Lang, Speaker, Utterance, Word } from '../types'
import { wordCount } from '../analysis/timing'

// Replay input formats.
//
// 1) Text script, one utterance per line; times are estimated:
//      # title: Sales call
//      # lang: en
//      A: Thanks for joining.
//      B: [+2.8] [wpm=110] Well... it's complicated.
//    [+N]     pause before the line, in seconds (default ~0.5 s)
//    [wpm=N]  speaking rate for the line (default A 160, B 150)
//    Speaker labels: A / B, or Ti / Sugovornik, You / Them.
//
// 2) JSON: { "title", "lang", "utterances": [{ "speaker", "text", "start", "end" }] }

export interface Transcript {
  title: string
  lang?: Lang
  utterances: Utterance[]
}

const SPEAKER_ALIASES: Record<string, Speaker> = {
  a: 'A', ti: 'A', ja: 'A', you: 'A', me: 'A', user: 'A',
  b: 'B', sugovornik: 'B', on: 'B', ona: 'B', them: 'B', counterpart: 'B', other: 'B'
}

function spreadWords(text: string, start: number, end: number): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean)
  const step = (end - start) / Math.max(1, tokens.length)
  return tokens.map((w, i) => ({ w, s: start + i * step, e: start + (i + 1) * step }))
}

export function parseScript(source: string, fallbackTitle = 'Replay'): Transcript {
  let title = fallbackTitle
  let lang: Lang | undefined
  const utterances: Utterance[] = []
  let t = 0
  let index = 0
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const meta = /^#\s*(\w+)\s*:\s*(.+)$/.exec(line)
    if (meta) {
      if (meta[1] === 'title') title = meta[2].trim()
      if (meta[1] === 'lang' && (meta[2].trim() === 'en' || meta[2].trim() === 'sr')) lang = meta[2].trim() as Lang
      continue
    }
    if (line.startsWith('#')) continue
    const m = /^([\p{L}]+)\s*:\s*(.*)$/u.exec(line)
    if (!m) continue
    const speaker = SPEAKER_ALIASES[m[1].toLowerCase()]
    if (!speaker) continue
    let text = m[2]
    let gap = 0.45 + ((index * 37) % 30) / 100
    let wpm = speaker === 'A' ? 160 : 150
    for (;;) {
      const opt = /^\[(\+[\d.]+|wpm=\d+)\]\s*/.exec(text)
      if (!opt) break
      if (opt[1].startsWith('+')) gap = Number(opt[1].slice(1))
      else wpm = Number(opt[1].slice(4))
      text = text.slice(opt[0].length)
    }
    if (!text) continue
    const start = index === 0 ? 0.5 : t + gap
    const end = start + Math.max(0.6, (wordCount(text) / wpm) * 60)
    utterances.push({ id: `r${index}`, speaker, text, start, end, words: spreadWords(text, start, end) })
    t = end
    index++
  }
  return { title, lang, utterances }
}

interface JsonTranscript {
  title?: string
  lang?: Lang
  utterances: Array<{ speaker: string; text: string; start: number; end: number }>
}

export function parseJson(source: string, fallbackTitle = 'Replay'): Transcript {
  const data = JSON.parse(source) as JsonTranscript
  if (!Array.isArray(data.utterances)) throw new Error('JSON must contain an "utterances" array')
  const utterances = data.utterances
    .map((u, i): Utterance | undefined => {
      const speaker = SPEAKER_ALIASES[String(u.speaker).toLowerCase()]
      if (!speaker || typeof u.text !== 'string') return undefined
      return { id: `j${i}`, speaker, text: u.text, start: u.start, end: u.end, words: spreadWords(u.text, u.start, u.end) }
    })
    .filter((u): u is Utterance => !!u)
    .sort((a, b) => a.start - b.start)
  return { title: data.title ?? fallbackTitle, lang: data.lang, utterances }
}

export function parseTranscript(source: string, fileName: string): Transcript {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
  return source.trimStart().startsWith('{') ? parseJson(source, base) : parseScript(source, base)
}
