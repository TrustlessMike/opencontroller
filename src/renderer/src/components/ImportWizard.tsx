import { useCallback, useEffect, useState } from 'react'
import type {
  OpenClawConfig,
  HermesConfig,
  AgentInstallScan,
  OpenClawInstallDetection,
  HermesInstallDetection
} from '../../../shared/types'

interface Props {
  /** Shown when startup auto-import from ~/.openclaw / ~/.hermes failed (so you know why you’re still here). */
  bootImportError?: string | null
  onOpenClawImported: (cfg: OpenClawConfig) => void
  onHermesImported: (hermes: HermesConfig, providers: OpenClawConfig) => void
}

const OPENCLAW_REPO = 'https://github.com/openclaw/openclaw'
const HERMES_REPO = 'https://github.com/NousResearch/hermes-agent'
/** Context for the “ambient computer” product shape (third-party). */
const PERPLEXITY_COMPUTER_POST = 'https://www.perplexity.ai/hub/blog/introducing-perplexity-computer'

function openClawHint(d: OpenClawInstallDetection): string {
  if (!d.readable) return 'No ~/.openclaw folder yet.'
  if (!d.found) return 'Folder exists, but no openclaw.json or .env inside.'
  const bits: string[] = []
  if (d.hasJson) bits.push('openclaw.json')
  if (d.hasEnv) bits.push('.env')
  return `Found ${bits.join(' + ')}`
}

function hermesHint(d: HermesInstallDetection): string {
  if (!d.readable) return 'No ~/.hermes folder yet.'
  if (!d.found) return 'Folder exists, but no YAML config or .env.'
  const bits: string[] = []
  if (d.yamlPresent.length) bits.push(...d.yamlPresent)
  if (d.hasEnv) bits.push('.env')
  return `Found ${bits.join(', ')}`
}

export default function ImportWizard({
  bootImportError,
  onOpenClawImported,
  onHermesImported
}: Props): JSX.Element {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [scan, setScan] = useState<AgentInstallScan | null>(null)
  const [scanError, setScanError] = useState<string | null>(null)

  const refresh = useCallback((): void => {
    setScanError(null)
    void window.hermes.detectAgentInstalls().then(setScan).catch((e: Error) => {
      setScanError(e.message)
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const runOpenClaw = async (useDefault: boolean): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      const res = useDefault
        ? await window.hermes.importOpenClawDefault()
        : await window.hermes.importOpenClaw()
      if (!res.success) {
        if (res.error) setError(res.error)
        return
      }
      if (res.config) onOpenClawImported(res.config)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const runHermes = async (useDefault: boolean): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      const res = useDefault
        ? await window.hermes.importHermesDefault()
        : await window.hermes.importHermes()
      if (!res.success) {
        if (res.error) setError(res.error)
        return
      }
      onHermesImported(res.hermes, res.providers)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const oc = scan?.openclaw
  const hm = scan?.hermes

  return (
    <div className="import-wizard no-drag flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-3xl space-y-8">
          <div className="text-center space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-teal-300/80">
              Ambient computer
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Your stack, one shortcut away
            </h1>
            <p className="text-sm text-white/55 max-w-xl mx-auto leading-relaxed">
              We load <code className="text-white/70">~/.openclaw</code> and{' '}
              <code className="text-white/70">~/.hermes</code> automatically when possible. Still
              here? One tap — or pick a folder if you use a custom path. Keys stay on this Mac.
            </p>

            <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center sm:gap-3 max-w-lg mx-auto pt-2">
              <button
                type="button"
                onClick={() => void runOpenClaw(true)}
                disabled={busy}
                className="rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-900/25 disabled:opacity-40 sm:min-w-[200px]"
              >
                Import OpenClaw
                <span className="block text-[11px] font-normal text-cyan-100/90 mt-0.5">
                  ~/.openclaw
                </span>
              </button>
              <button
                type="button"
                onClick={() => void runHermes(true)}
                disabled={busy}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/25 disabled:opacity-40 sm:min-w-[200px]"
              >
                Import Hermes Agent
                <span className="block text-[11px] font-normal text-emerald-100/90 mt-0.5">
                  ~/.hermes
                </span>
              </button>
            </div>
            <p className="text-[11px] text-white/38 text-center pt-1">
              Detection off? Buttons still try the default folders — use Browse in a card if needed.
            </p>

            <div className="flex items-center justify-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => refresh()}
                disabled={busy}
                className="text-xs text-teal-200/90 hover:text-teal-100 underline-offset-2 hover:underline disabled:opacity-40"
              >
                Scan again
              </button>
              {scanError && (
                <span className="text-xs text-amber-300/90">Scan failed: {scanError}</span>
              )}
            </div>
          </div>

          {bootImportError && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-left text-xs text-amber-100/95 whitespace-pre-wrap">
              <span className="font-semibold text-amber-200">Auto-import didn’t finish: </span>
              {bootImportError}
            </div>
          )}

          <p className="text-center text-[11px] font-medium uppercase tracking-[0.15em] text-white/30">
            Details &amp; browse
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* OpenClaw */}
            <article
              className={`group relative rounded-2xl border p-5 text-left transition-colors ${
                oc?.found
                  ? 'border-cyan-400/35 bg-gradient-to-br from-cyan-500/10 via-white/[0.04] to-transparent shadow-[0_0_0_1px_rgba(34,211,238,0.08)]'
                  : 'border-white/[0.08] bg-white/[0.03] hover:border-white/15'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-white">OpenClaw</h2>
                  </div>
                  <p className="mt-2 text-xs text-white/50 leading-relaxed">
                    Imports <code className="text-cyan-200/90">~/.openclaw/openclaw.json</code> and{' '}
                    <code className="text-cyan-200/90">.env</code> — gateway, channels, keys.
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    oc?.found
                      ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30'
                      : oc?.readable
                        ? 'bg-amber-500/15 text-amber-200/90 ring-1 ring-amber-400/25'
                        : 'bg-white/[0.06] text-white/45 ring-1 ring-white/10'
                  }`}
                >
                  {oc?.found ? 'Detected' : oc?.readable ? 'Incomplete' : 'Not found'}
                </span>
              </div>

              <p className="mt-3 font-mono text-[11px] text-white/40 break-all">
                {oc?.rootPath ?? '~/.openclaw'}
              </p>
              <p className="mt-1 text-xs text-white/45">{oc ? openClawHint(oc) : 'Scanning…'}</p>

              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void runOpenClaw(true)}
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-cyan-900/20 disabled:opacity-40"
                >
                  Import from ~/.openclaw
                </button>
                <button
                  type="button"
                  onClick={() => void runOpenClaw(false)}
                  disabled={busy}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/85 hover:bg-white/[0.07] disabled:opacity-40"
                >
                  Choose folder or file…
                </button>
              </div>

              <a
                href={OPENCLAW_REPO}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex text-[11px] text-cyan-300/80 hover:text-cyan-200"
              >
                openclaw/openclaw on GitHub →
              </a>
            </article>

            {/* Hermes */}
            <article
              className={`group relative rounded-2xl border p-5 text-left transition-colors ${
                hm?.found
                  ? 'border-emerald-400/35 bg-gradient-to-br from-emerald-500/10 via-white/[0.04] to-transparent shadow-[0_0_0_1px_rgba(52,211,153,0.08)]'
                  : 'border-white/[0.08] bg-white/[0.03] hover:border-white/15'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-white">Hermes Agent</h2>
                  </div>
                  <p className="mt-2 text-xs text-white/50 leading-relaxed">
                    Imports <code className="text-emerald-200/90">~/.hermes/config.yaml</code> (or{' '}
                    <code className="text-emerald-200/90">cli-config.yaml</code>) +{' '}
                    <code className="text-emerald-200/90">.env</code>.
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    hm?.found
                      ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30'
                      : hm?.readable
                        ? 'bg-amber-500/15 text-amber-200/90 ring-1 ring-amber-400/25'
                        : 'bg-white/[0.06] text-white/45 ring-1 ring-white/10'
                  }`}
                >
                  {hm?.found ? 'Detected' : hm?.readable ? 'Incomplete' : 'Not found'}
                </span>
              </div>

              <p className="mt-3 font-mono text-[11px] text-white/40 break-all">
                {hm?.rootPath ?? '~/.hermes'}
              </p>
              <p className="mt-1 text-xs text-white/45">{hm ? hermesHint(hm) : 'Scanning…'}</p>

              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void runHermes(true)}
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-emerald-900/20 disabled:opacity-40"
                >
                  Import from ~/.hermes
                </button>
                <button
                  type="button"
                  onClick={() => void runHermes(false)}
                  disabled={busy}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-medium text-white/85 hover:bg-white/[0.07] disabled:opacity-40"
                >
                  Choose folder or file…
                </button>
              </div>

              <a
                href={HERMES_REPO}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex text-[11px] text-emerald-300/80 hover:text-emerald-200"
              >
                NousResearch/hermes-agent on GitHub →
              </a>
            </article>
          </div>

          {error && (
            <div className="rounded-xl border border-red-400/25 bg-red-500/[0.12] px-4 py-3 text-center text-sm text-red-200/95">
              {error}
            </div>
          )}

          <div className="text-center space-y-2 text-[11px] text-white/35 max-w-lg mx-auto">
            <p>
              API keys never leave this machine. Normalized config lives in this app&apos;s
              user-data directory.
            </p>
            <p>
              <a
                href={PERPLEXITY_COMPUTER_POST}
                target="_blank"
                rel="noreferrer"
                className="text-white/45 underline-offset-2 hover:text-white/65 hover:underline"
              >
                Perplexity on the ambient computer
              </a>{' '}
              — third-party write-up of the category we&apos;re riffing on; this app is independent
              and imports OpenClaw / Hermes only.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
