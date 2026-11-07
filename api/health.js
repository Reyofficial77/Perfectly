import { getProviderStatus, PUBLIC_MODELS } from '../server/ai.js'
import { checkDatabase } from '../server/db.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  const database = await checkDatabase()
  return res.status(200).json({ ok: true, app: 'Perfectly', database, providers: getProviderStatus(), models: PUBLIC_MODELS })
}
