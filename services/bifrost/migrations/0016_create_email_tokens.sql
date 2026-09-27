-- One row per link emailed to a user: a link that verifies their email, or one
-- that sets a new password. `id` is the SHA-256 of the token in the link, and
-- the row is deleted when the link is used. A user has at most one live link of
-- each purpose; `created_at` spaces the emails out.
CREATE TABLE IF NOT EXISTS email_tokens (
    id         TEXT        PRIMARY KEY,
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    purpose    TEXT        NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, purpose)
);

CREATE INDEX IF NOT EXISTS ix_email_tokens_expires_at ON email_tokens (expires_at);
