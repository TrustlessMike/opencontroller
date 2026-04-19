import { useState, useRef, useEffect } from 'react'
import type {
  ChatMessage,
  ProviderId,
  AgentTurnResult,
  AgentEvent
} from '../../../shared/types'
import { PROVIDER_LABEL } from './ProviderSelector'
import { canSpeak, canDictate, speak, stopSpeaking, dictate } from '../voice'
import { getSettings, subscribeSettings } from '../settings'
import Icon from './Icon'

interface Props {
  provider: ProviderId
  assistantName?: string
  importSource?: 'openclaw' | 'hermes' | 'manual'
}

type EnrichedMessage = ChatMessage & { trace?: AgentTurnResult }

const STARTERS = [
  'What should I focus on for the next hour?',
  'Turn this messy note into a checklist',
  'Explain this error and suggest the smallest fix'
]

function formatTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(ts)
  )
}

export default function ChatWindow({
  provider,
  assistantName = 'Assistant',
  importSource
}: Props): JSX.Element {
  const [messages, setMessages] = useState<EnrichedMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [liveStatus, setLiveStatus] = useState<string>('')
  const [ttsOn, setTtsOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('oc.ttsOn') === '1'
    } catch {
      return false
    }
  })
  const [listening, setListening] = useState(false)
  const [liveEvents, setLiveEvents] = useState<AgentEvent[]>([])
  const [settings, setSettings] = useState(() => getSettings())
  const dictatorRef = useRef<ReturnType<typeof dictate> | null>(null)
  const inputBaselineRef = useRef<string>('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => subscribeSettings(setSettings), [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  // Persist TTS preference.
  useEffect(() => {
    try {
      localStorage.setItem('oc.ttsOn', ttsOn ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [ttsOn])

  // Auto-speak fresh assistant replies when TTS is on.
  useEffect(() => {
    if (!ttsOn) return
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant' || !last.content) return
    if (!canSpeak()) return
    try {
      speak(last.content, { rate: settings.ttsRate, voice: settings.ttsVoice || undefined })
    } catch {
      /* ignore */
    }
  }, [messages, ttsOn, settings.ttsRate, settings.ttsVoice])

  useEffect(() => {
    return () => {
      stopSpeaking()
      dictatorRef.current?.abort()
    }
  }, [])

  // Global Push-to-Talk: main process sends `ptt:toggle` on Cmd+Ctrl+Space.
  useEffect(() => {
    const unsub = window.hermes.onPushToTalk(() => {
      toggleMic()
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, input])

  const toggleMic = (): void => {
    if (listening) {
      dictatorRef.current?.stop()
      dictatorRef.current = null
      setListening(false)
      return
    }
    if (!canDictate()) {
      // eslint-disable-next-line no-alert
      alert('Voice dictation is unavailable in this window.')
      return
    }
    inputBaselineRef.current = input ? input.trimEnd() + ' ' : ''
    setListening(true)
    try {
      dictatorRef.current = dictate({
        onFinal: (t) => {
          const next = (inputBaselineRef.current + t).trimStart()
          inputBaselineRef.current = next.endsWith(' ') ? next : next + ' '
          setInput(next)
        },
        onPartial: (t) => {
          setInput((inputBaselineRef.current + t).trimStart())
        },
        onError: (err) => {
          // eslint-disable-next-line no-console
          console.warn('dictate error:', err)
          setListening(false)
        },
        onEnd: () => setListening(false)
      })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e)
      setListening(false)
    }
  }

  const agentSource: 'openclaw' | 'hermes' | null =
    importSource === 'openclaw' ? 'openclaw' : importSource === 'hermes' ? 'hermes' : null

  const send = async (): Promise<void> => {
    if (!input.trim() || loading) return
    const userMsg: EnrichedMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      createdAt: Date.now()
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)
    setLiveEvents([])
    setLiveStatus(
      agentSource
        ? `Running ${agentSource === 'openclaw' ? 'openclaw agent --local' : 'hermes chat'}…`
        : ''
    )

    try {
      if (agentSource) {
        // Optional memory grounding: pull top hits and prepend as context.
        let message = userMsg.content
        if (settingsRef.current.grounding && agentSource === 'openclaw') {
          try {
            const hits = await window.hermes.searchMemory(userMsg.content, 3)
            if (hits.ok && hits.data.hits.length > 0) {
              const ctx = hits.data.hits
                .map((h, i) => `[mem ${i + 1}] ${h.text}`)
                .join('\n')
              message = `Context from my memory:\n${ctx}\n\n---\n\n${userMsg.content}`
              setLiveEvents((p) => [
                ...p,
                { level: 'detail', text: `grounded with ${hits.data.hits.length} memory hits` }
              ])
            }
          } catch {
            /* grounding is best-effort */
          }
        }

        // Real agent path: shell out to the actual binary, streaming progress.
        const { result: res } = await window.hermes.runAgentStream(
          { source: agentSource, message },
          (ev) => {
            if (ev.kind === 'line' && ev.text) {
              setLiveEvents((prev) => [
                ...prev.slice(-40),
                { level: ev.level ?? 'info', text: ev.text! }
              ])
              setLiveStatus(ev.text.length > 80 ? ev.text.slice(0, 80) + '…' : ev.text)
            } else if (ev.kind === 'error' && ev.text) {
              setLiveEvents((prev) => [...prev.slice(-40), { level: 'error', text: ev.text! }])
            }
          }
        )
        const replyText = res.error
          ? `${res.error}\n\n${res.text}`.trim()
          : res.text || '(no text)'
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: replyText,
            provider,
            createdAt: Date.now(),
            trace: res
          }
        ])
        // Native desktop notification if enabled + window is hidden/unfocused.
        if (settingsRef.current.notifications && !document.hasFocus()) {
          try {
            await window.hermes.showNotification(
              `${assistantName} replied`,
              replyText.slice(0, 140)
            )
          } catch {
            /* ignore */
          }
        }
      } else {
        // Fallback: direct-to-provider (manual config).
        const res = await window.hermes.sendMessage({
          message: userMsg.content,
          provider,
          history: messages
        })
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: res.content,
            provider: res.provider,
            createdAt: Date.now()
          }
        ])
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${(err as Error).message}`,
          createdAt: Date.now()
        }
      ])
    } finally {
      setLoading(false)
      setLiveStatus('')
      // Keep the event log briefly so the user can see what ran, then fade.
      window.setTimeout(() => setLiveEvents([]), 4000)
    }
  }

  const providerLabel = PROVIDER_LABEL[provider] ?? provider
  const sourceLabel =
    importSource === 'openclaw'
      ? 'OpenClaw'
      : importSource === 'hermes'
        ? 'Hermes Agent'
        : null

  return (
    <div className="chat-panel flex h-full min-h-0 flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-5 sm:px-6">
        {messages.length === 0 && (
          <div className="flex min-h-[min(320px,50vh)] flex-col items-center justify-center px-2 text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-400/20 to-emerald-500/10 ring-1 ring-teal-300/20 shadow-lg shadow-teal-950/30">
              <span className="text-teal-200/90">
                <Icon name="spark" size={22} strokeWidth={1.25} />
              </span>
            </div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-white/50">
              {sourceLabel && (
                <>
                  <span className="text-emerald-400/90">●</span>
                  <span>Imported from {sourceLabel}</span>
                  <span className="text-white/25">·</span>
                </>
              )}
              <span className="text-white/40">{providerLabel}</span>
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Hey — I&apos;m {assistantName}
            </h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/45">
              GUI shell for your local{' '}
              {sourceLabel ?? 'agent'}
              {agentSource && (
                <>
                  . Each turn shells out to{' '}
                  <code className="rounded bg-white/[0.06] px-1 py-0.5 font-mono text-[11px] text-white/70">
                    {agentSource === 'openclaw' ? 'openclaw agent --local' : 'hermes chat -q'}
                  </code>{' '}
                  and shows you what ran: provider, model, tool calls, attempts.
                </>
              )}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setInput(s)
                    inputRef.current?.focus()
                  }}
                  className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-white/70 transition hover:border-white/15 hover:bg-white/[0.07] hover:text-white/90"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-8 text-[11px] text-white/30">
              <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/50">
                ⌘⇧Space
              </kbd>{' '}
              summon / hide ·{' '}
              <kbd className="rounded border border-white/10 bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-white/50">
                Enter
              </kbd>{' '}
              send
            </p>
          </div>
        )}

        {messages.length > 0 && (
          <div className="mx-auto max-w-2xl space-y-4 pb-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`msg-in flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    m.role === 'user'
                      ? 'bg-indigo-500/25 text-indigo-200 ring-1 ring-indigo-400/30'
                      : 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/25'
                  }`}
                >
                  {m.role === 'user' ? 'You' : assistantName.slice(0, 1).toUpperCase()}
                </div>
                <div
                  className={`group min-w-0 max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 text-[13.5px] leading-[1.6] shadow-lg transition-shadow ${
                    m.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-500/25 to-indigo-600/10 text-white ring-1 ring-indigo-400/25 shadow-indigo-950/30'
                      : 'bg-white/[0.05] text-white/92 ring-1 ring-white/[0.07] shadow-black/20 hover:ring-white/[0.1]'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10.5px] text-white/40">
                    <span className="font-medium">
                      {m.role === 'user' ? 'You' : assistantName}
                    </span>
                    <span className="font-normal text-white/25 opacity-60 transition-opacity group-hover:opacity-100">
                      {formatTime(m.createdAt)}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.role === 'assistant' && m.trace && (
                    <div className="mt-2 space-y-1 border-t border-white/[0.06] pt-2 text-[10px] text-white/55">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        <span className="text-emerald-300/80">
                          {m.trace.source === 'openclaw' ? 'openclaw agent' : 'hermes chat'}
                        </span>
                        {m.trace.winnerProvider && (
                          <span>
                            <span className="text-white/35">provider:</span>{' '}
                            {m.trace.winnerProvider}
                          </span>
                        )}
                        {m.trace.winnerModel && (
                          <span>
                            <span className="text-white/35">model:</span> {m.trace.winnerModel}
                          </span>
                        )}
                        {typeof m.trace.durationMs === 'number' && (
                          <span>
                            <span className="text-white/35">took:</span>{' '}
                            {(m.trace.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                        {m.trace.fallbackUsed && (
                          <span className="text-amber-300/90">fallback used</span>
                        )}
                        {m.trace.thinking && m.trace.thinking !== 'off' && (
                          <span>
                            <span className="text-white/35">thinking:</span> {m.trace.thinking}
                          </span>
                        )}
                      </div>
                      {m.trace.toolsUsed && m.trace.toolsUsed.length > 0 && (
                        <div>
                          <span className="text-white/35">tools:</span>{' '}
                          {m.trace.toolsUsed.join(', ')}
                          {typeof m.trace.toolCalls === 'number' && (
                            <span className="text-white/35"> ({m.trace.toolCalls} calls</span>
                          )}
                          {typeof m.trace.toolFailures === 'number' && m.trace.toolFailures > 0 && (
                            <span className="text-rose-300/90">
                              , {m.trace.toolFailures} failed
                            </span>
                          )}
                          {typeof m.trace.toolCalls === 'number' && (
                            <span className="text-white/35">)</span>
                          )}
                        </div>
                      )}
                      {m.trace.attempts && m.trace.attempts.length > 1 && (
                        <div className="text-white/40">
                          {m.trace.attempts.length} provider attempts
                        </div>
                      )}
                      {m.trace.events && m.trace.events.length > 0 && (
                        <div className="mt-1 space-y-0.5 font-mono text-[10px]">
                          {m.trace.events.map((ev, i) => (
                            <div
                              key={i}
                              className={
                                ev.level === 'error'
                                  ? 'text-rose-300/90'
                                  : ev.level === 'warn'
                                    ? 'text-amber-300/90'
                                    : ev.level === 'detail'
                                      ? 'text-white/45'
                                      : 'text-white/60'
                              }
                            >
                              {ev.text}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {m.provider && m.role === 'assistant' && !m.trace && (
                    <div className="mt-2 border-t border-white/[0.06] pt-2 text-[10px] text-white/35">
                      {PROVIDER_LABEL[m.provider] ?? m.provider}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-200 ring-1 ring-emerald-400/25">
                  {assistantName.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 max-w-[min(100%,42rem)] rounded-2xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/[0.06]">
                  <div className="flex items-center gap-2">
                    <span className="chat-dot inline-block h-1.5 w-1.5 rounded-full bg-white/50" />
                    <span className="chat-dot inline-block h-1.5 w-1.5 rounded-full bg-white/50" />
                    <span className="chat-dot inline-block h-1.5 w-1.5 rounded-full bg-white/50" />
                    {liveStatus && (
                      <span className="ml-1 truncate font-mono text-[10px] text-white/50">
                        {liveStatus}
                      </span>
                    )}
                  </div>
                  {liveEvents.length > 0 && (
                    <div className="mt-2 max-h-28 overflow-y-auto border-t border-white/[0.06] pt-2 font-mono text-[10px] leading-snug">
                      {liveEvents.slice(-8).map((ev, i) => (
                        <div
                          key={i}
                          className={
                            ev.level === 'error'
                              ? 'text-rose-300/90'
                              : ev.level === 'warn'
                                ? 'text-amber-300/90'
                                : ev.level === 'detail'
                                  ? 'text-white/45'
                                  : 'text-white/60'
                          }
                        >
                          {ev.text}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="no-drag shrink-0 border-t border-white/[0.06] bg-gradient-to-b from-black/10 to-black/30 p-3 sm:p-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          {canDictate() && settings.micButton && (
            <button
              type="button"
              onClick={toggleMic}
              title={listening ? 'Stop dictation' : 'Dictate (voice to text)'}
              aria-label={listening ? 'Stop dictation' : 'Start dictation'}
              className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
                listening
                  ? 'bg-rose-500/25 text-rose-100 ring-1 ring-rose-400/50'
                  : 'bg-white/[0.05] text-white/70 ring-1 ring-white/[0.08] hover:bg-white/[0.09] hover:text-white'
              }`}
            >
              <Icon name={listening ? 'mic-on' : 'mic'} size={17} />
              {listening && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-400 ring-2 ring-rose-950 animate-pulse" />
              )}
            </button>
          )}
          {canSpeak() && (
            <button
              type="button"
              onClick={() => {
                if (ttsOn) stopSpeaking()
                setTtsOn((v) => !v)
              }}
              title={ttsOn ? 'Stop reading replies aloud' : 'Read replies aloud'}
              aria-label={ttsOn ? 'Disable text-to-speech' : 'Enable text-to-speech'}
              aria-pressed={ttsOn}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
                ttsOn
                  ? 'bg-teal-500/25 text-teal-100 ring-1 ring-teal-400/50'
                  : 'bg-white/[0.05] text-white/70 ring-1 ring-white/[0.08] hover:bg-white/[0.09] hover:text-white'
              }`}
            >
              <Icon name={ttsOn ? 'speaker-on' : 'speaker'} size={17} />
            </button>
          )}
          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={
                listening ? 'Listening…' : `Message ${assistantName}…`
              }
              className="w-full rounded-xl border border-white/[0.1] bg-white/[0.06] px-4 py-3 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-teal-400/35 focus:bg-white/[0.08] focus:ring-1 focus:ring-teal-400/40"
            />
          </div>
          <button
            type="button"
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            aria-label="Send message"
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-b from-teal-500 to-teal-600 px-4 text-sm font-semibold text-white shadow-lg shadow-teal-950/40 transition disabled:cursor-not-allowed disabled:opacity-35 hover:from-teal-400 hover:to-teal-500"
          >
            <span>Send</span>
            <Icon name="send" size={15} />
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-2xl text-center text-[10px] text-white/25">
          {providerLabel} · local agent · dictate · read aloud
        </p>
      </div>
    </div>
  )
}
