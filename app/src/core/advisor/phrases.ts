import type { AdviceCategory, ConversationPhase, ConversationType } from '../types'
import type { WriteLang } from '../providers/llm'

// Fixed wording for the Demo provider and for UI-facing labels produced by the
// engine. Serbian is ekavian Latin; the engine converts it to Cyrillic on request.

type Phrases = Record<string, string>

const EN: Phrases = {
  contradiction: 'Earlier: “{a}”. Now: “{b}”. Ask which one holds.',
  vagueness: 'No concrete answer. Ask for a specific number or date.',
  assurance: 'Strong reassurance without detail. Ask for an example or proof.',
  softener: '“No problem” may hide a concern. Ask what could go wrong.',
  deflection: 'Your question wasn’t answered. Go back to it: “{q}”',
  distancing: 'Responsibility is being pushed away. Ask who exactly decided.',
  hesitation: 'The question caught them off guard. Give them a moment, then ask more concretely.',
  disengagement: 'Answers are getting shorter. Ask what matters most to them.',
  interest: 'Interest is rising. Good moment to propose a next step.',
  resistance: 'An objection is forming. Ask what’s behind it before you answer.',

  obsQuote: '“{s}”',
  obsPause: '{v} s pause before answering (usually {m} s)',
  obsFast: 'answered right away ({v} s)',
  obsShort: 'last answers: {v} words on average (usually {m})',
  obsTempo: 'speaking pace {v} wpm (usually {m})',
  obsFillers: '{v} filler words',
  obsNoNumber: 'question asked for a number or date, answer had none',
  obsEarlier: 'earlier, at {t}: “{s}”',
  obsInterest: 'asking about details: “{s}”',

  next_contradiction: 'Put numbers and dates in writing, and ask which earlier statement still holds.',
  next_deflection: 'Ask the unanswered questions again, early, and wait for a direct answer.',
  next_vagueness: 'Ask for concrete numbers, dates and owners.',
  next_assurance: 'Ask for references or examples instead of reassurance.',
  next_distancing: 'Find out who actually decides, and talk to that person.',
  next_hesitation: 'Send the hard questions ahead of time so they can prepare.',
  next_disengagement: 'Start with what matters most to them, and keep it shorter.',
  next_interest: 'Come with a concrete next step ready to propose.',
  next_resistance: 'Address the concern behind the objection first.'
}

const SR: Phrases = {
  contradiction: 'Ranije: „{a}“. Sada: „{b}“. Pitaj šta od toga važi.',
  vagueness: 'Nema konkretnog odgovora. Traži tačan broj ili datum.',
  assurance: 'Jako uveravanje bez detalja. Traži primer ili dokaz.',
  softener: '„Nema problema“ može da krije brigu. Pitaj šta bi moglo da pođe naopako.',
  deflection: 'Pitanje je ostalo bez odgovora. Vrati se na njega: „{q}“',
  distancing: 'Odgovornost se prebacuje na druge. Pitaj ko je tačno odlučio.',
  hesitation: 'Pitanje je zateklo sugovornika. Sačekaj trenutak, pa pitaj konkretnije.',
  disengagement: 'Odgovori su sve kraći. Pitaj šta je sugovorniku najvažnije.',
  interest: 'Interes raste. Dobar trenutak da predložiš sledeći korak.',
  resistance: 'Javlja se otpor. Pitaj šta stoji iza toga pre nego što odgovoriš.',

  obsQuote: '„{s}“',
  obsPause: 'pauza od {v} s pre odgovora (obično {m} s)',
  obsFast: 'odgovor odmah ({v} s)',
  obsShort: 'poslednji odgovori: prosečno {v} reči (obično {m})',
  obsTempo: 'tempo govora {v} reči/min (obično {m})',
  obsFillers: '{v} poštapalica',
  obsNoNumber: 'pitanje je tražilo broj ili datum, a u odgovoru ga nema',
  obsEarlier: 'ranije, u {t}: „{s}“',
  obsInterest: 'pita za detalje: „{s}“',

  next_contradiction: 'Zapiši brojeve i datume i proveri koja ranija izjava i dalje važi.',
  next_deflection: 'Ponovi neodgovorena pitanja na početku i sačekaj direktan odgovor.',
  next_vagueness: 'Traži konkretne brojeve, datume i ko je odgovoran.',
  next_assurance: 'Umesto uveravanja traži reference ili primere.',
  next_distancing: 'Saznaj ko zaista odlučuje i razgovaraj s tom osobom.',
  next_hesitation: 'Pošalji teža pitanja unapred, da sugovornik može da se pripremi.',
  next_disengagement: 'Počni od onoga što je sugovorniku najvažnije i budi kraći.',
  next_interest: 'Dođi sa spremnim konkretnim sledećim korakom.',
  next_resistance: 'Prvo se pozabavi brigom koja stoji iza prigovora.'
}

export function phrase(lang: WriteLang, key: string, vars: Record<string, string | number> = {}): string {
  const table = lang === 'sr' ? SR : EN
  let text = table[key] ?? EN[key] ?? key
  for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v))
  return text
}

export function clock(t: number): string {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const CATEGORY_LABEL: Record<WriteLang, Record<AdviceCategory, string>> = {
  en: {
    contradiction: 'contradiction', vagueness: 'vagueness', assurance: 'reassurance', deflection: 'deflection',
    distancing: 'distancing', hesitation: 'hesitation', disengagement: 'disengagement', interest: 'interest',
    resistance: 'objection'
  },
  sr: {
    contradiction: 'kontradikcija', vagueness: 'neodređenost', assurance: 'uveravanje', deflection: 'izbegavanje',
    distancing: 'distanciranje', hesitation: 'oklevanje', disengagement: 'gubljenje interesa', interest: 'interes',
    resistance: 'otpor'
  }
}

export const TYPE_LABEL: Record<WriteLang, Record<ConversationType, string>> = {
  en: {
    sales: 'Sales', negotiation: 'Negotiation', interview: 'Interview', collaboration: 'Collaboration',
    conflict: 'Conflict', support: 'Support', personal: 'Personal', other: 'Conversation'
  },
  sr: {
    sales: 'Prodaja', negotiation: 'Pregovori', interview: 'Intervju', collaboration: 'Saradnja',
    conflict: 'Konflikt', support: 'Podrška', personal: 'Privatno', other: 'Razgovor'
  }
}

export const PHASE_LABEL: Record<WriteLang, Record<ConversationPhase, string>> = {
  en: {
    opening: 'opening', discovery: 'discovery', proposal: 'proposal', objections: 'objections',
    agreement: 'agreement', closing: 'closing'
  },
  sr: {
    opening: 'upoznavanje', discovery: 'istraživanje', proposal: 'ponuda', objections: 'prigovori',
    agreement: 'dogovor', closing: 'zatvaranje'
  }
}
