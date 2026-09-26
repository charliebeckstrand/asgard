-- One row per passkey. `id` is the credential ID the authenticator chose; only
-- the public key is stored.
CREATE TABLE IF NOT EXISTS passkeys (
    id         TEXT        PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    public_key BYTEA       NOT NULL,
    counter    BIGINT      NOT NULL DEFAULT 0,
    transports TEXT[]      NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_passkeys_user_id ON passkeys (user_id);

-- One row per passkey ceremony, deleted when used so it can't be replayed. A
-- challenge with a user adds a passkey to that user; one without signs in.
CREATE TABLE IF NOT EXISTS challenges (
    id         TEXT        PRIMARY KEY,
    user_id    UUID        REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_challenges_expires_at ON challenges (expires_at);
