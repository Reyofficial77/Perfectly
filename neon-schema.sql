-- Perfectly Neon PostgreSQL schema.
-- Run this once in Neon SQL Editor, or let the Vercel API create/migrate tables automatically.

CREATE TABLE IF NOT EXISTS perfectly_users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name TEXT,
  avatar_url TEXT,
  is_pro BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE perfectly_users ADD COLUMN IF NOT EXISTS is_pro BOOLEAN NOT NULL DEFAULT FALSE;

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
  public_id TEXT,
  user_id UUID NOT NULL REFERENCES perfectly_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New conversation',
  model TEXT NOT NULL DEFAULT 'beam',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe migration for installations created before public 25-character chat URLs.
ALTER TABLE perfectly_conversations ADD COLUMN IF NOT EXISTS public_id TEXT;
UPDATE perfectly_conversations
SET public_id = SUBSTRING(TRANSLATE(REPLACE(gen_random_uuid()::text, '-', ''), '0123456789abcdef', 'abcdefghijklmnop'), 1, 25)
WHERE public_id IS NULL;
ALTER TABLE perfectly_conversations ALTER COLUMN public_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS perfectly_sessions_user_idx ON perfectly_sessions(user_id);
CREATE INDEX IF NOT EXISTS perfectly_sessions_expiry_idx ON perfectly_sessions(expires_at);
CREATE INDEX IF NOT EXISTS perfectly_conversations_user_updated_idx ON perfectly_conversations(user_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS perfectly_conversations_public_id_idx ON perfectly_conversations(public_id);

-- Promote a user to Pro manually from Neon SQL Editor:
-- UPDATE perfectly_users SET is_pro = TRUE WHERE email = 'user@example.com';
