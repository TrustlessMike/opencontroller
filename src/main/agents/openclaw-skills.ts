import { spawn } from 'child_process'

/**
 * Thin wrappers around `openclaw skills …` so the Electron UI can browse and
 * run the skills already installed on this machine. No reimplementation —
 * we literally shell out to the same binary the user would run themselves.
 */

export interface OpenClawSkill {
  name: string
  description: string
  emoji?: string
  eligible: boolean
  disabled: boolean
  blockedByAllowlist: boolean
  source: string
  bundled: boolean
  homepage?: string
  missing: {
    bins: string[]
    anyBins: string[]
    env: string[]
    config: string[]
    os: string[]
  }
}

export interface OpenClawSkillsList {
  workspaceDir?: string
  managedSkillsDir?: string
  skills: OpenClawSkill[]
}

export interface OpenClawSkillsCheck {
  summary: {
    total: number
    eligible: number
    disabled: number
    blocked: number
    missingRequirements: number
  }
  eligible: string[]
  disabled?: string[]
  blocked?: string[]
  missingRequirements?: Array<{ name: string; missing: OpenClawSkill['missing'] }>
}

function augmentedEnv(): NodeJS.ProcessEnv {
  const augmentedPath = [
    process.env.PATH,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    `${process.env.HOME}/.local/bin`
  ]
    .filter(Boolean)
    .join(':')
  return { ...process.env, PATH: augmentedPath }
}

function runCapturingJson(
  binary: string,
  args: string[]
): Promise<{ json: unknown; stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env: augmentedEnv(), stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => (stdout += c.toString('utf8')))
    child.stderr.on('data', (c) => (stderr += c.toString('utf8')))
    child.on('error', (e) => reject(e))
    child.on('close', (code) => {
      const combined = stdout + '\n' + stderr
      // Use the same balanced-brace extractor used by openclaw-runner.
      try {
        const json = extractFirstJson(combined)
        resolve({ json, stdout, stderr, exitCode: code })
      } catch (e) {
        reject(
          new Error(
            `${binary} ${args.join(' ')} produced no parseable JSON (exit ${code})\n` +
              `stderr tail: ${stderr.slice(-400)}`
          )
        )
      }
    })
  })
}

function extractFirstJson(s: string): unknown {
  let from = 0
  while (true) {
    const start = s.indexOf('{', from)
    const startArr = s.indexOf('[', from)
    const candidate =
      start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr)
    if (candidate === -1) throw new Error('no JSON found')
    const end = findBalancedEnd(s, candidate)
    if (end !== -1) {
      try {
        return JSON.parse(s.slice(candidate, end + 1))
      } catch {
        /* try next */
      }
    }
    from = candidate + 1
  }
}

function findBalancedEnd(s: string, start: number): number {
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let escape = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

export async function listOpenClawSkills(binary = 'openclaw'): Promise<OpenClawSkillsList> {
  const { json } = await runCapturingJson(binary, ['skills', 'list', '--json'])
  return json as OpenClawSkillsList
}

export async function checkOpenClawSkills(binary = 'openclaw'): Promise<OpenClawSkillsCheck> {
  const { json } = await runCapturingJson(binary, ['skills', 'check', '--json'])
  return json as OpenClawSkillsCheck
}

/**
 * `openclaw skills info <name>` prints human-formatted text, not JSON. We
 * capture it raw and surface it to the UI as a <pre> block.
 */
export async function getOpenClawSkillInfo(
  name: string,
  binary = 'openclaw'
): Promise<{ raw: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ['skills', 'info', name], {
      env: augmentedEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let out = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (out += c))
    child.on('error', reject)
    child.on('close', (code) => resolve({ raw: out, exitCode: code }))
  })
}

/**
 * Generic `openclaw` command runner. Spawns `openclaw <args…>`, returns
 * stdout + stderr + exitCode. If the first arg ends with `--json` or if the
 * output contains JSON, we also try to parse it into `data`.
 *
 * This is the backbone of the "full GUI for the full OpenClaw CLI": every
 * command panel (agents list, channels, memory search, cron, tasks, flows,
 * approvals, message, health, doctor, etc.) is one of these.
 */
export interface OpenClawCommandResult {
  args: string[]
  stdout: string
  stderr: string
  exitCode: number | null
  data?: unknown
  durationMs: number
}

const DENYLIST = [
  'configure', // interactive TTY prompts — unfit for spawn
  'uninstall',
  'update' // potentially destructive / network-heavy
]

export async function runOpenClawCommand(
  args: string[],
  opts: { binary?: string; timeoutMs?: number } = {}
): Promise<OpenClawCommandResult> {
  if (args.length === 0) throw new Error('openclaw command requires at least one arg')
  const top = args[0]
  if (DENYLIST.includes(top)) throw new Error(`openclaw ${top} is not allowed from the GUI`)

  const binary = opts.binary ?? 'openclaw'
  const started = Date.now()
  return new Promise<OpenClawCommandResult>((resolve, reject) => {
    const child = spawn(binary, args, {
      env: augmentedEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (c) => (stdout += c.toString('utf8')))
    child.stderr.on('data', (c) => (stderr += c.toString('utf8')))
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill('SIGTERM')
        }, opts.timeoutMs)
      : null
    child.on('error', (e) => {
      if (timer) clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      let data: unknown = undefined
      try {
        data = extractFirstJson(stdout + '\n' + stderr)
      } catch {
        /* not JSON — fine */
      }
      resolve({
        args,
        stdout,
        stderr,
        exitCode: code,
        data,
        durationMs: Date.now() - started
      })
    })
  })
}
