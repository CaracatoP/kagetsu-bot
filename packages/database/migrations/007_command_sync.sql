CREATE TABLE IF NOT EXISTS guild_command_sync (
  guild_id TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
  command_hash TEXT NOT NULL,
  command_count INTEGER NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
