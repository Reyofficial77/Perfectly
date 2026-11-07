import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { ensureSchema } from './db.js'

const scrypt = promisify(scryptCallback)
const SESSION_COOKIE = 'perfectly_session'
const OAUTH_STATE_COOKIE = 'perfectly_oauth_state'
const OAUTH_NEXT_COOKIE = 'perfectly_oauth_next'
const SESSION_SECONDS = 60 * 60 * 24 * 30
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || '').split(';')
  for (const item of cookies) {
    const separator = item.indexOf('=')
    if (separator < 0) continue
    if (item.slice(0, separator).trim() === name) {
      try { return decodeURIComponent(item.slice(separator + 1).trim()) } catch { return '' }
    }
  }
  return ''
}

function secureCookie(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1' || forwarded === 'https'
}

export function makeCookie(req, name, value, maxAge, { httpOnly = true } = {}) {
  return `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=${maxAge}${httpOnly ? '; HttpOnly' : ''}${secureCookie(req) ? '; Secure' : ''}`
}

export function clearOAuthCookies(req) {
  return [
    makeCookie(req, OAUTH_STATE_COOKIE, '', 0),
    makeCookie(req, OAUTH_NEXT_COOKIE, '', 0),
  ]
}

export function clearAuthCookies(req) {
  return [makeCookie(req, SESSION_COOKIE, '', 0), ...clearOAuthCookies(req)]
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

function safeNextPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/app'
  return value.slice(0, 500)
}

function requestOrigin(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host || process.env.VERCEL_URL
  if (!host) throw new Error('Tidak dapat menentukan APP_URL untuk OAuth.')
  const hostname = String(host).split(',')[0].trim()
  const proto = String(req.headers['x-forwarded-proto'] || (hostname.includes('localhost') ? 'http' : 'https')).split(',')[0].trim()
  return `${proto}://${hostname}`
}

function publicUser(row) {
  if (!row) return null
  return { id: row.id, email: row.email, name: row.name || null, avatar_url: row.avatar_url || null, is_pro: row.is_pro === true }
}

export async function findSessionUser(req) {
  const token = cookieValue(req, SESSION_COOKIE)
  if (!token) return null
  const sql = await ensureSchema()
  const tokenHash = hashToken(token)
  const rows = await sql`
    SELECT u.id, u.email, u.name, u.avatar_url, u.is_pro
    FROM perfectly_sessions s
    JOIN perfectly_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash} AND s.expires_at > NOW()
    LIMIT 1
  `
  return publicUser(rows[0])
}

export async function authenticateRequest(req) {
  const user = await findSessionUser(req)
  if (!user) {
    const error = new Error('Sesi login tidak ditemukan atau sudah kedaluwarsa. Silakan login kembali.')
    error.status = 401
    throw error
  }
  return user
}

async function createSession(userId) {
  const sql = await ensureSchema()
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000)
  await sql`
    INSERT INTO perfectly_sessions (token_hash, user_id, expires_at)
    VALUES (${hashToken(token)}, ${userId}::uuid, ${expiresAt.toISOString()})
  `
  return { token, expiresAt }
}

export async function completeLogin(req, res, userId) {
  const { token } = await createSession(userId)
  res.setHeader('Set-Cookie', makeCookie(req, SESSION_COOKIE, token, SESSION_SECONDS))
}

export async function logoutSession(req, res) {
  const token = cookieValue(req, SESSION_COOKIE)
  if (token) {
    const sql = await ensureSchema()
    await sql`DELETE FROM perfectly_sessions WHERE token_hash = ${hashToken(token)}`
  }
  res.setHeader('Set-Cookie', clearAuthCookies(req))
}

export async function registerWithEmail(emailInput, password, nameInput = '') {
  const email = String(emailInput || '').trim().toLowerCase()
  const name = String(nameInput || '').trim().slice(0, 80)
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    const error = new Error('Masukkan alamat email yang valid.')
    error.status = 400
    throw error
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    const error = new Error('Password harus berisi 8–128 karakter.')
    error.status = 400
    throw error
  }

  const sql = await ensureSchema()
  const existing = await sql`SELECT id FROM perfectly_users WHERE email = ${email} LIMIT 1`
  if (existing.length) {
    const error = new Error('Email sudah terdaftar. Silakan login.')
    error.status = 409
    throw error
  }

  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
  const passwordHash = `scrypt$${salt}$${Buffer.from(derived).toString('hex')}`
  const id = randomUUID()
  const rows = await sql`
    INSERT INTO perfectly_users (id, email, password_hash, name)
    VALUES (${id}::uuid, ${email}, ${passwordHash}, ${name || email.split('@')[0]})
    RETURNING id, email, name, avatar_url, is_pro
  `
  return publicUser(rows[0])
}

export async function loginWithEmail(emailInput, password) {
  const email = String(emailInput || '').trim().toLowerCase()
  if (typeof password !== 'string' || !password.length) {
    const error = new Error('Email atau password tidak cocok.')
    error.status = 401
    throw error
  }
  const sql = await ensureSchema()
  const rows = await sql`SELECT id, email, name, avatar_url, is_pro, password_hash FROM perfectly_users WHERE email = ${email} LIMIT 1`
  const user = rows[0]
  if (!user?.password_hash) {
    const error = new Error('Email atau password tidak cocok. Jika mendaftar melalui Google/GitHub, gunakan tombol tersebut.')
    error.status = 401
    throw error
  }
  const [scheme, salt, storedHex] = user.password_hash.split('$')
  if (scheme !== 'scrypt' || !salt || !storedHex) {
    const error = new Error('Data password tidak valid. Silakan hubungi administrator.')
    error.status = 500
    throw error
  }
  const derived = Buffer.from(await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }))
  const stored = Buffer.from(storedHex, 'hex')
  if (stored.length !== derived.length || !timingSafeEqual(stored, derived)) {
    const error = new Error('Email atau password tidak cocok.')
    error.status = 401
    throw error
  }
  return publicUser(user)
}

export function createOAuthUrl(req, provider, nextPath) {
  const origin = requestOrigin(req)
  const redirectUri = `${origin}/api/auth/callback/${provider}`
  const state = randomBytes(32).toString('hex')
  let url

  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
      const error = new Error('Google OAuth belum dikonfigurasi. Isi GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET.')
      error.status = 503
      throw error
    }
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    })
    url = `https://accounts.google.com/o/oauth2/v2/auth?${query}`
  } else if (provider === 'github') {
    const clientId = process.env.GITHUB_CLIENT_ID
    if (!clientId || !process.env.GITHUB_CLIENT_SECRET) {
      const error = new Error('GitHub OAuth belum dikonfigurasi. Isi GITHUB_CLIENT_ID dan GITHUB_CLIENT_SECRET.')
      error.status = 503
      throw error
    }
    const query = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, scope: 'read:user user:email', state })
    url = `https://github.com/login/oauth/authorize?${query}`
  } else {
    const error = new Error('Provider OAuth tidak didukung.')
    error.status = 400
    throw error
  }

  return {
    url,
    cookies: [
      makeCookie(req, OAUTH_STATE_COOKIE, `${provider}:${state}`, 600),
      makeCookie(req, OAUTH_NEXT_COOKIE, safeNextPath(nextPath), 600),
    ],
  }
}

async function exchangeGoogleCode(code, redirectUri) {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const tokenData = await tokenResponse.json().catch(() => ({}))
  if (!tokenResponse.ok || !tokenData.access_token) throw new Error('Google tidak dapat memverifikasi proses login.')
  const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })
  const profile = await profileResponse.json().catch(() => ({}))
  if (!profileResponse.ok || !profile.sub || !profile.email || profile.email_verified !== true) {
    throw new Error('Google tidak memberikan email terverifikasi.')
  }
  return { provider: 'google', providerUserId: String(profile.sub), email: profile.email, name: profile.name || '', avatarUrl: profile.picture || '' }
}

async function exchangeGitHubCode(code, redirectUri) {
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: redirectUri }),
  })
  const tokenData = await tokenResponse.json().catch(() => ({}))
  if (!tokenResponse.ok || !tokenData.access_token) throw new Error('GitHub tidak dapat memverifikasi proses login.')
  const headers = { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  const [profileResponse, emailsResponse] = await Promise.all([
    fetch('https://api.github.com/user', { headers }),
    fetch('https://api.github.com/user/emails', { headers }),
  ])
  const profile = await profileResponse.json().catch(() => ({}))
  const emails = await emailsResponse.json().catch(() => [])
  const verifiedEmail = Array.isArray(emails) ? emails.find((entry) => entry.primary && entry.verified)?.email || emails.find((entry) => entry.verified)?.email : null
  if (!profileResponse.ok || !profile.id || !verifiedEmail) throw new Error('Akun GitHub harus memiliki email terverifikasi.')
  return { provider: 'github', providerUserId: String(profile.id), email: verifiedEmail, name: profile.name || profile.login || '', avatarUrl: profile.avatar_url || '' }
}

export async function resolveOAuthUser(provider, code, req) {
  const origin = requestOrigin(req)
  const redirectUri = `${origin}/api/auth/callback/${provider}`
  const profile = provider === 'google'
    ? await exchangeGoogleCode(code, redirectUri)
    : await exchangeGitHubCode(code, redirectUri)
  const email = profile.email.trim().toLowerCase()
  const sql = await ensureSchema()

  const linked = await sql`
    SELECT u.id, u.email, u.name, u.avatar_url, u.is_pro
    FROM perfectly_oauth_accounts a
    JOIN perfectly_users u ON u.id = a.user_id
    WHERE a.provider = ${provider} AND a.provider_user_id = ${profile.providerUserId}
    LIMIT 1
  `
  if (linked.length) return publicUser(linked[0])

  const existing = await sql`SELECT id, email, name, avatar_url, is_pro FROM perfectly_users WHERE email = ${email} LIMIT 1`
  let user = existing[0]
  if (!user) {
    const id = randomUUID()
    const inserted = await sql`
      INSERT INTO perfectly_users (id, email, name, avatar_url)
      VALUES (${id}::uuid, ${email}, ${profile.name || email.split('@')[0]}, ${profile.avatarUrl || null})
      RETURNING id, email, name, avatar_url, is_pro
    `
    user = inserted[0]
  }

  await sql`
    INSERT INTO perfectly_oauth_accounts (id, user_id, provider, provider_user_id)
    VALUES (${randomUUID()}::uuid, ${user.id}::uuid, ${provider}, ${profile.providerUserId})
    ON CONFLICT (provider, provider_user_id) DO NOTHING
  `
  return publicUser(user)
}

export function readOAuthState(req) {
  return cookieValue(req, OAUTH_STATE_COOKIE)
}

export function readOAuthNext(req) {
  return safeNextPath(cookieValue(req, OAUTH_NEXT_COOKIE))
}
