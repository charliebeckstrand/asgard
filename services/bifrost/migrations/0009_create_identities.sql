-- An account made with GitHub or Google has no password.
ALTER TABLE users ALTER COLUMN hashed_password DROP NOT NULL;

-- A GitHub or Google account that signs in as a user. `subject` is the ID the
-- provider gives the account, which stays the same when its email changes. A
-- user has at most one identity for each provider.
CREATE TABLE IF NOT EXISTS identities (
    provider   TEXT        NOT NULL CHECK (provider IN ('github', 'google')),
    subject    TEXT        NOT NULL,
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    email      TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (provider, subject),
    UNIQUE (user_id, provider)
);

-- A sign-in that waits on the provider. `id` is the SHA-256 of the `state`
-- parameter. `user_id` is set when a signed-in user connects an account.
CREATE TABLE IF NOT EXISTS oauth_states (
    id         TEXT        PRIMARY KEY,
    provider   TEXT        NOT NULL,
    verifier   TEXT        NOT NULL,
    origin     TEXT        NOT NULL,
    return_to  TEXT        NOT NULL,
    user_id    UUID        REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_oauth_states_expires_at ON oauth_states (expires_at);
