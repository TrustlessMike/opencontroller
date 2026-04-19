import type { ProviderId, ProviderConfig, SendMessagePayload } from '../../shared/types'

/**
 * Routes a chat request to the correct provider.
 * Live: anthropic, openai, openrouter, gemini, ollama-cloud (OpenAI-compatible), custom.
 * Others return a helpful stub until wired up.
 */
export async function routeToProvider(
  provider: ProviderId,
  config: ProviderConfig,
  payload: SendMessagePayload
): Promise<{ content: string; provider: ProviderId }> {
  switch (provider) {
    case 'anthropic':
      return callAnthropic(config, payload)
    case 'openai':
      return callOpenAICompatible(config, payload, 'https://api.openai.com/v1', 'gpt-4o')
    case 'openrouter':
      return callOpenAICompatible(
        config,
        payload,
        'https://openrouter.ai/api/v1',
        'anthropic/claude-opus-4.6'
      )
    case 'gemini':
      return callGemini(config, payload)
    case 'ollama-cloud':
      return callOpenAICompatible(config, payload, 'https://ollama.com/v1', 'llama3')
    case 'custom':
      if (!config.baseUrl) throw new Error('custom provider requires baseUrl')
      return callOpenAICompatible(config, payload, config.baseUrl, config.model ?? 'local')
    case 'zai':
      return callOpenAICompatible(
        config,
        payload,
        config.baseUrl ?? 'https://api.z.ai/api/paas/v4',
        config.model ?? 'glm-4-plus'
      )
    case 'kimi-coding':
      return callOpenAICompatible(
        config,
        payload,
        config.baseUrl ?? 'https://api.kimi.com/coding/v1',
        config.model ?? 'kimi-k2.5'
      )
    case 'minimax':
    case 'minimax-cn':
    case 'nous':
    case 'nous-api':
    case 'openai-codex':
    case 'copilot':
    case 'huggingface':
    case 'xiaomi':
    case 'arcee':
    case 'kilocode':
    case 'ai-gateway':
    case 'kimi-cn':
    case 'synthetic':
      return {
        content: `[${provider}] live routing not yet wired — add a case in providers/router.ts. Request was: "${payload.message}"`,
        provider
      }
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

async function callAnthropic(
  config: ProviderConfig,
  payload: SendMessagePayload
): Promise<{ content: string; provider: ProviderId }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.apiKey ?? '',
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.model ?? 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        ...payload.history
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: payload.message }
      ]
    })
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { content?: Array<{ text: string }> }
  return { content: data.content?.[0]?.text ?? '', provider: 'anthropic' }
}

async function callOpenAICompatible(
  config: ProviderConfig,
  payload: SendMessagePayload,
  baseUrl: string,
  defaultModel: string
): Promise<{ content: string; provider: ProviderId }> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${config.apiKey ?? ''}`
    },
    body: JSON.stringify({
      model: config.model ?? defaultModel,
      messages: [
        ...payload.history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: payload.message }
      ]
    })
  })
  if (!res.ok) throw new Error(`${baseUrl} ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    choices?: Array<{ message: { content: string } }>
  }
  return { content: data.choices?.[0]?.message.content ?? '', provider: payload.provider }
}

async function callGemini(
  config: ProviderConfig,
  payload: SendMessagePayload
): Promise<{ content: string; provider: ProviderId }> {
  const model = config.model ?? 'gemini-1.5-pro'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: payload.message }] }]
    })
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>
  }
  return {
    content: data.candidates?.[0]?.content.parts[0]?.text ?? '',
    provider: 'gemini'
  }
}
