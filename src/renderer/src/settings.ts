/**
 * Per-install user preferences persisted to localStorage.
 *
 * These are renderer-only and intentionally NOT mirrored to electron-store:
 * they're about UI behavior (voice, notifications, grounding), not agent
 * identity or secrets.
 */

export interface UserSettings {
  /** Read assistant replies aloud via Web Speech synthesis. */
  tts: boolean
  /** Preferred TTS voice URI (empty = platform default). */
  ttsVoice: string
  /** Speech synthesis rate (0.5 – 2). */
  ttsRate: number
  /** Enable native desktop notifications when a reply completes off-focus. */
  notifications: boolean
  /** Prepend top OpenClaw memory hits to each turn for grounding. */
  grounding: boolean
  /** Show the mic button in the composer. */
  micButton: boolean
}

const KEY = 'oc.settings.v1'

const DEFAULTS: UserSettings = {
  tts: false,
  ttsVoice: '',
  ttsRate: 1,
  notifications: true,
  grounding: false,
  micButton: true
}

let current: UserSettings = load()
const listeners = new Set<(s: UserSettings) => void>()

function load(): UserSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<UserSettings>
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* quota / private mode */
  }
}

export function getSettings(): UserSettings {
  return current
}

export function updateSettings(patch: Partial<UserSettings>): UserSettings {
  current = { ...current, ...patch }
  save()
  listeners.forEach((l) => {
    try {
      l(current)
    } catch {
      /* ignore */
    }
  })
  return current
}

export function subscribeSettings(cb: (s: UserSettings) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
