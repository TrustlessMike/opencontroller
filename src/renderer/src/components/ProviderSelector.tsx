import type { ProviderId, ProviderConfig } from '../../../shared/types'

interface Props {
  providers?: Partial<Record<ProviderId, ProviderConfig>>
  active: ProviderId
  onChange: (p: ProviderId) => void
}

const ALL_PROVIDERS: ProviderId[] = [
  'anthropic',
  'openai',
  'gemini',
  'openrouter',
  'nous',
  'nous-api',
  'zai',
  'kimi-coding',
  'minimax',
  'huggingface',
  'ollama-cloud',
  'custom',
  'copilot',
  'xiaomi',
  'arcee',
  'kilocode',
  'ai-gateway',
  'synthetic'
]

/** Human-readable — avoids raw slugs like `ollama-cloud` in the UI */
export const PROVIDER_LABEL: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  nous: 'Nous',
  'nous-api': 'Nous API',
  'openai-codex': 'OpenAI Codex',
  copilot: 'GitHub Copilot',
  zai: 'Z.ai',
  'kimi-coding': 'Kimi',
  'kimi-cn': 'Kimi (CN)',
  minimax: 'MiniMax',
  'minimax-cn': 'MiniMax (CN)',
  huggingface: 'Hugging Face',
  xiaomi: 'Xiaomi',
  arcee: 'Arcee',
  'ollama-cloud': 'Ollama Cloud',
  kilocode: 'Kilocode',
  'ai-gateway': 'AI Gateway',
  custom: 'Custom / Local',
  synthetic: 'Synthetic'
}

export default function ProviderSelector({ providers, active, onChange }: Props): JSX.Element {
  const configured = new Set(Object.keys(providers ?? {}) as ProviderId[])
  const visible = ALL_PROVIDERS.filter((p) => configured.has(p) || p === active)
  if (visible.length === 0) visible.push(active)

  return (
    <select
      value={active}
      onChange={(e) => onChange(e.target.value as ProviderId)}
      className="no-drag min-w-[120px] max-w-[180px] cursor-pointer truncate rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-white/90 hover:bg-white/[0.07] focus:outline-none focus:ring-1 focus:ring-teal-400/40"
      title={PROVIDER_LABEL[active] ?? active}
    >
      {visible.map((p) => (
        <option key={p} value={p} className="bg-neutral-900">
          {PROVIDER_LABEL[p] ?? p}
        </option>
      ))}
    </select>
  )
}
