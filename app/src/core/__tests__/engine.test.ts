import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../engine'
import { DemoProvider } from '../providers/demo'
import { parseTranscript } from '../replay/transcript'
import type { AdviceLangSetting, EngineEvent } from '../types'

async function run(file: string, adviceLang: AdviceLangSetting = 'follow') {
  const src = readFileSync(resolve(__dirname, '../../../resources/demos', file), 'utf8')
  const transcript = parseTranscript(src, file)
  const events: EngineEvent[] = []
  const engine = new Engine({ provider: new DemoProvider(), callLang: 'auto', adviceLang, emit: (e) => events.push(e) })
  for (const u of transcript.utterances) {
    for (let t = Math.ceil(engine['now']); t < u.end; t++) await engine.tick(t)
    await engine.addUtterance(u)
  }
  const report = await engine.finish(transcript.title)
  return { engine, events, report, transcript }
}

describe('transcript parser', () => {
  it('parses the script format with pauses and rates', () => {
    const t = parseTranscript('# title: X\n# lang: en\nA: Hello there?\nB: [+2.5] [wpm=100] Well, hi.', 'x.txt')
    expect(t.title).toBe('X')
    expect(t.utterances).toHaveLength(2)
    expect(t.utterances[1].start - t.utterances[0].end).toBeCloseTo(2.5)
  })
})

describe('engine with demo provider', () => {
  it('finds the planted moments in the English call', async () => {
    const { engine, events, report } = await run('en-sales-call.txt')
    const categories = engine.advice.map((a) => a.category)
    expect(engine.callLang).toBe('en')
    expect(categories).toContain('contradiction')
    expect(categories).toContain('deflection')
    expect(categories).toContain('distancing')
    expect(engine.context?.type).toBe('sales')
    expect(events.some((e) => e.kind === 'indicators' && e.indicators.baselineReady)).toBe(true)
    const contradiction = engine.advice.find((a) => a.category === 'contradiction')!
    expect(contradiction.text).toContain('three weeks')
    expect(contradiction.text).toContain('six to eight weeks')
    // Gate: normal tips at least 30 s apart.
    const normal = engine.advice.filter((a) => a.priority === 'normal')
    for (let i = 1; i < normal.length; i++) expect(normal[i].t - normal[i - 1].t).toBeGreaterThanOrEqual(30)
    expect(report.openQuestions.length).toBeGreaterThan(0)
    expect(events.filter((e) => e.kind === 'error')).toEqual([])
  })

  it('works in Serbian and writes advice in Cyrillic on request', async () => {
    const { engine } = await run('sr-pregovori.txt', 'sr-Cyrl')
    expect(engine.callLang).toBe('sr')
    const categories = engine.advice.map((a) => a.category)
    expect(categories).toContain('contradiction')
    expect(categories).toContain('deflection')
    expect(engine.advice.every((a) => /[Ѐ-ӿ]/.test(a.text))).toBe(true)
  })

  it('follows the call language for advice', async () => {
    const { engine } = await run('sr-pregovori.txt')
    expect(engine.adviceLang).toBe('sr-Latn')
    expect(engine.advice[0].text).toMatch(/[a-zčćšžđ]/i)
  })
})
