import { spawn } from 'child_process'

/**
 * Runs one Hermes Agent query by shelling out to the real `hermes` CLI in
 * quiet, non-interactive mode:
 *
 *   hermes chat -q <text> -Q [--provider <p>] [--model <m>]
 *
 * Hermes prints a human-styled stream that includes emoji-prefixed status
 * lines (⚠️ ❌ 🔌 🌐 📝 📋 💡) and then either the final answer or an error
 * summary, followed by a `session_id: ...` trailer. We parse those lines into
 * structured events and surface the final text so the UI can render rich
 * "what the agent just did" feedback — including failures.
 */

export interface HermesEvent {
  level: 'info' | 'warn' | 'error' | 'detail'
  text: string
}

export interface HermesTurnResult {
  text: string
  sessionId?: string
  events: HermesEvent[]
  error?: string
  raw: { stdout: string; stderr: string; exitCode: number | null }
}

export class HermesRunError extends Error {
  constructor(
    message: string,
    public stdout: string,
    public stderr: string,
    public exitCode: number | null
  ) {
    super(message)
    this.name = 'HermesRunError'
  }
}

export interface HermesRunOptions {
  binary?: string
  provider?: string
  model?: string
  maxTurns?: number
  yolo?: boolean
}

const STATUS_PREFIX_RE = /^(⚠️|❌|🔌|🌐|📝|📋|💡|🛠|✅|ℹ️)\s?/

function classify(line: string): HermesEvent['level'] {
  if (line.startsWith('❌')) return 'error'
  if (line.startsWith('⚠️')) return 'warn'
  if (line.startsWith('🔌') || line.startsWith('🌐') || line.startsWith('📝') || line.startsWith('📋') || line.startsWith('💡'))
    return 'detail'
  return 'info'
}

function parseOutput(stdout: string): { text: string; sessionId?: string; events: HermesEvent[]; error?: string } {
  const lines = stdout.split(/\r?\n/)
  const events: HermesEvent[] = []
  const textLines: string[] = []
  let sessionId: string | undefined
  let sawError = false

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('session_id:')) {
      sessionId = line.slice('session_id:'.length).trim()
      continue
    }
    if (STATUS_PREFIX_RE.test(line)) {
      const level = classify(line)
      if (level === 'error') sawError = true
      events.push({ level, text: line })
      continue
    }
    textLines.push(raw)
  }

  const text = textLines.join('\n').trim()
  const errorEvent = events.find((e) => e.level === 'error')
  return {
    text,
    sessionId,
    events,
    error: sawError ? errorEvent?.text ?? 'Hermes reported an error' : undefined
  }
}

export async function runHermesTurn(
  message: string,
  opts: HermesRunOptions = {}
): Promise<HermesTurnResult> {
  const binary = opts.binary ?? 'hermes'
  const args = ['chat', '-q', message, '-Q']
  if (opts.provider) args.push('--provider', opts.provider)
  if (opts.model) args.push('-m', opts.model)
  if (opts.maxTurns) args.push('--max-turns', String(opts.maxTurns))
  if (opts.yolo) args.push('--yolo')

  const augmentedPath = [
    process.env.PATH,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    `${process.env.HOME}/.local/bin`
  ]
    .filter(Boolean)
    .join(':')

  return new Promise<HermesTurnResult>((resolve, reject) => {
    const child = spawn(binary, args, {
      env: { ...process.env, PATH: augmentedPath },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => (stdout += c.toString('utf8')))
    child.stderr.on('data', (c) => (stderr += c.toString('utf8')))
    child.on('error', (e) =>
      reject(new HermesRunError(`failed to spawn ${binary}: ${e.message}`, stdout, stderr, null))
    )
    child.on('close', (code) => {
      const parsed = parseOutput(stdout + '\n' + stderr)
      resolve({
        ...parsed,
        raw: { stdout, stderr, exitCode: code }
      })
    })
  })
}

export async function detectHermesBinary(
  binary = 'hermes'
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
