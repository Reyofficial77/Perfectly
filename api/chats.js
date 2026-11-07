import { randomUUID } from 'node:crypto'
import { authenticateRequest } from '../server/auth.js'
import { ensureSchema } from '../server/db.js'

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9]{25}$/
const MESSAGE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ALLOWED_MODELS = new Set(['beam', 'gemma4', 'gptLuna', 'gptAstra', 'claudeSonnet', 'claudeOpus'])

function json(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  return res.status(status).json(payload)
}

function normalizeConversation(input) {
  if (!input || !PUBLIC_ID_PATTERN.test(String(input.id || ''))) {
    const error = new Error('Invalid conversation ID.')
    error.status = 400
    throw error
  }
  if (!Array.isArray(input.messages) || input.messages.length > 120) {
    const error = new Error('Invalid conversation history format.')
    error.status = 400
    throw error
  }
  const messages = input.messages.map((message) => {
    if (!message || !MESSAGE_ID_PATTERN.test(String(message.id || '')) || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
      const error = new Error('One of the messages has an invalid format.')
      error.status = 400
      throw error
    }
    if (message.content.length > 100000) {
      const error = new Error('Message is too long.')
      error.status = 413
      throw error
    }
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      attachments: Array.isArray(message.attachments)
        ? message.attachments.slice(0, 4).map((item) => ({ name: String(item?.name || 'attachment').slice(0, 180), type: String(item?.type || 'application/octet-stream').slice(0, 100) }))
        : [],
      ...(typeof message.model === 'string' ? { model: message.model.slice(0, 80) } : {}),
      createdAt: Number.isFinite(Number(message.createdAt)) ? Number(message.createdAt) : Date.now(),
      ...(message.error ? { error: String(message.error).slice(0, 500) } : {}),
    }
  })
  return {
    id: input.id,
    title: String(input.title || 'New conversation').replace(/[<>]/g, '').slice(0, 100),
    model: ALLOWED_MODELS.has(input.model) ? input.model : 'beam',
    messages,
  }
}

export default async function handler(req, res) {
  try {
    const user = await authenticateRequest(req)
    const sql = await ensureSchema()

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT public_id AS id, title, model, messages, updated_at
        FROM perfectly_conversations
        WHERE user_id = ${user.id}::uuid
        ORDER BY updated_at DESC
        LIMIT 40
      `
      return json(res, 200, {
        conversations: rows.map((row) => ({
          id: row.id,
          title: row.title,
          model: row.model,
          updatedAt: new Date(row.updated_at).getTime(),
          messages: Array.isArray(row.messages) ? row.messages : [],
        })),
      })
    }

    if (req.method === 'POST') {
      const conversation = normalizeConversation(req.body?.conversation)
      const existing = await sql`
        SELECT id FROM perfectly_conversations WHERE public_id = ${conversation.id} AND user_id = ${user.id}::uuid LIMIT 1
      `
      if (existing.length) {
        await sql`
          UPDATE perfectly_conversations
          SET title = ${conversation.title}, model = ${conversation.model}, messages = ${JSON.stringify(conversation.messages)}::jsonb, updated_at = NOW()
          WHERE public_id = ${conversation.id} AND user_id = ${user.id}::uuid
        `
      } else {
        await sql`
          INSERT INTO perfectly_conversations (id, public_id, user_id, title, model, messages)
          VALUES (${randomUUID()}::uuid, ${conversation.id}, ${user.id}::uuid, ${conversation.title}, ${conversation.model}, ${JSON.stringify(conversation.messages)}::jsonb)
        `
      }
      return json(res, 200, { ok: true })
    }

    if (req.method === 'DELETE') {
      const id = String(req.query?.id || '')
      if (!PUBLIC_ID_PATTERN.test(id)) return json(res, 400, { error: 'Invalid conversation ID.' })
      await sql`DELETE FROM perfectly_conversations WHERE public_id = ${id} AND user_id = ${user.id}::uuid`
      return json(res, 200, { ok: true })
    }

    res.setHeader('Allow', 'GET, POST, DELETE')
    return json(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error('[Perfectly Chats]', error)
    return json(res, status, { error: error.message || 'Could not access chat history.' })
  }
}
