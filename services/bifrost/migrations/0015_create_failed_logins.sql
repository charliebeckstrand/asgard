-- Wrong passwords for an email, whether or not an account has it, so the limit
-- says nothing about which emails are registered. A try counts before its
-- password is checked, and a right password deletes the row. Past the limit,
-- the next try waits until a while after the last one.
CREATE TABLE IF NOT EXISTS failed_logins (
    email          TEXT        PRIMARY KEY,
    count          INT         NOT NULL DEFAULT 1,
    last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_failed_logins_last_failed_at ON failed_logins (last_failed_at);
