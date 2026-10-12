import { describe, expect, it } from 'vitest'
import { conflicts, extractClaims, extractQuantities } from '../analysis/claims'

describe('quantities', () => {
  it('parses numbers, words and ranges', () => {
    expect(extractQuantities('we can do it in three weeks')[0]).toMatchObject({ unit: 'days', min: 21, max: 21 })
    expect(extractQuantities('six to eight weeks')[0]).toMatchObject({ min: 42, max: 56 })
    expect(extractQuantities('za 2-3 meseca')[0]).toMatchObject({ min: 60, max: 90 })
    expect(extractQuantities('dvadeset posto')[0]).toMatchObject({ unit: 'percent', min: 20 })
    expect(extractQuantities('around $50k')[0]).toMatchObject({ unit: 'money', min: 50 })
  })
})

describe('claims', () => {
  it('uses the question to set the topic and detects a conflict', () => {
    const [a] = extractClaims('For a team your size, three weeks.', 10, 'When could you have the integration ready?')
    const [b] = extractClaims('Realistically six to eight weeks.', 200, 'So when would we actually go live?')
    expect(a.topic).toBe('delivery:days')
    expect(b.topic).toBe('delivery:days')
    expect(conflicts(a, b)).toBe(true)
  })
  it('does not flag overlapping ranges', () => {
    const [a] = extractClaims('four weeks', 10, 'When can you deliver?')
    const [b] = extractClaims('three to five weeks', 90, 'When can you deliver?')
    expect(conflicts(a, b)).toBe(false)
  })
})

describe('claim quotes', () => {
  it('keeps the original wording with diacritics', () => {
    const [c] = extractClaims('Isporučimo za četiri nedelje.', 5, 'Kada biste mogli da isporučite?')
    expect(c.quote).toBe('četiri nedelje')
  })
})
