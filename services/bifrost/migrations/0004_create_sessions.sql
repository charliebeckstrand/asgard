-- One row per login. The refresh token carries the session id and the jti it
-- was minted with; each refresh rotates `refresh_jti`, so presenting an older
-- jti (outside a short grace window) means the token was replayed.
CREATE TABLE IF NOT EXISTS sessions (
    id           UUID        PRIMARY KEY,
    user_id      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    refresh_jti  UUID        NOT NULL,
    previous_jti UUID,
    rotated_at   TIMESTAMPTZ,
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sessions_user_id ON sessions (user_id);
