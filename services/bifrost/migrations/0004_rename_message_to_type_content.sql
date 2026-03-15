ALTER TABLE chat_messages RENAME COLUMN message TO content;

ALTER TABLE chat_messages
    ADD COLUMN type VARCHAR(20) NOT NULL DEFAULT 'text';
