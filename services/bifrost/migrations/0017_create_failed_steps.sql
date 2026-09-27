-- Wrong second steps for a user, across all their sessions, so signing in again
-- doesn't buy more guesses at an authenticator code. A try counts before its
-- proof is checked, and a passed step deletes the row. Past the limit, the next
-- try waits until a while after the last one.
CREATE TABLE IF NOT EXISTS failed_steps (
    user_id        UUID        PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    count          INT         NOT NULL DEFAULT 1,
    last_failed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_failed_steps_last_failed_at ON failed_steps (last_failed_at);
