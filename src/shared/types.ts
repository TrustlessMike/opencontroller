// Unified provider IDs — superset spanning both Hermes Agent and OpenClaw.
export type ProviderId =
  // Shared
  | 'anthropic'
  | 'openai'
  | 'gemini'
  | 'openrouter'
  | 'minimax'
  // Hermes-specific
  | 'nous'
  | 'nous-api'
  | 'openai-codex'
  | 'copilot'
  | 'zai'
  | 'kimi-coding'
  | 'kimi-cn'
  | 'minimax-cn'
  | 'huggingface'
  | 'xiaomi'
  | 'arcee'
  | 'ollama-cloud'
  | 'kilocode'
  | 'ai-gateway'
  | 'custom'
  // OpenClaw-specific extras
  | 'synthetic'

export interface ProviderConfig {
  apiKey?: string
  baseUrl?: string
  model?: string
  token?: string
}

/**
 * Unified internal config shape. Imported from either OpenClaw JSON or
 * Hermes Agent YAML and normalized down to this.
 */
export interface OpenClawConfig {
  providers: Partial<Record<ProviderId, ProviderConfig>>
  activeProvider: ProviderId
  systemPrompt?: string
  /** Original source — useful for round-trip and UI hints. */
  source?: 'openclaw' | 'hermes' | 'manual'
  /** Channels enabled in OpenClaw (telegram, discord, slack, etc.) */
  channels?: string[]
  /** Gateway config from OpenClaw */
  gateway?: { token?: string; port?: number }
}

export interface HermesConfig {
  assistantName: string
  personality: string
  memory: Record<string, unknown>[]
  tools: string[]
  webhooks?: { url: string; events: string[] }[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  provider?: ProviderId
  createdAt: number
}

export interface SendMessagePayload {
  message: string
  provider: ProviderId
  history: ChatMessage[]
}

/**
 * Real agent turn result — whichever CLI produced it.
 * Mirrors the shapes from main/agents/openclaw-runner.ts and hermes-runner.ts
 * but is renderer-safe (no Node types leaking in).
 */
export interface AgentAttempt {
  provider: string
  model: string
  result: string
  stage: string
}

export interface AgentEvent {
  level: 'info' | 'warn' | 'error' | 'detail'
  text: string
}

export interface AgentTurnResult {
  source: 'openclaw' | 'hermes'
  text: string
  durationMs?: number
  /** e.g. "working", "stuck", "stopped" */
  livenessState?: string
  stopReason?: string
  winnerProvider?: string
  winnerModel?: string
  attempts?: AgentAttempt[]
  fallbackUsed?: boolean
  runner?: string
  toolsUsed?: string[]
  toolCalls?: number
  toolFailures?: number
  thinking?: string
  /** Hermes streams line-level events (tool calls, errors). OpenClaw's JSON
   * envelope doesn't, but we can still synthesize a single "done" event. */
  events?: AgentEvent[]
  error?: string
}

export interface AgentRunPayload {
  source: 'openclaw' | 'hermes'
  message: string
  /** Optional per-source overrides. */
  openclaw?: { agent?: string; thinking?: string }
  hermes?: { provider?: string; model?: string; maxTurns?: number }
}

export interface AgentBinaryStatus {
  openclaw: { ok: boolean; version?: string; error?: string }
  hermes: { ok: boolean; version?: string; error?: string }
}

/** Mirrors main/agents/openclaw-skills.ts */
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

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface OpenClawCommandResult {
  args: string[]
  stdout: string
  stderr: string
  exitCode: number | null
  data?: unknown
  durationMs: number
}

/** Result of scanning ~/.openclaw (no secrets). */
export interface OpenClawInstallDetection {
  found: boolean
  rootPath: string
  hasJson: boolean
  hasEnv: boolean
  /** Directory exists and is readable */
  readable: boolean
}

/** Result of scanning ~/.hermes (no secrets). */
export interface HermesInstallDetection {
  found: boolean
  rootPath: string
  /** Which YAML filenames exist, e.g. config.yaml */
  yamlPresent: string[]
  hasEnv: boolean
  readable: boolean
}

export interface AgentInstallScan {
  openclaw: OpenClawInstallDetection
  hermes: HermesInstallDetection
}

// ─── New: streaming events, settings, memory, sessions, approvals ────────────

/** Streamed as the agent runs. `id` is a per-turn correlation key. */
export interface AgentStreamEvent {
  id: string
  kind: 'start' | 'line' | 'event' | 'done' | 'error'
  text?: string
  level?: 'info' | 'warn' | 'error' | 'detail'
  /** On kind: "done", the full structured result. */
  result?: AgentTurnResult
}

export interface MemorySearchHit {
  score: number
  text: string
  path?: string
  /** Unknown fields from `openclaw memory search --json` are kept for debugging. */
  [k: string]: unknown
}

export interface MemorySearchResult {
  query: string
  hits: MemorySearchHit[]
}

export interface SessionSummary {
  id: string
  label?: string
  model?: string
  modelProvider?: string
  inputTokens?: number
  outputTokens?: number
  estimatedCostUsd?: number
  /** Epoch ms of last activity, if derivable. */
  lastActivity?: number
}

export interface ApprovalsSnapshot {
  path?: string
  exists: boolean
  defaults?: string
  allowlistEntries: number
  raw?: string
}

