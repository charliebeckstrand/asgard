-- One row per email sent in the last day, so bifrost stays inside the email
-- provider's daily quota and a flood of sign-ups can't use up what verified
-- accounts need. `verified` is whether the address was proven when it was sent.
-- The hourly sweep deletes rows a day old.
CREATE TABLE IF NOT EXISTS sent_emails (
    recipient TEXT        NOT NULL,
    verified  BOOLEAN     NOT NULL,
    sent_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_sent_emails_sent_at ON sent_emails (sent_at);
