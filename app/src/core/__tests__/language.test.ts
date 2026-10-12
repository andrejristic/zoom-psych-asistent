import { describe, expect, it } from 'vitest'
import { foldForMatch, toCyrillic, toLatin } from '../language/srScript'
import { CallLangTracker, detectLang } from '../language/detect'
import { countFillers, scanLexicon } from '../language/lexicons'

describe('srScript', () => {
  it('converts Cyrillic to Latin including digraph letters', () => {
    expect(toLatin('Љубав, њива, џеп, Ђорђе')).toBe('Ljubav, njiva, džep, Đorđe')
  })
  it('converts Latin to Cyrillic and keeps foreign words', () => {
    expect(toCyrillic('Ljubav i Njegoš, džep')).toBe('Љубав и Његош, џеп')
    expect(toCyrillic('Zoom poziv')).toBe('Zoom позив')
  })
  it('round-trips ordinary Serbian text', () => {
    const s = 'Pitanje je ostalo bez odgovora. Vrati se na njega.'
    expect(toLatin(toCyrillic(s))).toBe(s)
  })
  it('folds diacritics for matching', () => {
    expect(foldForMatch('Šta ćeš, đak')).toBe('sta ces, djak')
  })
})

describe('language detection', () => {
  it('detects English and Serbian', () => {
    expect(detectLang('What is the price for this?')).toBe('en')
    expect(detectLang('Koliko bi to koštalo, da li je moguće?')).toBe('sr')
    expect(detectLang('Колико кошта?')).toBe('sr')
  })
  it('recognizes a mixed call', () => {
    const t = new CallLangTracker()
    t.add('Ćao, kako si, da li je sve u redu sa projektom?')
    t.add('Yes, the project is going well and we are on track.')
    t.add('Dobro, onda možemo da pričamo o ceni.')
    t.add('Sure, what do you want to know about the price?')
    expect(t.current).toBe('mixed')
  })
})

describe('lexicons', () => {
  it('finds English phrases and prefers the longer match', () => {
    const tags = scanLexicon("Honestly, that's a good question, I guess it depends.", 'en')
    expect(tags.map((t) => t.type).sort()).toEqual(['assurance', 'deflection', 'deflection', 'hedge'])
  })
  it('finds Serbian phrases regardless of diacritics', () => {
    const tags = scanLexicon('Ma nema problema, iskreno da vam kažem, biće to u redu.', 'sr')
    const spans = tags.map((t) => t.span)
    expect(spans).toContain('iskreno da vam kažem')
    expect(spans).toContain('Ma nema problema')
    expect(spans).not.toContain('iskreno')
  })
  it('counts filler words', () => {
    expect(countFillers('Um, well, uh, that is hard.', 'en')).toBe(2)
    expect(countFillers('Ovaj, pa, ovaj, zavisi.', 'sr')).toBe(2)
  })
})
