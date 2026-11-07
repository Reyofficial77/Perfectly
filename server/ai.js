export { authenticateRequest } from './auth.js'

const MODEL_CONFIG = {
  beam: {
    label: 'Beam', provider: 'ollama', model: () => process.env.OLLAMA_BEAM_MODEL || 'beam',
  },
  gemma4: {
    label: 'Gemma 4', provider: 'ollama', model: () => process.env.OLLAMA_GEMMA_MODEL || 'gemma4:31b',
  },
  gptLuna: {
    label: 'GPT 6 Luna', provider: 'openai', pro: true, model: () => process.env.OPENAI_GPT_LUNA_MODEL || 'gpt-6-luna',
  },
  gptAstra: {
    label: 'GPT 6 Astra', provider: 'openai', pro: true, model: () => process.env.OPENAI_GPT_ASTRA_MODEL || 'gpt-6-astra',
  },
  claudeSonnet: {
    label: 'Claude Sonnet 5.5', provider: 'anthropic', pro: true, model: () => process.env.ANTHROPIC_SONNET_MODEL || 'claude-sonnet-5-5',
  },
  claudeOpus: {
    label: 'Claude Opus 5.5', provider: 'anthropic', pro: true, model: () => process.env.ANTHROPIC_OPUS_MODEL || 'claude-opus-5-5',
  },
}

export const PUBLIC_MODELS = Object.entries(MODEL_CONFIG).map(([id, config]) => ({
  id,
  label: config.label,
  provider: config.provider,
  pro: Boolean(config.pro),
}))

const SYSTEM_PROMPT = `You are Perfectly, a thoughtful AI coding assistant for software developers. Help users understand, plan, write, debug, review, and improve software. Be practical and accurate. When writing code, provide complete, usable snippets and explain where they belong. Never claim you accessed a repository, ran a command, deployed an app, or changed a file unless a connected tool actually did so. You can analyze only the text and attachments supplied in this conversation. If a request is unrelated to software, respond briefly and politely, then guide the user back to development work.`

const MAX_MESSAGES = 12
const MAX_MESSAGE_CHARS = 100000
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024

function cleanMessages(input) {
  if (!Array.isArray(input) || input.length === 0) {
    const error = new Error('Chat messages cannot be empty.')
    error.status = 400
    throw error
  }

  let totalImageBytes = 0
  return input.slice(-MAX_MESSAGES).map((message) => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      const error = new Error('Invalid message format.')
      error.status = 400
      throw error
    }
    if (message.content.length > MAX_MESSAGE_CHARS) {
      const error = new Error('Message is too long. Limit each message to 100,000 characters.')
      error.status = 413
      throw error
    }

    const normalized = { role: message.role, content: message.content }
    if (message.role === 'user' && Array.isArray(message.attachments)) {
      normalized.attachments = message.attachments.slice(0, 4).map((attachment) => {
        if (!attachment || typeof attachment.dataUrl !== 'string') return null
        const match = attachment.dataUrl.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/)
        if (!match) {
          const error = new Error('Invalid image attachment. Use PNG, JPG, WEBP, or GIF.')
          error.status = 400
          throw error
        }
        const bytes = Math.floor(match[2].length * 0.75)
        totalImageBytes += bytes
        if (bytes > MAX_IMAGE_BYTES) {
          const error = new Error('Each image file must be no larger than 2 MB.')
          error.status = 413
          throw error
        }
        if (totalImageBytes > 1.5 * 1024 * 1024) {
          const error = new Error('The total image size per message cannot exceed 1.5 MB.')
          error.status = 413
          throw error
        }
        return { mediaType: match[1], base64: match[2] }
      }).filter(Boolean)
    }
    return normalized
  })
}

function getProviderKey(provider) {
  if (provider === 'ollama') return process.env.OLLAMA_API_KEY
  if (provider === 'openai') return process.env.OPENAI_API_KEY
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY
  return undefined
}

function toOpenAIInput(messages) {
  return [
    { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
    ...messages.map((message) => {
      const content = [{ type: 'input_text', text: message.content }]
      for (const image of message.attachments || []) {
        content.push({ type: 'input_image', image_url: `data:${image.mediaType};base64,${image.base64}` })
      }
      return { role: message.role, content }
    }),
  ]
}

function toAnthropicMessages(messages) {
  return messages.map((message) => {
    const content = [{ type: 'text', text: message.content }]
    for (const image of message.attachments || []) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: image.mediaType, data: image.base64 },
      })
    }
    return { role: message.role, content }
  })
}

function toOllamaMessages(messages) {
  return messages.map((message) => {
    const result = { role: message.role, content: message.content }
    const images = (message.attachments || []).map((image) => image.base64)
    if (images.length) result.images = images
    return result
  })
}

async function parseProviderError(response, provider) {
  let detail = ''
  try {
    const payload = await response.json()
    detail = payload?.error?.message || payload?.message || payload?.error || ''
  } catch {
    detail = ''
  }
  const fallback = `${provider} failed to process the request (HTTP ${response.status}).`
  const error = new Error(typeof detail === 'string' && detail ? detail.slice(0, 500) : fallback)
  error.status = response.status === 429 ? 429 : (response.status >= 500 ? 502 : 400)
  throw error
}

async function callOllama(model, messages) {
  const response = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...toOllamaMessages(messages)],
      stream: false,
      options: { temperature: 0.35 },
    }),
  })
  if (!response.ok) await parseProviderError(response, 'Ollama Cloud')
  const payload = await response.json()
  return payload?.message?.content || ''
}

async function callOpenAI(model, messages) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: toOpenAIInput(messages),
      max_output_tokens: 4096,
    }),
  })
  if (!response.ok) await parseProviderError(response, 'OpenAI API')
  const payload = await response.json()
  const text = payload?.output_text || (payload?.output || []).flatMap((item) =>
    (item.content || []).filter((part) => part.type === 'output_text').map((part) => part.text),
  ).join('\n')
  return text || ''
}

async function callAnthropic(model, messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      system: SYSTEM_PROMPT,
      messages: toAnthropicMessages(messages),
      max_tokens: 4096,
    }),
  })
  if (!response.ok) await parseProviderError(response, 'Anthropic API')
  const payload = await response.json()
  return (payload?.content || []).filter((part) => part.type === 'text').map((part) => part.text).join('\n')
}

export async function generateReply(modelId, inputMessages, { isPro = false } = {}) {
  const config = MODEL_CONFIG[modelId]
  if (!config) {
    const error = new Error('Unknown model. Choose an available model from the menu.')
    error.status = 400
    throw error
  }

  if (config.pro && isPro !== true) {
    const error = new Error('GPT and Claude models are available to Perfectly Pro accounts only.')
    error.status = 403
    throw error
  }

  const apiKey = getProviderKey(config.provider)
  if (!apiKey) {
    const envName = config.provider === 'ollama' ? 'OLLAMA_API_KEY'
      : config.provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
    const error = new Error(`The API key for ${config.provider} is not configured. Add ${envName} in Vercel → Settings → Environment Variables.`)
    error.status = 503
    throw error
  }

  const messages = cleanMessages(inputMessages)
  if (modelId === 'beam' && messages.some((message) => message.attachments?.length)) {
    const error = new Error('Beam currently supports text input only. To analyze images, choose Gemma 4, GPT, or Claude.')
    error.status = 400
    throw error
  }
  const model = config.model()
  let content = ''
  if (config.provider === 'ollama') content = await callOllama(model, messages)
  if (config.provider === 'openai') content = await callOpenAI(model, messages)
  if (config.provider === 'anthropic') content = await callAnthropic(model, messages)

  if (!content.trim()) {
    const error = new Error('The model returned an empty response. Try sending your message again or choose another model.')
    error.status = 502
    throw error
  }
  return { content, model, provider: config.provider }
}

export function getProviderStatus() {
  return {
    ollama: Boolean(process.env.OLLAMA_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    auth: Boolean(process.env.DATABASE_URL),
  }
}
