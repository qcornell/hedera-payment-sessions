-- server/src/db/schema.sql

-- PAYMENT SESSIONS
CREATE TABLE IF NOT EXISTS payment_sessions (
  id uuid PRIMARY KEY,
  user_account_id text NOT NULL,
  spender_account_id text NOT NULL,
  product_name text,
  allowance_cap_tinybars bigint NOT NULL,
  total_charged_tinybars bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_charged_at timestamptz,
  created_tx_id text
);

-- Optional: ensure only ONE active session per user->spender
-- (If this fails, it means you already have duplicate active sessions)
CREATE UNIQUE INDEX IF NOT EXISTS payment_sessions_active_uniq
ON payment_sessions(user_account_id, spender_account_id)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS payment_sessions_user_spender_idx
ON payment_sessions(user_account_id, spender_account_id);


-- CHARGES
CREATE TABLE IF NOT EXISTS charges (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES payment_sessions(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  amount_tinybars bigint NOT NULL,
  request_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | success | failed
  tx_id text,
  error text,
  charged_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- THIS is the key one your code needs:
CREATE UNIQUE INDEX IF NOT EXISTS charges_idempotency_key_uniq
ON charges(idempotency_key);

CREATE INDEX IF NOT EXISTS charges_session_id_idx
ON charges(session_id);

CREATE INDEX IF NOT EXISTS charges_charged_at_idx
ON charges(charged_at DESC);
