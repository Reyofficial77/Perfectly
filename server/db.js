import { neon } from '@neondatabase/serverless'

let sqlClient
let schemaPromise

export function getSql() {
  if (!process.env.DATABASE_URL) {
    const error = new Error('Neon database belum dikonfigurasi. Tambahkan DATABASE_URL di Vercel → Settings → Environment Variables.')
    error.status = 503
    throw error
  }
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL)
  return sqlClient
}

export async function ensureSchema() {
  const sql = getSql()
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS perfectly_users (
          id UUID PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT,
          name TEXT,
          avatar_url TEXT,
          is_pro BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await sql`ALTER TABLE perfectly_users ADD COLUMN IF NOT EXISTS is_pro BOOLEAN NOT NULL DEFAULT FALSE`
      await sql`
        CREATE TABLE IF NOT EXISTS perfectly_oauth_accounts (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES perfectly_users(id) ON DELETE CASCADE,
          provider TEXT NOT NULL CHECK (provider IN ('google', 'github')),
          provider_user_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (provider, provider_user_id)
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS perfectly_sessions (
          token_hash TEXT PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES perfectly_users(id) ON DELETE CASCADE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS perfectly_conversations (
          id UUID PRIMARY KEY,
          public_id TEXT,
          user_id UUID NOT NULL REFERENCES perfectly_users(id) ON DELETE CASCADE,
          title TEXT NOT NULL DEFAULT 'New conversation',
          model TEXT NOT NULL DEFAULT 'beam',
          messages JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `
      // Add a public 25-character URL ID without changing the existing UUID primary key.
      await sql`ALTER TABLE perfectly_conversations ADD COLUMN IF NOT EXISTS public_id TEXT`
      await sql`
        UPDATE perfectly_conversations
        SET public_id = SUBSTRING(TRANSLATE(REPLACE(gen_random_uuid()::text, '-', ''), '0123456789abcdef', 'abcdefghijklmnop'), 1, 25)
        WHERE public_id IS NULL
      `
      await sql`ALTER TABLE perfectly_conversations ALTER COLUMN public_id SET NOT NULL`
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS perfectly_conversations_public_id_idx ON perfectly_conversations(public_id)`
      await sql`CREATE INDEX IF NOT EXISTS perfectly_sessions_user_idx ON perfectly_sessions(user_id)`
      await sql`CREATE INDEX IF NOT EXISTS perfectly_sessions_expiry_idx ON perfectly_sessions(expires_at)`
      await sql`CREATE INDEX IF NOT EXISTS perfectly_conversations_user_updated_idx ON perfectly_conversations(user_id, updated_at DESC)`
      return true
    })().catch((error) => {
      schemaPromise = null
      throw error
    })
  }
  await schemaPromise
  return sql
}

export async function checkDatabase() {
  try {
    const sql = await ensureSchema()
    const rows = await sql`SELECT NOW() AS server_time`
    return { configured: true, connected: true, serverTime: rows[0]?.server_time || null }
  } catch (error) {
    return { configured: Boolean(process.env.DATABASE_URL), connected: false, error: error.status === 503 ? error.message : 'Neon database tidak dapat dihubungi.' }
  }
}
