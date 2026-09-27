-- One row per sign-up in the last day, by the network it came from, so one
-- person can't make accounts without end. An IPv6 address counts as its /64,
-- since one home or server is handed a whole /64. The hourly sweep deletes rows
-- a day old.
CREATE TABLE IF NOT EXISTS sign_ups (
    network    CIDR        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sign_ups_network_created_at ON sign_ups (network, created_at);
