CREATE TABLE IF NOT EXISTS guilds (
  id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', installed BOOLEAN NOT NULL DEFAULT false,
  legacy_imported BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO guilds(id) SELECT DISTINCT guild_id FROM user_levels ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY REFERENCES guilds(id), config JSONB NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS guild_resources (
  id UUID NOT NULL, guild_id TEXT NOT NULL REFERENCES guilds(id), kind TEXT NOT NULL,
  data JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'draft', channel_id TEXT, message_id TEXT,
  version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,id), CHECK(status IN ('draft','published','closed'))
);
CREATE INDEX IF NOT EXISTS guild_resources_kind_idx ON guild_resources(guild_id,kind);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id), user_id TEXT NOT NULL,
  action TEXT NOT NULL,target TEXT,old_value JSONB,new_value JSONB,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_logs_guild_time_idx ON audit_logs(guild_id,created_at DESC);
CREATE TABLE IF NOT EXISTS bot_jobs (
  id UUID PRIMARY KEY,guild_id TEXT NOT NULL REFERENCES guilds(id),actor_id TEXT NOT NULL,
  action TEXT NOT NULL,payload JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'pending',result JSONB,error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK(status IN ('pending','running','done','failed'))
);
CREATE INDEX IF NOT EXISTS bot_jobs_pending_idx ON bot_jobs(status,available_at);
CREATE INDEX IF NOT EXISTS bot_jobs_guild_idx ON bot_jobs(guild_id,created_at DESC);
CREATE TABLE IF NOT EXISTS bot_status(instance_id TEXT PRIMARY KEY,last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),guild_ids TEXT[] NOT NULL DEFAULT '{}',started_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS member_profiles (
  guild_id TEXT NOT NULL REFERENCES guilds(id),user_id TEXT NOT NULL,badges JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id)
);
CREATE TABLE IF NOT EXISTS analytics_daily (
  guild_id TEXT NOT NULL REFERENCES guilds(id),user_id TEXT NOT NULL,day DATE NOT NULL,
  messages BIGINT NOT NULL DEFAULT 0,voice_seconds BIGINT NOT NULL DEFAULT 0,xp BIGINT NOT NULL DEFAULT 0,
  joins INTEGER NOT NULL DEFAULT 0,leaves INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id,day)
);
CREATE INDEX IF NOT EXISTS analytics_daily_period_idx ON analytics_daily(guild_id,day);
CREATE TABLE IF NOT EXISTS member_season_xp (
  guild_id TEXT NOT NULL,season_id UUID NOT NULL,user_id TEXT NOT NULL,xp BIGINT NOT NULL DEFAULT 0,
  lifetime_xp BIGINT NOT NULL DEFAULT 0,prestige INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(guild_id,season_id,user_id),FOREIGN KEY(guild_id,season_id) REFERENCES guild_resources(guild_id,id),
  CHECK(xp>=0),CHECK(lifetime_xp>=0)
);
CREATE INDEX IF NOT EXISTS season_leaderboard_idx ON member_season_xp(guild_id,season_id,xp DESC);
CREATE TABLE IF NOT EXISTS member_achievements (
  guild_id TEXT NOT NULL,resource_id UUID NOT NULL,user_id TEXT NOT NULL,earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(guild_id,resource_id,user_id),FOREIGN KEY(guild_id,resource_id) REFERENCES guild_resources(guild_id,id)
);
CREATE TABLE IF NOT EXISTS mission_claims (
  guild_id TEXT NOT NULL,resource_id UUID NOT NULL,user_id TEXT NOT NULL,period TEXT NOT NULL,
  xp BIGINT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,resource_id,user_id,period),
  FOREIGN KEY(guild_id,resource_id) REFERENCES guild_resources(guild_id,id)
);
CREATE OR REPLACE FUNCTION kagetsu_level(total BIGINT, curve JSONB) RETURNS INTEGER LANGUAGE SQL IMMUTABLE AS $$
 SELECT LEAST(2147483647, GREATEST(0, CASE curve->>'type'
 WHEN 'linear' THEN FLOOR(total::numeric / GREATEST(1,(curve->>'base')::numeric))
 WHEN 'custom' THEN (SELECT COUNT(*) FROM jsonb_array_elements_text(curve->'thresholds') value WHERE value::numeric <= total)
 ELSE FLOOR((SQRT(1 + 4*total::numeric / GREATEST(1,COALESCE((curve->>'coefficient')::numeric,50))) - 1) / 2)
 END))::INTEGER
$$;
