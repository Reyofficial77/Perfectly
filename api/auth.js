import {
  clearOAuthCookies,
  completeLogin,
  createOAuthUrl,
  findSessionUser,
  loginWithEmail,
  logoutSession,
  readOAuthNext,
  readOAuthState,
  registerWithEmail,
  resolveOAuthUser,
} from '../server/auth.js'
import { ensureSchema } from '../server/db.js'

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  return res.status(status).json(payload)
}

function safeNext(value) {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') ? value.slice(0, 500) : '/app'
}

function redirect(res, url) {
  res.statusCode = 302
  res.setHeader('Location', url)
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  return res.end()
}

function requireSameOrigin(req) {
  const origin = req.headers.origin
  if (!origin) return
  const requestHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  try {
    if (new URL(origin).host !== requestHost) {
      const error = new Error('Cross-origin request was rejected.')
      error.status = 403
      throw error
    }
  } catch (error) {
    if (error.status) throw error
    const invalid = new Error('The request origin is invalid.')
    invalid.status = 403
    throw invalid
  }
}

export default async function handler(req, res) {
  const action = String(req.query?.action || '')
  const provider = String(req.query?.provider || '')

  try {
    await ensureSchema()

    if (action === 'me' && req.method === 'GET') {
      const user = await findSessionUser(req)
      return sendJson(res, 200, { configured: true, user })
    }

    if (action === 'oauth-url' && req.method === 'GET') {
      requireSameOrigin(req)
      const result = createOAuthUrl(req, provider, safeNext(req.query?.next))
      res.setHeader('Set-Cookie', result.cookies)
      return sendJson(res, 200, { url: result.url })
    }

    if (action === 'callback' && req.method === 'GET') {
      const stateCookie = readOAuthState(req)
      const queryState = String(req.query?.state || '')
      const expected = `${provider}:${queryState}`
      if (!queryState || !stateCookie || stateCookie !== expected || !['google', 'github'].includes(provider)) {
        res.setHeader('Set-Cookie', clearOAuthCookies(req))
        return redirect(res, '/login?oauth_error=state')
      }
      if (req.query?.error || !req.query?.code) {
        res.setHeader('Set-Cookie', clearOAuthCookies(req))
        return redirect(res, '/login?oauth_error=provider')
      }
      const user = await resolveOAuthUser(provider, String(req.query.code), req)
      await completeLogin(req, res, user.id)
      const sessionCookie = res.getHeader('Set-Cookie')
      res.setHeader('Set-Cookie', [
        ...(Array.isArray(sessionCookie) ? sessionCookie : [sessionCookie]),
        ...clearOAuthCookies(req),
      ])
      return redirect(res, `/auth/callback?next=${encodeURIComponent(readOAuthNext(req))}`)
    }

    if (req.method === 'POST') requireSameOrigin(req)

    if (action === 'register' && req.method === 'POST') {
      const user = await registerWithEmail(req.body?.email, req.body?.password, req.body?.name)
      await completeLogin(req, res, user.id)
      return sendJson(res, 201, { ok: true, user })
    }

    if (action === 'login' && req.method === 'POST') {
      const user = await loginWithEmail(req.body?.email, req.body?.password)
      await completeLogin(req, res, user.id)
      return sendJson(res, 200, { ok: true, user })
    }

    if (action === 'logout' && req.method === 'POST') {
      await logoutSession(req, res)
      return sendJson(res, 200, { ok: true })
    }

    res.setHeader('Allow', 'GET, POST')
    return sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    if (action === 'callback' && req.method === 'GET') {
      console.error('[Perfectly OAuth]', error)
      res.setHeader('Set-Cookie', clearOAuthCookies(req))
      return redirect(res, `/login?oauth_error=${encodeURIComponent(error.status === 503 ? 'config' : 'failed')}`)
    }
    const status = Number.isInteger(error.status) ? error.status : 500
    if (status >= 500) console.error('[Perfectly Auth]', error)
    return sendJson(res, status, { error: error.message || 'An authentication error occurred.' })
  }
}
