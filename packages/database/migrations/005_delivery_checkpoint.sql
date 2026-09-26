ALTER TABLE guild_resources ADD COLUMN IF NOT EXISTS delivery_state TEXT NOT NULL DEFAULT 'idle';
ALTER TABLE guild_resources ADD COLUMN IF NOT EXISTS delivery_nonce TEXT;
