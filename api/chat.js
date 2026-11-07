import { authenticateRequest, generateReply } from '../server/ai.js'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await authenticateRequest(req)
    const { model, messages } = req.body || {}
    const result = await generateReply(model, messages, { isPro: user.is_pro === true })
    return res.status(200).json({ ok: true, ...result })
  } catch (error) {
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error('[Perfectly API]', error)
    return res.status(status).json({ error: error.message || 'A server error occurred.' })
  }
}
