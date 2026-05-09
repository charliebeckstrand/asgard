CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS hrm_chats (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_hrm_chats_user_id ON hrm_chats (user_id);

DO $$ BEGIN
    CREATE TRIGGER trg_hrm_chats_updated_at
        BEFORE UPDATE ON hrm_chats
        FOR EACH ROW
        EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS hrm_chat_messages (
    id         UUID        PRIMARY KEY,
    chat_id    UUID        NOT NULL REFERENCES hrm_chats(id) ON DELETE CASCADE,
    role       VARCHAR(10) NOT NULL CHECK (role IN ('user', 'agent')),
    type       VARCHAR(20) NOT NULL DEFAULT 'text',
    content    TEXT        NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_hrm_chat_messages_chat_id ON hrm_chat_messages (chat_id);
