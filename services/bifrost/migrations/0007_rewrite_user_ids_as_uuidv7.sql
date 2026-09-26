-- Moves users created before 0006 onto uuidv7 ids, with the time in each id set
-- to the user's created_at, so ids sort by sign-up like the new ones do. Rows
-- that point at a user follow the change through ON UPDATE CASCADE.
ALTER TABLE sessions
    DROP CONSTRAINT sessions_user_id_fkey,
    ADD CONSTRAINT sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE passkeys
    DROP CONSTRAINT passkeys_user_id_fkey,
    ADD CONSTRAINT passkeys_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE challenges
    DROP CONSTRAINT challenges_user_id_fkey,
    ADD CONSTRAINT challenges_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE;

-- Leaves updated_at alone: the account itself didn't change.
ALTER TABLE users DISABLE TRIGGER trg_users_updated_at;

UPDATE users
SET id = uuidv7(created_at - clock_timestamp())
WHERE uuid_extract_version(id) <> 7;

ALTER TABLE users ENABLE TRIGGER trg_users_updated_at;
