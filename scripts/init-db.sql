-- heimdall: users
CREATE TABLE IF NOT EXISTS users (
    id              UUID        PRIMARY KEY,
    email           VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    is_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- vidar: security_events, bans, threats
CREATE TABLE IF NOT EXISTS security_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ip          VARCHAR(45) NOT NULL,
    event_type  VARCHAR(100) NOT NULL,
    details     JSONB       NOT NULL DEFAULT '{}',
    service     VARCHAR(100) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_security_events_lookup
    ON security_events (ip, event_type, created_at);

CREATE TABLE IF NOT EXISTS bans (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ip          VARCHAR(45) NOT NULL UNIQUE,
    reason      TEXT        NOT NULL,
    rule_id     VARCHAR(100),
    created_by  VARCHAR(100) NOT NULL DEFAULT 'system',
    expires_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_bans_ip ON bans (ip);
CREATE INDEX IF NOT EXISTS ix_bans_expires_at ON bans (expires_at);

CREATE TABLE IF NOT EXISTS threats (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    threat_type  VARCHAR(100) NOT NULL,
    severity     VARCHAR(20)  NOT NULL DEFAULT 'medium',
    ip           VARCHAR(45)  NOT NULL,
    details      JSONB        NOT NULL DEFAULT '{}',
    action_taken VARCHAR(100),
    resolved     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_threats_ip ON threats (ip);
CREATE INDEX IF NOT EXISTS ix_threats_resolved ON threats (resolved);

-- saga: logs
CREATE SCHEMA IF NOT EXISTS saga;

CREATE TABLE IF NOT EXISTS saga.logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL DEFAULT 'server',
    level VARCHAR(10) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    service VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logs_type ON saga.logs(type);
CREATE INDEX IF NOT EXISTS idx_logs_service ON saga.logs(service);
CREATE INDEX IF NOT EXISTS idx_logs_level ON saga.logs(level);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON saga.logs(created_at);

-- huginn: subscriptions, events, deliveries
CREATE SCHEMA IF NOT EXISTS huginn;

CREATE TABLE IF NOT EXISTS huginn.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic VARCHAR(255) NOT NULL,
    callback_url TEXT NOT NULL,
    service VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_topic ON huginn.subscriptions(topic) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS huginn.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    source VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_topic ON huginn.events(topic);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON huginn.events(created_at);

CREATE TABLE IF NOT EXISTS huginn.deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES huginn.events(id),
    subscription_id UUID NOT NULL REFERENCES huginn.subscriptions(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    response_status INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_status ON huginn.deliveries(status) WHERE status = 'pending';
