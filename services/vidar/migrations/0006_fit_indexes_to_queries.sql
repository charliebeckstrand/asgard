-- The UNIQUE constraint on ip already makes an index.
DROP INDEX IF EXISTS ix_vdr_bans_ip;

-- Rules read the newest threat of one address and rule, and the admin list
-- filters by address, which this index's first column serves.
CREATE INDEX IF NOT EXISTS ix_vdr_threats_ip_type_created_at
    ON vdr_threats (ip, threat_type, created_at);

DROP INDEX IF EXISTS ix_vdr_threats_ip;

-- The admin list filters on resolved, but over 30 days of threats a boolean
-- index narrows too little to be used.
DROP INDEX IF EXISTS ix_vdr_threats_resolved;
