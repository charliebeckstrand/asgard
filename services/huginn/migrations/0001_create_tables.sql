CREATE SCHEMA IF NOT EXISTS huginn;

-- Subscriptions: which services want which events
CREATE TABLE huginn.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic VARCHAR(255) NOT NULL,
    callback_url TEXT NOT NULL,
    service VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_subscriptions_topic ON huginn.subscriptions(topic) WHERE is_active = TRUE;

-- Events: log of all published events
CREATE TABLE huginn.events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    source VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_events_topic ON huginn.events(topic);
CREATE INDEX idx_events_created_at ON huginn.events(created_at);

-- Deliveries: track delivery attempts per event per subscription
CREATE TABLE huginn.deliveries (
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

CREATE INDEX idx_deliveries_status ON huginn.deliveries(status) WHERE status = 'pending';
