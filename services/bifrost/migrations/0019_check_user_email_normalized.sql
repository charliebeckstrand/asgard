-- Emails are stored trimmed and lowercase, so the unique index can't hold two
-- accounts that differ only by case. The code normalizes every email it takes
-- in; this makes the database refuse one that slips past.
--
-- Sign-in looks emails up normalized, so a row stored otherwise couldn't sign
-- in; normalizing it lets it. If two rows would then collide, the unique index
-- fails this migration and the deploy stops without changing anything.
UPDATE users SET email = lower(btrim(email)) WHERE email <> lower(btrim(email));

ALTER TABLE users ADD CONSTRAINT users_email_normalized CHECK (email = lower(btrim(email)));
