CREATE TABLE secret_history (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id    UUID         NOT NULL REFERENCES configs(id) ON DELETE CASCADE,
    value       TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX ix_secret_history_entry ON secret_history (entry_id, created_at);
