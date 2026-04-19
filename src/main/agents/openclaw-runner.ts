import { spawn } from 'child_process'

/**
 * Runs ONE openclaw agent turn by shelling out to the real `openclaw` binary.
 * This is the whole point of opencontroller — we don't reimplement provider
 * routing; we drive the actual agent and surface what it did.
 *
 *   openclaw agent --local --agent <id> --message <text> --json
 *
 * The binary emits a single JSON envelope on stdout (sometimes preceded by
 * stderr-like log lines that leak onto stdout). We slice from the first
 * top-level `{` and JSON.parse the rest.
 */

export interface OpenClawAttempt {
  provider: string
  model: string
  result: string
  stage: string
}

export interface OpenClawTurnResult {
  text: string
  durationMs?: number
  livenessState?: string
  stopReason?: string
  winnerProvider?: string
  winnerModel?: string
  attempts: OpenClawAttempt[]
  fallbackUsed: boolean
  runner?: string
  toolsUsed: string[]
  toolCalls?: number
  toolFailures?: number
  thinking?: string
  raw: unknown
}

export interface OpenClawRunOptions {
  agent?: string
  binary?: string
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
  timeoutSeconds?: number
  sessionId?: string
  /** Called once per stderr line while the run is in flight. Use this to
   * stream live progress ("tool: bash", "model: claude-sonnet-4", etc.) to
   * the UI before the final JSON envelope arrives on close. */
  onEvent?: (e: { level: 'info' | 'warn' | 'error' | 'detail'; text: string }) => void
}

export class OpenClawRunError extends Error {
  constructor(
    message: string,
    public stdoutTail: string,
    public stderrTail: string,
    public exitCode: number | null
  ) {
    super(message)
    this.name = 'OpenClawRunError'
  }
}

/**
 * Scan `stdout` for the first balanced JSON object and parse it. Handles
 * leading log lines that contain their own `{` characters (inside strings or
 * structured logs) by trying each candidate start and walking braces with
 * string/escape awareness.
 */
function extractJsonEnvelope(stdout: string): unknown {
  let searchFrom = 0
  while (true) {
    const start = stdout.indexOf('{', searchFrom)
    if (start === -1) throw new Error('no JSON object found in stdout')
    const end = findBalancedEnd(stdout, start)
    if (end !== -1) {
      try {
        return JSON.parse(stdout.slice(start, end + 1))
      } catch {
        // Not parseable — advance past this `{` and try the next candidate.
      }
    }
    searchFrom = start + 1
  }
}

function findBalancedEnd(s: string, start: number): number {
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (escape) {
        escape = false
      } else if (c === '\\') {
        escape = true
      } else if (c === '"') {
        inStr = false
      }
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function tail(s: string, n = 4000): string {
  return s.length <= n ? s : s.slice(-n)
}

export async function runOpenClawTurn(
  message: string,
  opts: OpenClawRunOptions = {}
): Promise<OpenClawTurnResult> {
  const binary = opts.binary ?? 'openclaw'
  const agent = opts.agent ?? 'main'
  const args = ['agent', '--local', '--agent', agent, '--message', message, '--json']
  if (opts.thinking) args.push('--thinking', opts.thinking)
  if (opts.timeoutSeconds) args.push('--timeout', String(opts.timeoutSeconds))
  if (opts.sessionId) args.push('--session-id', opts.sessionId)

  // Ensure common Homebrew / user-local bins are on PATH for the spawned child,
  // since Electron's own env (especially from a packaged .app) can be minimal.
  const augmentedPath = [
    process.env.PATH,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    `${process.env.HOME}/.local/bin`
  ]
    .filter(Boolean)
    .join(':')

  return new Promise<OpenClawTurnResult>((resolve, reject) => {
    const child = spawn(binary, args, {
      env: { ...process.env, PATH: augmentedPath },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let stderrLineBuf = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8')
      stderr += text
      if (opts.onEvent) {
        stderrLineBuf += text
        let nl: number
        while ((nl = stderrLineBuf.indexOf('\n')) !== -1) {
          const line = stderrLineBuf.slice(0, nl).replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()
          stderrLineBuf = stderrLineBuf.slice(nl + 1)
          if (!line) continue
          // Skip the JSON envelope line — only surface human-readable progress.
          if (line.startsWith('{') && line.includes('"meta"')) continue
          const level: 'info' | 'warn' | 'error' | 'detail' = /error|failed/i.test(line)
            ? 'error'
            : /warn/i.test(line)
              ? 'warn'
              : /^(tool|skill|model|provider|attempt|fallback)/i.test(line)
                ? 'detail'
                : 'info'
          try {
            opts.onEvent({ level, text: line })
          } catch {
            // Renderer gone — ignore.
          }
        }
      }
    })

    child.on('error', (err) => {
      reject(
        new OpenClawRunError(
          `failed to spawn ${binary}: ${err.message}`,
          tail(stdout),
          tail(stderr),
          null
        )
      )
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new OpenClawRunError(
            `openclaw agent exited with code ${code}`,
            tail(stdout),
            tail(stderr),
            code
          )
        )
        return
      }
      try {
        // `openclaw agent` writes the JSON envelope to stdout in a TTY, but
        // to stderr when stdout is piped (like we do here). Merge and parse.
        const combined = stdout.length > 0 ? stdout + '\n' + stderr : stderr
        const envelope = extractJsonEnvelope(combined) as {
          payloads?: Array<{ text?: string }>
          meta?: {
            durationMs?: number
            finalAssistantVisibleText?: string
            livenessState?: string
            stopReason?: string
            executionTrace?: {
              winnerProvider?: string
              winnerModel?: string
              attempts?: OpenClawAttempt[]
              fallbackUsed?: boolean
              runner?: string
            }
            toolSummary?: {
              calls?: number
              tools?: string[]
              failures?: number
            }
            requestShaping?: { thinking?: string }
          }
        }
        const meta = envelope.meta ?? {}
        const trace = meta.executionTrace ?? {}
        const text =
          meta.finalAssistantVisibleText ??
          envelope.payloads?.[0]?.text ??
          ''
        resolve({
          text,
          durationMs: meta.durationMs,
          livenessState: meta.livenessState,
          stopReason: meta.stopReason,
          winnerProvider: trace.winnerProvider,
          winnerModel: trace.winnerModel,
          attempts: trace.attempts ?? [],
          fallbackUsed: Boolean(trace.fallbackUsed),
          runner: trace.runner,
          toolsUsed: meta.toolSummary?.tools ?? [],
          toolCalls: meta.toolSummary?.calls,
          toolFailures: meta.toolSummary?.failures,
          thinking: meta.requestShaping?.thinking,
          raw: envelope
        })
      } catch (err) {
        const stdoutPreview = stdout.length === 0 ? '<empty>' : tail(stdout, 800)
        const stderrPreview = stderr.length === 0 ? '<empty>' : tail(stderr, 800)
        reject(
          new OpenClawRunError(
            `failed to parse openclaw JSON envelope: ${(err as Error).message}\n` +
              `--- stdout (${stdout.length} bytes) ---\n${stdoutPreview}\n` +
              `--- stderr (${stderr.length} bytes) ---\n${stderrPreview}`,
            tail(stdout),
            tail(stderr),
            code
          )
        )
      }
    })
  })
}

export async function detectOpenClawBinary(
  binary = 'openclaw'
): Promise<{ ok: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['--version'], { env: process.env })
    let out = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (out += c))
    child.on('error', (e) => resolve({ ok: false, error: e.message }))
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, version: out.trim() })
      else resolve({ ok: false, error: `exit ${code}: ${out}` })
    })
  })
}
