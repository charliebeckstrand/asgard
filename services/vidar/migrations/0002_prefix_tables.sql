-- Rename tables to use vdr_ prefix
ALTER TABLE IF EXISTS security_events RENAME TO vdr_security_events;
ALTER TABLE IF EXISTS bans RENAME TO vdr_bans;
ALTER TABLE IF EXISTS threats RENAME TO vdr_threats;

-- Rename indexes
ALTER INDEX IF EXISTS ix_security_events_lookup RENAME TO ix_vdr_security_events_lookup;
ALTER INDEX IF EXISTS ix_bans_ip RENAME TO ix_vdr_bans_ip;
ALTER INDEX IF EXISTS ix_bans_expires_at RENAME TO ix_vdr_bans_expires_at;
ALTER INDEX IF EXISTS ix_threats_ip RENAME TO ix_vdr_threats_ip;
ALTER INDEX IF EXISTS ix_threats_resolved RENAME TO ix_vdr_threats_resolved;
