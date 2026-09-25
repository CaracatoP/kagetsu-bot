-- Additive community state. Configuration remains in guild_settings/guild_resources.
ALTER TABLE guild_resources ADD COLUMN IF NOT EXISTS published_data JSONB;
CREATE TABLE IF NOT EXISTS moderation_cases (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  target_user TEXT NOT NULL, moderator TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS moderation_cases_member_idx ON moderation_cases(guild_id,target_user,created_at DESC);
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
  resource_id UUID, channel_id TEXT NOT NULL, owner_id TEXT NOT NULL, claimed_by TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','deleted')),
  transcript TEXT, transcript_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), closed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS tickets_guild_idx ON tickets(guild_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS tickets_one_open_idx ON tickets(guild_id,owner_id,resource_id) WHERE status='open';
CREATE UNIQUE INDEX IF NOT EXISTS tickets_channel_idx ON tickets(guild_id,channel_id);
CREATE TABLE IF NOT EXISTS community_members (
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE, resource_id UUID NOT NULL,
  user_id TEXT NOT NULL, value TEXT NOT NULL DEFAULT 'joined', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,resource_id,user_id),
  FOREIGN KEY(guild_id,resource_id) REFERENCES guild_resources(guild_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS community_schedules (
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE, resource_id UUID NOT NULL,
  actor_id TEXT NOT NULL, next_run_at TIMESTAMPTZ NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,resource_id),
  FOREIGN KEY(guild_id,resource_id) REFERENCES guild_resources(guild_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS community_schedules_due_idx ON community_schedules(next_run_at) WHERE status='pending';
CREATE TABLE IF NOT EXISTS autorole_jobs (
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,user_id TEXT NOT NULL,
  run_at TIMESTAMPTZ NOT NULL,status TEXT NOT NULL DEFAULT 'pending',last_error TEXT,
  PRIMARY KEY(guild_id,user_id)
);
CREATE INDEX IF NOT EXISTS autorole_jobs_due_idx ON autorole_jobs(run_at) WHERE status='pending';
CREATE TABLE IF NOT EXISTS temp_voice_channels (
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,channel_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,channel_id),UNIQUE(guild_id,owner_id)
);
CREATE TABLE IF NOT EXISTS channel_lock_snapshots (
  guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,channel_id TEXT NOT NULL,
  send_messages BOOLEAN,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,channel_id)
);
