-- One authenticator app per user. The secret is encrypted with MFA_ENCRYPTION_KEY.
-- `confirmed_at` is null until the user proves the app works with a first code.
-- `last_step` is the newest TOTP step used, so a code can't be replayed.
CREATE TABLE IF NOT EXISTS totp_secrets (
    user_id      UUID        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    secret       BYTEA       NOT NULL,
    last_step    BIGINT      NOT NULL DEFAULT 0,
    confirmed_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-use recovery codes, stored as their SHA-256. A used code is deleted.
CREATE TABLE IF NOT EXISTS recovery_codes (
    user_id   UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    PRIMARY KEY (user_id, code_hash)
);

-- A sign-in waiting on its second factor. `id` is the SHA-256 of the token in
-- the `__Host-mfa` cookie. Each try uses one of a few attempts.
CREATE TABLE IF NOT EXISTS login_tickets (
    id         TEXT        PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    attempts   INT         NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_login_tickets_expires_at ON login_tickets (expires_at);
