import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import type { OpenClawConfig, ProviderId, ProviderConfig } from '../../shared/types'
import { mainStore } from '../store-instance'

/**
 * Maps OpenClaw env var names → our normalized ProviderId.
 * Source: https://github.com/openclaw/openclaw .env.example
 */
const OPENCLAW_ENV_TO_PROVIDER: Record<string, ProviderId> = {
  OPENAI_API_KEY: 'openai',
  OPENCLAW_LIVE_OPENAI_KEY: 'openai',
  ANTHROPIC_API_KEY: 'anthropic',
  OPENCLAW_LIVE_ANTHROPIC_KEY: 'anthropic',
  GEMINI_API_KEY: 'gemini',
  GOOGLE_API_KEY: 'gemini',
  OPENCLAW_LIVE_GEMINI_KEY: 'gemini',
  OPENROUTER_API_KEY: 'openrouter',
  ZAI_API_KEY: 'zai',
  AI_GATEWAY_API_KEY: 'ai-gateway',
  MINIMAX_API_KEY: 'minimax',
  SYNTHETIC_API_KEY: 'synthetic'
}

const KNOWN_PROVIDER_IDS: ProviderId[] = [
  'anthropic',
  'openai',
  'gemini',
  'openrouter',
  'minimax',
  'nous',
  'nous-api',
  'openai-codex',
  'copilot',
  'zai',
  'kimi-coding',
  'kimi-cn',
  'minimax-cn',
  'huggingface',
  'xiaomi',
  'arcee',
  'ollama-cloud',
  'kilocode',
  'ai-gateway',
  'custom',
  'synthetic'
]

/**
 * OpenClaw config `env` block: flat string keys plus optional `vars` object.
 * @see https://docs.openclaw.ai/gateway/configuration
 */
function collectEnvBlock(env: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!env || typeof env !== 'object') return out
  const o = env as Record<string, unknown>
  for (const [k, v] of Object.entries(o)) {
    if (k === 'shellEnv' || k === 'vars') continue
    if (typeof v === 'string' && v.length > 0) out[k] = v
  }
  const vars = o.vars as Record<string, unknown> | undefined
  if (vars && typeof vars === 'object') {
    for (const [k, v] of Object.entries(vars)) {
      if (typeof v === 'string' && v.length > 0) out[k] = v
    }
  }
  return out
}

function substituteEnvVars(s: string, envLookup: Record<string, string | undefined>): string {
  return s.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_m, name: string) => {
    const v = envLookup[name]
    return v != null && v !== '' ? v : ''
  })
}

function resolveCredentialString(
  v: unknown,
  envLookup: Record<string, string | undefined>
): string | undefined {
  if (typeof v === 'string') {
    const s = substituteEnvVars(v, envLookup)
    return s.length > 0 ? s : undefined
  }
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  if (o.source === 'env' && typeof o.id === 'string') {
    const val = envLookup[o.id]
    return val != null && val !== '' ? val : undefined
  }
  return undefined
}

function mapOpenClawProviderSlug(slug: string): ProviderId | undefined {
  const k = slug.toLowerCase().replace(/_/g, '-')
  const aliases: Record<string, ProviderId> = {
    anthropic: 'anthropic',
    claude: 'anthropic',
    openai: 'openai',
    google: 'gemini',
    gemini: 'gemini',
    openrouter: 'openrouter',
    zai: 'zai',
    minimax: 'minimax',
    'minimax-cn': 'minimax-cn',
    nous: 'nous',
    'nous-api': 'nous-api',
    huggingface: 'huggingface',
    xiaomi: 'xiaomi',
    arcee: 'arcee',
    ollama: 'custom',
    custom: 'custom',
    synthetic: 'synthetic',
    'ai-gateway': 'ai-gateway',
    'ollama-cloud': 'ollama-cloud',
    kilocode: 'kilocode',
    groq: 'openai',
    cerebras: 'openai',
    deepseek: 'openai'
  }
  if (aliases[k]) return aliases[k]
  if ((KNOWN_PROVIDER_IDS as string[]).includes(k)) return k as ProviderId
  return undefined
}

function splitModelRef(ref: string): { providerId: ProviderId; model?: string } | undefined {
  const idx = ref.indexOf('/')
  if (idx <= 0) return undefined
  const slug = ref.slice(0, idx).trim()
  const modelPart = ref.slice(idx + 1).trim()
  const providerId = mapOpenClawProviderSlug(slug)
  if (!providerId) return undefined
  return { providerId, model: modelPart || undefined }
}

function parsePrimaryModelRef(
  raw: Record<string, unknown>
): { providerId: ProviderId; model?: string } | undefined {
  const agents = raw.agents as Record<string, unknown> | undefined
  const defaults = agents?.defaults as Record<string, unknown> | undefined
  const modelBlock = defaults?.model as Record<string, unknown> | undefined
  const primary = modelBlock?.primary
  if (typeof primary === 'string' && primary.includes('/')) {
    const parsed = splitModelRef(primary)
    if (parsed) return parsed
  }
  const agent = raw.agent as Record<string, unknown> | undefined
  const agentModel = agent?.model
  if (typeof agentModel === 'string' && agentModel.includes('/')) {
    const parsed = splitModelRef(agentModel)
    if (parsed) return parsed
  }
  const legacyModel = raw.model as Record<string, unknown> | undefined
  if (legacyModel?.provider) {
    const id = mapOpenClawProviderSlug(String(legacyModel.provider))
    if (id)
      return {
        providerId: id,
        model: typeof legacyModel.default === 'string' ? legacyModel.default : undefined
      }
  }
  return undefined
}

function ingestModelsProviders(
  raw: Record<string, unknown>,
  providers: Partial<Record<ProviderId, ProviderConfig>>,
  envLookup: Record<string, string | undefined>
): void {
  const models = raw.models as Record<string, unknown> | undefined
  const mp = models?.providers as Record<string, unknown> | undefined
  if (!mp) return
  for (const [key, specUnknown] of Object.entries(mp)) {
    const id = mapOpenClawProviderSlug(key)
    if (!id || !specUnknown || typeof specUnknown !== 'object') continue
    const spec = specUnknown as Record<string, unknown>
    const apiKey = resolveCredentialString(spec.apiKey, envLookup)
    const baseUrlRaw = spec.baseUrl
    const baseUrl =
      typeof baseUrlRaw === 'string'
        ? substituteEnvVars(baseUrlRaw, envLookup) || undefined
        : undefined
    const model = typeof spec.model === 'string' ? spec.model : undefined
    if (apiKey || (id === 'custom' && baseUrl)) {
      providers[id] = {
        ...providers[id],
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {})
      }
    }
  }
}

function ingestLegacyTopLevelProviders(
  raw: Record<string, unknown>,
  providers: Partial<Record<ProviderId, ProviderConfig>>,
  envLookup: Record<string, string | undefined>
): void {
  const lp = raw.providers as Record<string, unknown> | undefined
  if (!lp) return
  for (const [key, specUnknown] of Object.entries(lp)) {
    const id = mapOpenClawProviderSlug(key)
    if (!id || !specUnknown || typeof specUnknown !== 'object') continue
    const spec = specUnknown as Record<string, unknown>
    const apiKey =
      typeof spec.apiKey === 'string'
        ? substituteEnvVars(spec.apiKey, envLookup) || undefined
        : undefined
    const baseUrl =
      typeof spec.baseUrl === 'string'
        ? substituteEnvVars(spec.baseUrl, envLookup) || undefined
        : undefined
    const model = typeof spec.model === 'string' ? spec.model : undefined
    const token =
      typeof spec.token === 'string'
        ? substituteEnvVars(spec.token, envLookup) || undefined
        : undefined
    if (apiKey || token || (id === 'custom' && baseUrl)) {
      providers[id] = {
        ...providers[id],
        ...(apiKey ? { apiKey } : {}),
        ...(baseUrl ? { baseUrl } : {}),
        ...(model ? { model } : {}),
        ...(token ? { token } : {})
      }
    }
  }
}

/**
 * Parse a dotenv file. Handles `KEY=value`, quoted values, and `#` comments.
 * Purposely minimal — no interpolation — to match OpenClaw's load semantics.
 */
function parseDotenv(raw: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value) out[key] = value
  }
  return out
}

async function tryRead(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return null
  }
}

function buildEnvLookup(
  jsonEnv: Record<string, string>,
  dotenvFile: Record<string, string>
): Record<string, string | undefined> {
  const envLookup: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(jsonEnv)) envLookup[k] = v
  for (const [k, v] of Object.entries(dotenvFile)) envLookup[k] = v
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) envLookup[k] = v
  }
  return envLookup
}

/**
 * Import an OpenClaw installation.
 *
 * Accepts either:
 *   1. A path to `openclaw.json` (standard at `~/.openclaw/openclaw.json`)
 *   2. A path to `.env` (standard at `~/.openclaw/.env`)
 *   3. A path to the state directory (`~/.openclaw`)
 *
 * Supports current OpenClaw JSON (`agents.defaults.model.primary`, `models.providers`,
 * nested `env.vars`) as well as legacy flat `providers` + `activeProvider`.
 */
export async function importOpenClawConfig(filePath: string): Promise<OpenClawConfig> {
  const stat = await fs.stat(filePath)
  const isDir = stat.isDirectory()
  const baseDir = isDir ? filePath : path.dirname(filePath)

  const openclawJsonPath = path.join(baseDir, 'openclaw.json')
  const dotenvPath = path.join(baseDir, '.env')

  const jsonRaw = await tryRead(openclawJsonPath)
  const envRaw = await tryRead(dotenvPath)

  if (!jsonRaw && !envRaw) {
    throw new Error(
      `No OpenClaw config found. Expected openclaw.json or .env in ${baseDir}. ` +
        `Default location: ~/.openclaw/`
    )
  }

  let rawJson: Record<string, unknown> = {}
  if (jsonRaw) {
    try {
      rawJson = JSON.parse(jsonRaw) as Record<string, unknown>
    } catch (e) {
      throw new Error(`Invalid openclaw.json: ${(e as Error).message}`)
    }
  }

  const fromJsonEnv = collectEnvBlock(rawJson.env)
  const fromDot = envRaw ? parseDotenv(envRaw) : {}
  const envLookup = buildEnvLookup(fromJsonEnv, fromDot)

  const providers: Partial<Record<ProviderId, ProviderConfig>> = {}
  for (const [envKey, value] of Object.entries(envLookup)) {
    if (!value) continue
    const providerId = OPENCLAW_ENV_TO_PROVIDER[envKey]
    if (providerId) providers[providerId] = { ...providers[providerId], apiKey: value }
  }

  ingestModelsProviders(rawJson, providers, envLookup)
  ingestLegacyTopLevelProviders(rawJson, providers, envLookup)

  const primary = parsePrimaryModelRef(rawJson)
  const activeFromJson =
    typeof rawJson.activeProvider === 'string'
      ? mapOpenClawProviderSlug(rawJson.activeProvider)
      : undefined

  let activeProvider: ProviderId | undefined = activeFromJson ?? primary?.providerId
  if (activeProvider && !providers[activeProvider]) activeProvider = undefined
  if (!activeProvider) activeProvider = Object.keys(providers)[0] as ProviderId | undefined

  if (!activeProvider || !providers[activeProvider]) {
    const want =
      activeFromJson ??
      primary?.providerId ??
      (typeof rawJson.model === 'object' && rawJson.model && 'provider' in rawJson.model
        ? mapOpenClawProviderSlug(String((rawJson.model as Record<string, unknown>).provider))
        : undefined)
    throw new Error(
      `No usable provider credentials found for OpenClaw import. ` +
        (want
          ? `Config expects "${want}" (from model / activeProvider) but no API key or baseUrl was resolved. `
          : '') +
        `Put keys in ~/.openclaw/.env (e.g. ANTHROPIC_API_KEY), in openclaw.json env / models.providers, ` +
        `or export them in your shell. Parsed providers with credentials: ` +
        `${Object.keys(providers).join(', ') || 'none'}.`
    )
  }

  if (primary?.model && providers[primary.providerId]) {
    providers[primary.providerId]!.model = primary.model
  }

  const legacyModel = rawJson.model as { default?: string } | undefined
  if (legacyModel?.default && providers[activeProvider]) {
    providers[activeProvider]!.model = legacyModel.default
  }

  const gw = rawJson.gateway as Record<string, unknown> | undefined
  const auth = gw?.auth as Record<string, unknown> | undefined
  const rawTok = auth?.token
  const gatewayToken =
    typeof rawTok === 'string' ? substituteEnvVars(rawTok, envLookup) || undefined : undefined

  const config: OpenClawConfig = {
    providers,
    activeProvider,
    source: 'openclaw',
    channels: rawJson.channels && typeof rawJson.channels === 'object'
      ? Object.keys(rawJson.channels as object)
      : [],
    gateway: {
      port: typeof gw?.port === 'number' ? gw.port : undefined,
      token: gatewayToken
    }
  }

  mainStore.set('openclaw', config)
  return config
}

/**
 * Convenience: auto-discover at the default OpenClaw state dir.
 */
export async function importOpenClawFromDefaultLocation(): Promise<OpenClawConfig> {
  const defaultDir = path.join(os.homedir(), '.openclaw')
  return importOpenClawConfig(defaultDir)
}
