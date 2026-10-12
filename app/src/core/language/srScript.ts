// Serbian Cyrillic <-> Latin transliteration. Both scripts map one to one,
// except Latin digraphs lj, nj and dž, which are single Cyrillic letters.

const CYR_TO_LAT: Record<string, string> = {
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Ђ: 'Đ', Е: 'E', Ж: 'Ž', З: 'Z', И: 'I',
  Ј: 'J', К: 'K', Л: 'L', Љ: 'Lj', М: 'M', Н: 'N', Њ: 'Nj', О: 'O', П: 'P', Р: 'R',
  С: 'S', Т: 'T', Ћ: 'Ć', У: 'U', Ф: 'F', Х: 'H', Ц: 'C', Ч: 'Č', Џ: 'Dž', Ш: 'Š',
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'đ', е: 'e', ж: 'ž', з: 'z', и: 'i',
  ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', ћ: 'ć', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'č', џ: 'dž', ш: 'š'
}

const LAT_DIGRAPHS: Array<[RegExp, string]> = [
  [/DŽ/g, 'Џ'], [/Dž/g, 'Џ'], [/dž/g, 'џ'],
  [/LJ/g, 'Љ'], [/Lj/g, 'Љ'], [/lj/g, 'љ'],
  [/NJ/g, 'Њ'], [/Nj/g, 'Њ'], [/nj/g, 'њ']
]

const LAT_TO_CYR: Record<string, string> = {}
for (const [cyr, lat] of Object.entries(CYR_TO_LAT)) {
  if (lat.length === 1) LAT_TO_CYR[lat] = cyr
}

export function hasCyrillic(text: string): boolean {
  return /[Ѐ-ӿ]/.test(text)
}

export function toLatin(text: string): string {
  let out = ''
  for (const ch of text) out += CYR_TO_LAT[ch] ?? ch
  return out
}

/**
 * Latin to Cyrillic. Words that look like foreign words or brand names
 * (contain q, w, x, y or a double vowel) are left in Latin, as Serbian writers do.
 */
export function toCyrillic(text: string): string {
  return text.replace(/[\p{L}]+/gu, (word) => {
    if (/[qwxyQWXY]|oo|ee/i.test(word)) return word
    let w = word
    for (const [re, cyr] of LAT_DIGRAPHS) w = w.replace(re, cyr)
    let out = ''
    for (const ch of w) out += LAT_TO_CYR[ch] ?? ch
    return out
  })
}

/** Lowercase, Latin, no diacritics. Used only for matching, never for display. */
export function foldForMatch(text: string): string {
  return toLatin(text)
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/[’`]/g, "'")
}
