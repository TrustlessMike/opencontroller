import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import * as yaml from 'js-yaml'
import type { HermesConfig, OpenClawConfig, ProviderId, ProviderConfig } from '../../shared/types'
import { mainStore } from '../store-instance'

/**
 * Maps Hermes Agent provider names → our normalized ProviderId.
 * Source: https://github.com/NousResearch/hermes-agent cli-config.yaml.example
 */
const HERMES_PROVIDER_MAP: Record<string, ProviderId> = {
  openrouter: 'openrouter',
  nous: 'nous',
  'nous-api': 'nous-api',
  anthropic: 'anthropic',
  openai: 'openai',
  'openai-codex': 'openai-codex',
  copilot: 'copilot',
  gemini: 'gemini',
  zai: 'zai',
  'kimi-coding': 'kimi-coding',
  minimax: 'minimax',
  'minimax-cn': 'minimax-cn',
  huggingface: 'huggingface',
  xiaomi: 'xiaomi',
  arcee: 'arcee',
  'ollama-cloud': 'ollama-cloud',
  kilocode: 'kilocode',
  'ai-gateway': 'ai-gateway',
  custom: 'custom',
  lmstudio: 'custom',
  ollama: 'custom',
  vllm: 'custom',
  llamacpp: 'custom'
}

/**
 * Env vars that Hermes Agent reads → ProviderId mapping.
 */
const HERMES_ENV_TO_PROVIDER: Record<string, ProviderId> = {
  OPENROUTER_API_KEY: 'openrouter',
  NOUS_API_KEY: 'nous-api',
  ANTHROPIC_API_KEY: 'anthropic',
  OPENAI_API_KEY: 'openai',
  GOOGLE_API_KEY: 'gemini',
  GEMINI_API_KEY: 'gemini',
  GLM_API_KEY: 'zai',
  KIMI_API_KEY: 'kimi-coding',
  KIMI_CN_API_KEY: 'kimi-cn',
  MINIMAX_API_KEY: 'minimax',
  MINIMAX_CN_API_KEY: 'minimax-cn',
  HF_TOKEN: 'huggingface',
  XIAOMI_API_KEY: 'xiaomi',
  ARCEEAI_API_KEY: 'arcee',
  OLLAMA_API_KEY: 'ollama-cloud',
  KILOCODE_API_KEY: 'kilocode',
  AI_GATEWAY_API_KEY: 'ai-gateway',
  GITHUB_TOKEN: 'copilot'
}

/**
 * Env vars that carry a base URL override for a specific provider.
 */
const HERMES_ENV_TO_BASE_URL: Record<string, ProviderId> = {
  GEMINI_BASE_URL: 'gemini',
  OLLAMA_BASE_URL: 'ollama-cloud',
  GLM_BASE_URL: 'zai',
  KIMI_BASE_URL: 'kimi-coding'
}

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

interface HermesYaml {
  model?: {
    default?: string
    model?: string
    provider?: string
    api_key?: string
    base_url?: string
    context_length?: number
    max_tokens?: number
  }
  personality?: { name?: string; system_prompt?: string }
  tools?: string[]
  smart_model_routing?: { enabled?: boolean }
}

/**
 * Import a Hermes Agent installation.
 *
 * Accepts:
 *   1. Path to `config.yaml` / `cli-config.yaml` (default `~/.hermes/config.yaml`)
 *   2. Path to `.env`
 *   3. Path to the `~/.hermes` directory
 *
 * Produces BOTH a HermesConfig (assistant personality) and a normalized
 * OpenClawConfig (provider list) so the app can route AI calls immediately.
 */
export async function importHermesConfig(filePath: string): Promise<{
  hermes: HermesConfig
  providers: OpenClawConfig
}> {
  const stat = await fs.stat(filePath)
  const isDir = stat.isDirectory()
  const baseDir = isDir ? filePath : path.dirname(filePath)

  // Find the YAML — Hermes ships two example names
  const candidates = ['config.yaml', 'cli-config.yaml', 'hermes.yaml']
  let yamlPath: string | null = null
  let yamlRaw: string | null = null
  if (!isDir && (filePath.endsWith('.yaml') || filePath.endsWith('.yml'))) {
    yamlPath = filePath
    yamlRaw = await tryRead(filePath)
  } else {
    for (const name of candidates) {
      const candidate = path.join(baseDir, name)
      const raw = await tryRead(candidate)
      if (raw) {
        yamlPath = candidate
        yamlRaw = raw
        break
      }
    }
  }

  const envRaw = await tryRead(path.join(baseDir, '.env'))

  if (!yamlRaw && !envRaw) {
    throw new Error(
      `No Hermes Agent config found. Expected config.yaml or .env in ${baseDir}. ` +
        `Default location: ~/.hermes/`
    )
  }

  const parsedYaml: HermesYaml = yamlRaw ? ((yaml.load(yamlRaw) as HermesYaml) ?? {}) : {}
  const envVars = envRaw ? parseDotenv(envRaw) : {}

  // Build provider map from env vars
  const providers: Partial<Record<ProviderId, ProviderConfig>> = {}
  for (const [envKey, value] of Object.entries(envVars)) {
    const providerId = HERMES_ENV_TO_PROVIDER[envKey]
    if (providerId && value) {
      providers[providerId] = { ...providers[providerId], apiKey: value }
    }
    const baseUrlProvider = HERMES_ENV_TO_BASE_URL[envKey]
    if (baseUrlProvider && value) {
      providers[baseUrlProvider] = { ...providers[baseUrlProvider], baseUrl: value }
    }
  }

  // Merge inline config (model.api_key / model.base_url)
  const configuredProvider = parsedYaml.model?.provider
  let activeProviderId: ProviderId =
    configuredProvider && HERMES_PROVIDER_MAP[configuredProvider]
      ? HERMES_PROVIDER_MAP[configuredProvider]
      : ((Object.keys(providers)[0] as ProviderId | undefined) ?? 'openrouter')

  if (parsedYaml.model?.api_key) {
    providers[activeProviderId] = {
      ...providers[activeProviderId],
      apiKey: parsedYaml.model.api_key
    }
  }
  if (parsedYaml.model?.base_url) {
    providers[activeProviderId] = {
      ...providers[activeProviderId],
      baseUrl: parsedYaml.model.base_url
    }
  }
  if (parsedYaml.model?.default ?? parsedYaml.model?.model) {
    providers[activeProviderId] = {
      ...providers[activeProviderId],
      model: parsedYaml.model.default ?? parsedYaml.model.model
    }
  }

  if (!providers[activeProviderId] && Object.keys(providers).length > 0) {
    activeProviderId = Object.keys(providers)[0] as ProviderId
  }

  if (!providers[activeProviderId]) {
    throw new Error(
      `Hermes config has no API key for any provider. Checked ${Object.keys(HERMES_ENV_TO_PROVIDER).length} env vars.`
    )
  }

  const hermes: HermesConfig = {
    assistantName: parsedYaml.personality?.name ?? 'Hermes',
    personality: parsedYaml.personality?.system_prompt ?? '',
    memory: [],
    tools: Array.isArray(parsedYaml.tools) ? parsedYaml.tools : []
  }

  const providerConfig: OpenClawConfig = {
    providers,
    activeProvider: activeProviderId,
    source: 'hermes',
    systemPrompt: hermes.personality || undefined
  }

  mainStore.set('hermes', hermes)
  mainStore.set('openclaw', providerConfig) // reuse the routing store
  return { hermes, providers: providerConfig }
}

export async function importHermesFromDefaultLocation(): Promise<{
  hermes: HermesConfig
  providers: OpenClawConfig
}> {
  const defaultDir = path.join(os.homedir(), '.hermes')
  return importHermesConfig(defaultDir)
}
