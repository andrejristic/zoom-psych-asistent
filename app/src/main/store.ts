import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type SessionSummary, type Settings } from '../shared/ipc'
import type { SessionReport, Utterance } from '../core/types'

// Local storage under ~/.config/Psych Asistent. Settings never contain API keys;
// keys live only in memory for the lifetime of the app.

const dir = () => app.getPath('userData')
const settingsFile = () => join(dir(), 'settings.json')

export function sessionsDir(): string {
  const d = join(dir(), 'sessions')
  mkdirSync(d, { recursive: true })
  return d
}

export function recordingsDir(): string {
  const d = join(dir(), 'recordings')
  mkdirSync(d, { recursive: true })
  return d
}

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(readFileSync(settingsFile(), 'utf8')) as Partial<Settings>
    return { ...DEFAULT_SETTINGS, ...saved }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): void {
  mkdirSync(dir(), { recursive: true })
  writeFileSync(settingsFile(), JSON.stringify(s, null, 2))
}

export interface StoredSession {
  id: string
  startedAt: string
  report: SessionReport
  transcript: Utterance[]
}

export function saveSession(s: StoredSession): void {
  writeFileSync(join(sessionsDir(), `${s.id}.json`), JSON.stringify(s, null, 2))
}

export function loadSession(id: string): StoredSession | undefined {
  const file = join(sessionsDir(), `${id}.json`)
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, 'utf8')) as StoredSession
}

export function listSessions(): SessionSummary[] {
  return readdirSync(sessionsDir())
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        const s = JSON.parse(readFileSync(join(sessionsDir(), f), 'utf8')) as StoredSession
        return {
          id: s.id,
          title: s.report.title,
          startedAt: s.startedAt,
          durationSec: s.report.durationSec,
          adviceCount: s.report.advice.length
        }
      } catch {
        return undefined
      }
    })
    .filter((s): s is SessionSummary => !!s)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}
