CREATE SCHEMA IF NOT EXISTS saga;

CREATE TABLE saga.logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL DEFAULT 'server',
    level VARCHAR(10) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
    service VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_logs_type ON saga.logs(type);
CREATE INDEX idx_logs_service ON saga.logs(service);
CREATE INDEX idx_logs_level ON saga.logs(level);
CREATE INDEX idx_logs_created_at ON saga.logs(created_at);
