DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='user_levels_guild_fk' AND conrelid='user_levels'::regclass) THEN
  ALTER TABLE user_levels ADD CONSTRAINT user_levels_guild_fk FOREIGN KEY(guild_id) REFERENCES guilds(id);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='tickets_resource_fk' AND conrelid='tickets'::regclass) THEN
  ALTER TABLE tickets ADD CONSTRAINT tickets_resource_fk FOREIGN KEY(guild_id,resource_id) REFERENCES guild_resources(guild_id,id);
 END IF;
END $$;
