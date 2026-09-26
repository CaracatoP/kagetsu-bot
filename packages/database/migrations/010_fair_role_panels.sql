CREATE TABLE IF NOT EXISTS role_panel_fair_assignments (
  guild_id TEXT NOT NULL,
  resource_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (guild_id, resource_id, user_id),
  FOREIGN KEY (guild_id, resource_id) REFERENCES guild_resources(guild_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS role_panel_fair_counts_idx
  ON role_panel_fair_assignments(guild_id, resource_id, option_id);