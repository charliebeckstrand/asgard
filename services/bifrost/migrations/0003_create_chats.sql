CREATE TABLE chats (
    id          UUID        PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_chats_user_id ON chats (user_id);

CREATE TRIGGER trg_chats_updated_at
    BEFORE UPDATE ON chats
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE TABLE chat_messages (
    id         UUID        PRIMARY KEY,
    chat_id    UUID        NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role       VARCHAR(10) NOT NULL CHECK (role IN ('user', 'agent')),
    message    TEXT        NOT NULL,
    tool       JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_chat_messages_chat_id ON chat_messages (chat_id);
