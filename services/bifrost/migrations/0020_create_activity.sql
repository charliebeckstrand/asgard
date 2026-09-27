-- What happened to an account: its sign-ins, changes to how it signs in, and
-- what admins and the operator did to it. The owner sees their own; admins see
-- any account's. `actor_id` is who did it: the user, an admin, or null for the
-- operator's command line. Rows older than 90 days are swept.
CREATE TABLE IF NOT EXISTS activity (
    id         UUID        PRIMARY KEY DEFAULT uuidv7(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    actor_id   UUID        REFERENCES users (id) ON DELETE SET NULL,
    action     TEXT        NOT NULL,
    detail     TEXT,
    ip         INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_activity_user_created ON activity (user_id, created_at DESC);
