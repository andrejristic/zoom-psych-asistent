import type { SessionReport, Utterance } from '../core/types'
import { clock } from '../core/advisor/phrases'
import type { UiLang } from '../shared/ipc'

const LABELS = {
  sr: {
    summary: 'Sažetak', moments: 'Ključni momenti', commitments: 'Obećanja sugovornika',
    open: 'Otvorena pitanja', next: 'Za sledeći razgovor', advice: 'Saveti tokom poziva',
    transcript: 'Transkript', you: 'Ti', them: 'Sugovornik', why: 'Zašto', none: 'Nema.'
  },
  en: {
    summary: 'Summary', moments: 'Key moments', commitments: 'Commitments by the counterpart',
    open: 'Open questions', next: 'For the next conversation', advice: 'Advice during the call',
    transcript: 'Transcript', you: 'You', them: 'Counterpart', why: 'Why', none: 'None.'
  }
}

export function reportMarkdown(r: SessionReport, transcript: Utterance[], lang: UiLang): string {
  const L = LABELS[lang]
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join('\n') : L.none)
  const out = [
    `# ${r.title}`,
    '',
    `## ${L.summary}`,
    list(r.summary),
    '',
    `## ${L.moments}`,
    list(r.keyMoments.map((m) => `**${clock(m.t)}** ${m.text}`)),
    '',
    `## ${L.commitments}`,
    list(r.commitments.map((c) => `**${clock(c.t)}** ${c.text}`)),
    '',
    `## ${L.open}`,
    list(r.openQuestions),
    '',
    `## ${L.next}`,
    list(r.nextTime),
    '',
    `## ${L.advice}`,
    list(
      r.advice.map(
        (a) =>
          `**${clock(a.t)}** ${a.text}${a.feedback ? ` (${a.feedback === 'up' ? '👍' : '👎'})` : ''}\n  ${L.why}: ${a.observed.join('; ')}`
      )
    ),
    '',
    `## ${L.transcript}`,
    ...transcript.map((u) => `**${clock(u.start)} ${u.speaker === 'A' ? L.you : L.them}:** ${u.text}  `)
  ]
  return out.join('\n') + '\n'
}
