/**
 * Tiny wrappers around the Web Speech API (which Chromium exposes inside
 * Electron's renderer). No external services, no API keys.
 *
 * - `speak(text)` reads a string aloud via speechSynthesis.
 * - `dictate({onFinal, onPartial})` streams live transcription from the mic.
 *
 * Both are feature-detected — calling them on a platform without support
 * throws a clear error the UI can surface.
 */

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speak(text: string, opts: { rate?: number; voice?: string } = {}): void {
  if (!canSpeak()) throw new Error('speechSynthesis not available in this window')
  if (!text || !text.trim()) return
  const synth = window.speechSynthesis
  try {
    // Cancel any in-flight utterance so replies don't pile up.
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = opts.rate ?? 1
    if (opts.voice) {
      const match = synth.getVoices().find((v) => v.name === opts.voice)
      if (match) u.voice = match
    }
    synth.speak(u)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('speak() failed:', e)
  }
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel()
}

interface Dictator {
  stop: () => void
  abort: () => void
}

// Minimal typing for the webkit-prefixed Speech Recognition API.
interface SRAlternative {
  transcript: string
}
interface SRResult {
  0: SRAlternative
  isFinal: boolean
  length: number
}
interface SREvent {
  resultIndex: number
  results: { [i: number]: SRResult; length: number }
}
interface SpeechRecognitionInstance {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((e: SREvent) => void) | null
  onerror: ((e: { error: string; message?: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

export function canDictate(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  )
}

export function dictate(handlers: {
  onFinal: (text: string) => void
  onPartial?: (text: string) => void
  onError?: (err: string) => void
  onEnd?: () => void
  lang?: string
}): Dictator {
  if (!canDictate()) throw new Error('SpeechRecognition not available')
  const Ctor =
    (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance })
      .SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition: new () => SpeechRecognitionInstance })
      .webkitSpeechRecognition
  const rec = new Ctor()
  rec.continuous = true
  rec.interimResults = true
  rec.lang = handlers.lang ?? 'en-US'
  rec.onresult = (e) => {
    let finalText = ''
    let partialText = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]
      const t = r[0].transcript
      if (r.isFinal) finalText += t
      else partialText += t
    }
    if (finalText) handlers.onFinal(finalText)
    if (partialText && handlers.onPartial) handlers.onPartial(partialText)
  }
  rec.onerror = (e) => handlers.onError?.(e.error)
  rec.onend = () => handlers.onEnd?.()
  try {
    rec.start()
  } catch (e) {
    // Chromium throws "InvalidStateError" if start() is called twice in a
    // row or before permission resolves. Surface via onError and no-op.
    handlers.onError?.((e as Error).message || 'failed to start dictation')
  }
  return {
    stop: () => {
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    },
    abort: () => {
      try {
        rec.abort()
      } catch {
        /* ignore */
      }
    }
  }
}
