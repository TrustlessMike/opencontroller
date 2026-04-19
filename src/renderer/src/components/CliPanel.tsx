import { useEffect, useState, useCallback } from 'react'
import type { OpenClawCommandResult } from '../../../shared/types'
import PrettyOutput from './PrettyOutput'

interface Props {
  /** Args to pass to `openclaw`, e.g. ['agents','list']. */
  args: string[]
  /** Human title for the panel header. */
  title: string
  /** Subtitle/hint under the title. */
  subtitle?: string
  /** Run automatically on mount. Defaults to true. */
  autoRun?: boolean
  /** Optional transform to render `data` nicely when it parses as JSON. */
  renderData?: (data: unknown) => JSX.Element | null
}

/**
 * Dumbed-down GUI wrapper around `openclaw <args>`. Shows stdout/stderr,
 * parsed JSON (if any), exit code, and duration. A re-run button at top.
 */
export default function CliPanel({
  args,
  title,
  subtitle,
  autoRun = true,
  renderData
}: Props): JSX.Element {
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'running' }
    | { status: 'error'; error: string }
    | { status: 'ok'; result: OpenClawCommandResult }
  >({ status: 'idle' })
  const [showRaw, setShowRaw] = useState(false)

  const run = useCallback(async () => {
    setState({ status: 'running' })
    try {
      const res = await window.hermes.runOpenClawCommand(args)
      if (res.ok) setState({ status: 'ok', result: res.data })
      else setState({ status: 'error', error: res.error })
    } catch (e) {
      setState({ status: 'error', error: (e as Error).message })
    }
  }, [args])

  useEffect(() => {
    if (autoRun) void run()
  }, [autoRun, run])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{title}</div>
            <div className="flex items-center gap-2 text-[10px] text-white/40">
              <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-white/70">
                openclaw {args.join(' ')}
              </code>
              {subtitle && <span>· {subtitle}</span>}
            </div>
          </div>
          {state.status === 'ok' && (
            <span className="text-[10px] text-white/35">
              {(state.result.durationMs / 1000).toFixed(1)}s · exit {state.result.exitCode ?? '?'}
            </span>
          )}
          <button
            type="button"
            onClick={() => void run()}
            disabled={state.status === 'running'}
            className="shrink-0 rounded-lg bg-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-white/80 hover:bg-white/[0.12] disabled:opacity-40"
          >
            {state.status === 'running' ? 'Running…' : 'Re-run'}
          </button>
          {state.status === 'ok' && (
            <button
              type="button"
              onClick={() => setShowRaw((s) => !s)}
              className="shrink-0 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-xs text-white/60 hover:bg-white/[0.1]"
            >
              {showRaw ? 'Hide raw' : 'Show raw'}
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {state.status === 'idle' && (
          <div className="py-8 text-center text-xs text-white/40">Ready.</div>
        )}
        {state.status === 'running' && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-white/50">
            <span className="chat-dot h-1.5 w-1.5 rounded-full bg-white/50" />
            <span className="chat-dot h-1.5 w-1.5 rounded-full bg-white/50" />
            <span className="chat-dot h-1.5 w-1.5 rounded-full bg-white/50" />
            <span>running openclaw {args.join(' ')}…</span>
          </div>
        )}
        {state.status === 'error' && (
          <pre className="whitespace-pre-wrap rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {state.error}
          </pre>
        )}
        {state.status === 'ok' && (
          <>
            {renderData && state.result.data !== undefined && !showRaw && (
              <div className="mb-3">{renderData(state.result.data)}</div>
            )}
            {(!renderData || state.result.data === undefined || showRaw) && (
              <>
                {showRaw ? (
                  <>
                    {state.result.stdout.trim() && (
                      <section className="mb-3">
                        <h4 className="mb-1 text-[10px] uppercase tracking-wider text-white/35">
                          stdout
                        </h4>
                        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg bg-white/[0.04] p-3 text-[11px] text-white/80">
                          {state.result.stdout}
                        </pre>
                      </section>
                    )}
                    {state.result.stderr.trim() && (
                      <section>
                        <h4 className="mb-1 text-[10px] uppercase tracking-wider text-white/35">
                          stderr
                        </h4>
                        <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-lg bg-white/[0.03] p-3 text-[11px] text-white/60">
                          {state.result.stderr}
                        </pre>
                      </section>
                    )}
                  </>
                ) : (
                  <>
                    {state.result.stdout.trim() && (
                      <section className="mb-3">
                        <PrettyOutput text={state.result.stdout} />
                      </section>
                    )}
                    {state.result.stderr.trim() && (
                      <section>
                        <h4 className="mb-1 text-[10px] uppercase tracking-wider text-white/35">
                          stderr
                        </h4>
                        <PrettyOutput text={state.result.stderr} variant="muted" />
                      </section>
                    )}
                  </>
                )}
                {!state.result.stdout.trim() && !state.result.stderr.trim() && (
                  <div className="py-6 text-center text-xs text-white/40">
                    (no output — exit {state.result.exitCode ?? '?'})
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
