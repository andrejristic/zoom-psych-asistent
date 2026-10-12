import type { Lang, Tag, TagType } from '../types'
import { foldForMatch } from './srScript'

// Phrases are guidance for the analysis, not verdicts. Each category lists
// what people commonly say; the LLM (or the demo rules) decides what it means
// in context. Serbian lists include both ekavian and ijekavian forms.

type Lexicon = Partial<Record<TagType, string[]>>

const EN: Lexicon = {
  hedge: [
    'i guess', 'i think', 'sort of', 'kind of', 'probably', 'roughly', 'more or less',
    'as far as i know', 'i believe', 'maybe', 'somewhere around', 'ballpark', 'should be',
    'hopefully', 'in theory', 'more or less', 'give or take', 'not sure'
  ],
  assurance: [
    'to be honest', 'honestly', 'trust me', 'believe me', 'i swear', 'frankly',
    'to tell you the truth', 'i promise', 'absolutely no problem', 'guaranteed', 'one hundred percent',
    '100 percent', 'i can assure you'
  ],
  distancing: [
    'mistakes were made', 'people say', 'it was decided', 'it was handled', 'they decided',
    'the team decided', 'management decided', 'it happened', 'that was before my time',
    'not my call', 'above my pay grade'
  ],
  deflection: [
    "that's a good question", 'let me get back to you', "it's complicated", 'it depends',
    'we can talk about that later', "let's not get into", 'i would have to check',
    'circle back', "i'm not the right person", 'hard to say', 'different question'
  ],
  commitment: [
    'i will send', "i'll send", 'we will deliver', "we'll deliver", 'i commit', 'we can sign',
    'by friday', 'by monday', 'next week', 'i will', "i'll make sure", 'we will', "i'll check", "i'll get back", "i'll follow up"
  ],
  negative_softener: [
    'no problem at all', 'not a big deal', "it's fine", 'no worries', 'should be fine',
    "shouldn't be a problem", 'nothing to worry about'
  ],
  interest: [
    'how would that work', 'what would it take', 'can you walk me through', 'tell me more',
    'what are the next steps', 'how soon could', 'interesting', 'that sounds good',
    'what does onboarding look like'
  ],
  resistance: [
    'too expensive', 'not in the budget', 'not a priority', "we're not sure", "we'll think about it",
    'send me an email', 'not right now', 'we already have', "i don't see", 'too risky'
  ]
}

const SR: Lexicon = {
  hedge: [
    'valjda', 'otprilike', 'mozda', 'nekako', 'ne znam tacno', 'koliko ja znam', 'mislim da',
    'tamo negde', 'tamo negdje', 'manje vise', 'u principu', 'trebalo bi', 'nadam se',
    'nije sigurno', 'kao neki', 'tako nesto'
  ],
  assurance: [
    'iskreno', 'iskreno da ti kazem', 'iskreno da vam kazem', 'veruj mi', 'vjeruj mi', 'verujte mi',
    'vjerujte mi', 'kunem se', 'stvarno', 'garantujem', 'sto posto', 'sto odsto', 'obecavam',
    'dajem rec', 'dajem rijec'
  ],
  distancing: [
    'to se desilo', 'tako je odluceno', 'ljudi kazu', 'oni su odlucili', 'uprava je odlucila',
    'nije moja odluka', 'to nije do mene', 'tako je ispalo', 'desilo se'
  ],
  deflection: [
    'nego da te pitam', 'nego da vas pitam', 'to je duga prica', 'nije bitno sad', 'nije bitno sada',
    'o tome cemo posle', 'o tome cemo poslije', 'to cemo videti', 'to cemo vidjeti',
    'moram da proverim', 'moram provjeriti', 'zavisi', 'tesko je reci', 'dobro pitanje'
  ],
  commitment: [
    'poslacu', 'posaljem do', 'isporucicemo', 'potpisacemo', 'do petka', 'do ponedeljka',
    'do ponedjeljka', 'sledece nedelje', 'sljedece sedmice', 'obavezujem se', 'sredicu', 'provericu', 'provjericu', 'javicu', 'poslacemo'
  ],
  negative_softener: [
    'ma nema problema', 'ma da', 'nije strasno', 'sve je u redu', 'ne brinite', 'ne brini',
    'bice to u redu', 'bice dobro'
  ],
  interest: [
    'kako bi to islo', 'kako bi to izgledalo', 'sta bi trebalo', 'recite mi vise', 'reci mi vise',
    'koji su sledeci koraci', 'koji su sljedeci koraci', 'zanimljivo', 'to zvuci dobro',
    'koliko brzo biste mogli'
  ],
  resistance: [
    'preskupo', 'nemamo budzet', 'nije prioritet', 'nismo sigurni', 'razmislicemo',
    'posaljite mejl', 'posaljite mail', 'ne sada', 'vec imamo', 'previse rizicno', 'ne vidim'
  ]
}

const FILLERS: Record<Lang, string[]> = {
  en: ['um', 'uh', 'erm', 'hmm', 'uhm'],
  sr: ['ovaj', 'eee', 'mmm', 'hmm', 'ovaaj']
}

interface CompiledEntry {
  type: TagType
  phrase: string
  re: RegExp
}

const compiled = new Map<Lang, CompiledEntry[]>()

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compile(lang: Lang): CompiledEntry[] {
  const cached = compiled.get(lang)
  if (cached) return cached
  const lex = lang === 'en' ? EN : SR
  const entries: CompiledEntry[] = []
  for (const [type, phrases] of Object.entries(lex) as Array<[TagType, string[]]>) {
    for (const phrase of new Set(phrases)) {
      const folded = foldForMatch(phrase)
      entries.push({ type, phrase: folded, re: new RegExp(`(^|[^\\p{L}])${escape(folded)}(?=$|[^\\p{L}])`, 'u') })
    }
  }
  // Longer phrases first, so "iskreno da ti kazem" wins over "iskreno".
  entries.sort((a, b) => b.phrase.length - a.phrase.length)
  compiled.set(lang, entries)
  return entries
}

/** Finds lexicon phrases in a text. Overlapping shorter matches are dropped. */
export function scanLexicon(text: string, lang: Lang): Tag[] {
  const folded = foldForMatch(text)
  const taken: Array<[number, number]> = []
  const tags: Tag[] = []
  for (const entry of compile(lang)) {
    const m = entry.re.exec(folded)
    if (!m) continue
    const start = m.index + m[1].length
    const end = start + entry.phrase.length
    if (taken.some(([s, e]) => start < e && end > s)) continue
    taken.push([start, end])
    tags.push({ type: entry.type, span: text.slice(start, end), strength: 0.5, source: 'lexicon' })
  }
  return tags
}

export function countFillers(text: string, lang: Lang): number {
  const words = foldForMatch(text).split(/[^\p{L}]+/u)
  const fillers = new Set(FILLERS[lang])
  return words.filter((w) => fillers.has(w)).length
}
