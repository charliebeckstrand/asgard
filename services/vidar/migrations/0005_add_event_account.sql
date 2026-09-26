-- The account an event names, computed from its details when read, so it costs
-- no storage and can't disagree with them.
ALTER TABLE vdr_security_events
    ADD COLUMN IF NOT EXISTS account TEXT GENERATED ALWAYS AS (details ->> 'email') VIRTUAL;
