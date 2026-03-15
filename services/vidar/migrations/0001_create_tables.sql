CREATE TABLE IF NOT EXISTS vdr_security_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ip          VARCHAR(45) NOT NULL,
    event_type  VARCHAR(100) NOT NULL,
    details     JSONB       NOT NULL DEFAULT '{}',
    service     VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_vdr_security_events_lookup
    ON vdr_security_events (ip, event_type, created_at);

CREATE TABLE IF NOT EXISTS vdr_bans (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ip          VARCHAR(45) NOT NULL UNIQUE,
    reason      TEXT        NOT NULL,
    rule_id     VARCHAR(100),
    created_by  VARCHAR(100) NOT NULL DEFAULT 'system',
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_vdr_bans_ip ON vdr_bans (ip);
CREATE INDEX IF NOT EXISTS ix_vdr_bans_expires_at ON vdr_bans (expires_at);

CREATE TABLE IF NOT EXISTS vdr_threats (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    threat_type  VARCHAR(100) NOT NULL,
    severity     VARCHAR(20)  NOT NULL DEFAULT 'medium',
    ip           VARCHAR(45)  NOT NULL,
    details      JSONB        NOT NULL DEFAULT '{}',
    action_taken VARCHAR(100),
    resolved     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_vdr_threats_ip ON vdr_threats (ip);
CREATE INDEX IF NOT EXISTS ix_vdr_threats_resolved ON vdr_threats (resolved);
