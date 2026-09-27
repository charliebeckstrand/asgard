-- Emails are stored trimmed and lowercase, so the unique index can't hold two
-- accounts that differ only by case. The code normalizes every email it takes
-- in; this makes the database refuse one that slips past.
ALTER TABLE users ADD CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)));
