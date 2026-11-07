-- Perfectly Neon PostgreSQL schema.
-- The Vercel API also creates these tables automatically on first request.

CREATE TABLE IF NOT EXISTS perfectly_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS perfectly_oauth_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES perfectly_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'github')),
  provider_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE IF NOT EXISTS perfectly_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES perfectly_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS perfectly_conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES perfectly_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  model TEXT NOT NULL DEFAULT 'beam',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS perfectly_sessions_user_idx ON perfectly_sessions(user_id);
CREATE INDEX IF NOT EXISTS perfectly_sessions_expiry_idx ON perfectly_sessions(expires_at);
CREATE INDEX IF NOT EXISTS perfectly_conversations_user_updated_idx ON perfectly_conversations(user_id, updated_at DESC);
