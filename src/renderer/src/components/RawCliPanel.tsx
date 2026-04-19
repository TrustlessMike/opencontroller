import { useState } from 'react'
import type { OpenClawCommandResult } from '../../../shared/types'
import PrettyOutput from './PrettyOutput'

/** Free-form openclaw invocation. Paste an arg string, hit run. */
export default function RawCliPanel(): JSX.Element {
  const [cmd, setCmd] = useState('health')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<
    { ok: true; data: OpenClawCommandResult } | { ok: false; error: string } | null
  >(null)

  const run = async (): Promise<void> => {
    if (!cmd.trim() || running) return
    setRunning(true)
    setResult(null)
    const args = cmd
      .trim()
      .match(/(?:[^\s"]+|"[^"]*")+/g)
      ?.map((s) => s.replace(/^"|"$/g, '')) ?? []
    try {
      const res = await window.hermes.runOpenClawCommand(args)
      setResult(res)
    } catch (e) {
      setResult({ ok: false, error: (e as Error).message })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-4 py-3">
        <div className="text-sm font-semibold text-white">Raw CLI</div>
        <div className="text-[10px] text-white/40">
          Any subcommand (without the leading <code>openclaw</code>). Try{' '}
          <code>agents list</code>, <code>health</code>, <code>memory index</code>,{' '}
          <code>channels status</code>.
        </div>
        <div className="mt-2 flex gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5">
            <span className="font-mono text-xs text-white/45">openclaw</span>
            <input
              type="text"
              value={cmd}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run()
              }}
              placeholder="health"
              className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white placeholder:text-white/30 outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="shrink-0 rounded-lg bg-gradient-to-b from-teal-500 to-teal-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {running ? 'Running…' : 'Run'}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!result && !running && (
          <div className="py-10 text-center text-xs text-white/40">
            Hit Enter or click Run.
          </div>
        )}
        {running && (
          <div className="py-10 text-center text-xs text-white/50">running…</div>
        )}
        {result && !result.ok && (
          <pre className="whitespace-pre-wrap rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {result.error}
          </pre>
        )}
        {result && result.ok && (
          <div className="space-y-3 text-[11px]">
            <div className="flex items-center gap-2 text-[10px] text-white/40">
              <span
                className={`rounded px-1.5 py-0.5 font-mono ${
                  result.data.exitCode === 0
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-rose-500/15 text-rose-300'
                }`}
              >
                exit {result.data.exitCode ?? '?'}
              </span>
              <span>{(result.data.durationMs / 1000).toFixed(1)}s</span>
            </div>
            {result.data.stdout.trim() && <PrettyOutput text={result.data.stdout} />}
            {result.data.stderr.trim() && (
              <PrettyOutput text={result.data.stderr} variant="muted" />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
