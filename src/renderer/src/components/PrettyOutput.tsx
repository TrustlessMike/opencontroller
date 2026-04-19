/**
 * Pretty-printer for CLI output. Instead of dumping raw text into a <pre>,
 * we strip ANSI, split into lines, and style each line based on simple
 * signal patterns (bullets, warnings, key:value, section headers).
 *
 * Zero deps. Works for 90% of `openclaw …` output without per-command logic.
 */

interface Props {
  text: string
  /** Extra spacing between lines for denser outputs. Default: normal. */
  density?: 'normal' | 'compact'
  /** Variant 'muted' uses slightly dimmer colors — good for stderr. */
  variant?: 'default' | 'muted'
}

const ANSI_RE = /\x1B\[[0-9;]*[A-Za-z]/g

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '')
}

type LineKind =
  | 'header' // "Agents:" "Warnings:" — ends with colon, no leading whitespace
  | 'bullet' // "- Foo: bar"
  | 'kv' //     "Model: ollama/glm-5.1"
  | 'warn' //   starts with Warning / ⚠️ / !
  | 'error' //  starts with Error / ❌
  | 'tip' //    starts with Tip: / Hint:
  | 'url' //    looks like a URL
  | 'blank'
  | 'text'

function classifyLine(raw: string): LineKind {
  const s = raw.trim()
  if (!s) return 'blank'
  if (/^(warning|warn|⚠️|⚠)/i.test(s)) return 'warn'
  if (/^(error|❌|✖)/i.test(s)) return 'error'
  if (/^(tip|hint|note)\s*:/i.test(s)) return 'tip'
  if (/^https?:\/\/\S+$/.test(s)) return 'url'
  if (/^[-•*]\s+/.test(s)) return 'bullet'
  if (/^[A-Z][A-Za-z0-9 _-]{0,40}:$/.test(s) && raw === raw.trimStart()) return 'header'
  if (/^[A-Za-z][A-Za-z0-9 _-]{0,40}:\s/.test(s)) return 'kv'
  return 'text'
}

function splitKv(s: string): [string, string] | null {
  const idx = s.indexOf(':')
  if (idx <= 0) return null
  return [s.slice(0, idx), s.slice(idx + 1).trim()]
}

export default function PrettyOutput({
  text,
  density = 'normal',
  variant = 'default'
}: Props): JSX.Element {
  const lines = stripAnsi(text).replace(/\r/g, '').split('\n')
  const gap = density === 'compact' ? 'space-y-0' : 'space-y-[2px]'
  const baseText = variant === 'muted' ? 'text-white/55' : 'text-white/85'

  return (
    <div className={`rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2.5 font-mono text-[11.5px] leading-[1.55] ${gap} ${baseText}`}>
      {lines.map((raw, i) => {
        const kind = classifyLine(raw)
        if (kind === 'blank') {
          return <div key={i} className="h-2" aria-hidden />
        }
        if (kind === 'header') {
          return (
            <div
              key={i}
              className="mt-2 border-b border-white/[0.06] pb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45"
            >
              {raw.replace(/:$/, '')}
            </div>
          )
        }
        if (kind === 'warn') {
          return (
            <div
              key={i}
              className="rounded border-l-2 border-amber-400/60 bg-amber-400/[0.05] px-2 py-0.5 text-amber-200/95"
            >
              {raw}
            </div>
          )
        }
        if (kind === 'error') {
          return (
            <div
              key={i}
              className="rounded border-l-2 border-rose-400/60 bg-rose-500/[0.06] px-2 py-0.5 text-rose-200/95"
            >
              {raw}
            </div>
          )
        }
        if (kind === 'tip') {
          return (
            <div key={i} className="text-teal-200/80">
              <span className="mr-1 text-teal-300/70">›</span>
              {raw.replace(/^(tip|hint|note)\s*:\s*/i, '')}
            </div>
          )
        }
        if (kind === 'url') {
          return (
            <div key={i} className="break-all text-teal-300/80 underline decoration-dotted">
              {raw}
            </div>
          )
        }
        if (kind === 'bullet') {
          const body = raw.replace(/^\s*[-•*]\s+/, '')
          const indent = raw.length - raw.trimStart().length
          const kv = splitKv(body)
          return (
            <div key={i} className="flex gap-2" style={{ paddingLeft: indent * 4 }}>
              <span className="shrink-0 text-teal-300/60">▸</span>
              {kv ? (
                <span className="min-w-0">
                  <span className="font-semibold text-white/90">{kv[0]}</span>
                  <span className="text-white/35">: </span>
                  <span className="text-white/75">{kv[1]}</span>
                </span>
              ) : (
                <span className="min-w-0 text-white/80">{body}</span>
              )}
            </div>
          )
        }
        if (kind === 'kv') {
          const kv = splitKv(raw)
          if (!kv) return <div key={i}>{raw}</div>
          const indent = raw.length - raw.trimStart().length
          return (
            <div key={i} className="flex gap-2" style={{ paddingLeft: indent * 4 }}>
              <span className="shrink-0 text-white/45">{kv[0]}:</span>
              <span className="min-w-0 text-white/85">{kv[1]}</span>
            </div>
          )
        }
        return (
          <div key={i} className="whitespace-pre-wrap break-words">
            {raw}
          </div>
        )
      })}
    </div>
  )
}
