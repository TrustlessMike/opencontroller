import { useEffect, useState } from 'react'
import type { SessionSummary } from '../../../shared/types'
import Icon from './Icon'

/**
 * Reads `~/.openclaw/agents/main/sessions/sessions.json` via IPC and renders
 * a scrollable history list with token + cost summary. Read-only for now —
 * we'll add "resume session" once the CLI has a `--session-id` flag we can
 * thread through runOpenClawTurn.
 */
export default function SessionsPanel(): JSX.Element {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.hermes.listSessions()
      if (res.ok) setSessions(res.data)
      else setError(res.error)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const total = sessions?.reduce(
    (acc, s) => {
      acc.inp += s.inputTokens ?? 0
      acc.out += s.outputTokens ?? 0
      acc.cost += s.estimatedCostUsd ?? 0
      return acc
    },
    { inp: 0, out: 0, cost: 0 }
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-white">Sessions</div>
            <div className="text-[10px] text-white/40">
              OpenClaw agent history · ~/.openclaw/agents/main/sessions
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/70 hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
          >
            <Icon name="refresh" size={12} />
            <span>{loading ? 'Loading' : 'Refresh'}</span>
          </button>
        </div>
        {sessions && total && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-white/50">
            <span>{sessions.length} sessions</span>
            {total.inp > 0 && <span>{total.inp.toLocaleString()} input tokens</span>}
            {total.out > 0 && <span>{total.out.toLocaleString()} output tokens</span>}
            {total.cost > 0 && <span>${total.cost.toFixed(2)} est.</span>}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error && (
          <pre className="whitespace-pre-wrap rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {error}
          </pre>
        )}
        {!error && sessions && sessions.length === 0 && (
          <div className="py-10 text-center text-xs text-white/40">No sessions recorded yet.</div>
        )}
        {sessions && sessions.length > 0 && (
          <ul className="space-y-1.5">
            {sessions.slice(0, 100).map((s) => (
              <li
                key={s.id}
                className="group rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 hover:border-white/[0.12] hover:bg-white/[0.05]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="min-w-0 truncate text-[12px] font-medium text-white/85">
                    {s.label ?? s.id}
                  </div>
                  <div className="shrink-0 font-mono text-[10px] text-white/35">
                    {s.lastActivity
                      ? new Date(s.lastActivity).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })
                      : ''}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/45">
                  {s.modelProvider && (
                    <span>
                      <span className="text-white/30">provider:</span> {s.modelProvider}
                    </span>
                  )}
                  {s.model && (
                    <span>
                      <span className="text-white/30">model:</span> {s.model}
                    </span>
                  )}
                  {typeof s.inputTokens === 'number' && (
                    <span>
                      <span className="text-white/30">in:</span>{' '}
                      {s.inputTokens.toLocaleString()}
                    </span>
                  )}
                  {typeof s.outputTokens === 'number' && (
                    <span>
                      <span className="text-white/30">out:</span>{' '}
                      {s.outputTokens.toLocaleString()}
                    </span>
                  )}
                  {typeof s.estimatedCostUsd === 'number' && s.estimatedCostUsd > 0 && (
                    <span className="text-emerald-300/80">
                      ${s.estimatedCostUsd.toFixed(3)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
