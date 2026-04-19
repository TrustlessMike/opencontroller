import { useEffect, useState } from 'react'
import type { ApprovalsSnapshot } from '../../../shared/types'
import Icon from './Icon'

/**
 * Surfaces `openclaw approvals get` — lets the user see what the agent is
 * allowed to do without entering the CLI. Edits are still CLI-driven for now;
 * this is intentionally read-only to avoid shipping a half-baked editor that
 * could silently break the allowlist.
 */
export default function ApprovalsPanel(): JSX.Element {
  const [data, setData] = useState<ApprovalsSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.hermes.getApprovals()
      if (res.ok) setData(res.data)
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-white">Approvals</div>
            <div className="text-[10px] text-white/40">
              What your agent is allowed to do without asking.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/70 hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
          >
            <Icon name="refresh" size={12} />
            <span>{loading ? 'Loading' : 'Refresh'}</span>
          </button>
        </div>
        {data && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-white/55">
            <span
              className={`rounded px-1.5 py-0.5 font-mono ${
                data.exists
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              {data.exists ? 'configured' : 'not set'}
            </span>
            {data.defaults && (
              <span>
                <span className="text-white/35">defaults:</span> {data.defaults}
              </span>
            )}
            <span>
              <span className="text-white/35">allowlist entries:</span> {data.allowlistEntries}
            </span>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error && (
          <pre className="whitespace-pre-wrap rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {error}
          </pre>
        )}
        {data?.raw && (
          <pre className="whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 p-3 font-mono text-[11px] text-white/80">
            {data.raw}
          </pre>
        )}
        <p className="mt-3 text-[10.5px] text-white/40">
          Edit via the CLI: <code className="rounded bg-white/[0.06] px-1 py-0.5">openclaw approvals set</code>
        </p>
      </div>
    </div>
  )
}
