CREATE SCHEMA IF NOT EXISTS users;

CREATE TABLE IF NOT EXISTS users (
    id          UUID        PRIMARY KEY,
    email       VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    is_verified BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email);
