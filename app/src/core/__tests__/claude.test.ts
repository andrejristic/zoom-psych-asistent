import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ClaudeProvider } from '../providers/claude'
import { Engine } from '../engine'
import { parseTranscript } from '../replay/transcript'

// A stand-in for the Anthropic / Bedrock client: records requests and answers
// each structured call by looking at what the prompt asks for.
function fakeClient(log: any[]) {
  return {
    beta: {
      messages: {
        parse: async (params: any) => {
          log.push(params)
          const text: string = params.messages[0].content
          let parsed: any
          if (text.includes('Tag the signals')) parsed = { tags: [{ type: 'deflection', span: "that's a good question", strength: 0.8 }, { type: 'hedge', span: 'not in the text', strength: 0.5 }] }
          else if (text.includes('decide whether A should get advice')) parsed = {
            advice: text.includes('pricing') ? [{ text: 'Go back to the price question.', observed: ['"that\'s a good question"'], channels: ['language', 'timing'], confidence: 1.4, category: 'deflection', priority: 'normal' }] : [],
            claims: []
          }
          else if (text.includes('Estimate the conversation type')) parsed = { type: 'sales', phase: 'proposal', roleA: 'buyer', roleB: 'vendor', userAim: 'pilot', counterpartAim: 'deal', tone: 'formal', confidence: 0.8 }
          else parsed = { summary: ['ok'], keyMoments: [], commitments: [], openQuestions: [], nextTime: [] }
          return { stop_reason: 'end_turn', parsed_output: parsed }
        }
      }
    }
  } as any
}

describe('ClaudeProvider', () => {
  it('runs a whole call and keeps only quotes that exist', async () => {
    const log: any[] = []
    const provider = new ClaudeProvider('anthropic', fakeClient(log), { fast: 'claude-haiku-5-5', deep: 'claude-sonnet-5-5' })
    const src = readFileSync(resolve(__dirname, '../../../resources/demos/en-sales-call.txt'), 'utf8')
    const events: any[] = []
    const engine = new Engine({ provider, callLang: 'auto', adviceLang: 'follow', emit: (e) => events.push(e) })
    for (const u of parseTranscript(src, 'x').utterances) {
      for (let t = Math.ceil(engine['now']); t < u.end; t++) await engine.tick(t)
      await engine.addUtterance(u)
    }
    const report = await engine.finish('x')
    expect(events.filter((e) => e.kind === 'error')).toEqual([])
    expect(engine.advice[0].text).toBe('Go back to the price question.')
    expect(engine.advice[0].confidence).toBe(1)
    expect(engine.context?.type).toBe('sales')
    const priceTurn = engine.turns.find((t) => t.utterance.text.includes("that's a good question"))!
    expect(priceTurn.tags.map((t) => t.span)).toEqual(["that's a good question"])
    expect(report.summary).toEqual(['ok'])
    // Request shape: Haiku for tags, Sonnet with server-side fallback for the rest.
    const tagReq = log.find((p) => p.messages[0].content.includes('Tag the signals'))
    expect(tagReq.model).toBe('claude-haiku-5-5')
    expect(tagReq.fallbacks).toBeUndefined()
    const deepReq = log.find((p) => p.messages[0].content.includes('decide whether'))
    expect(deepReq.model).toBe('claude-sonnet-5-5')
    expect(deepReq.fallbacks).toBe('default')
    expect(deepReq.betas).toEqual(['server-side-fallback-2026-07-01'])
    expect(deepReq.output_config.format).toBeTruthy()
  })

  it('prefixes model IDs on Bedrock and sends no fallback', async () => {
    const log: any[] = []
    const provider = new ClaudeProvider('bedrock', fakeClient(log), { fast: 'claude-haiku-5-5', deep: 'claude-opus-5-5' })
    await provider.context({ transcript: Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, speaker: 'A' as const, text: 'hello', start: i * 10, end: i * 10 + 5 })), now: 60, callLang: 'en', turns: [] })
    expect(log[0].model).toBe('anthropic.claude-opus-5-5')
    expect(log[0].fallbacks).toBeUndefined()
  })

  it('treats a refusal as no answer', async () => {
    const client = { beta: { messages: { parse: async () => ({ stop_reason: 'refusal', parsed_output: null }) } } } as any
    const provider = new ClaudeProvider('anthropic', client, { fast: 'claude-haiku-5-5', deep: 'claude-sonnet-5-5' })
    const r = await provider.analyze({ now: 10, callLang: 'en', writeLang: 'en', recent: [], fresh: [], history: [], claims: [] })
    expect(r).toEqual({ advice: undefined, newClaims: [] })
  })
})
