-- Supports the retention purge, which deletes by age alone
CREATE INDEX IF NOT EXISTS ix_vdr_security_events_created_at
    ON vdr_security_events (created_at);
