-- A user holds a set of roles. `user` lets an account change data in the apps,
-- and `admin` lets it manage other users. An account with no role can sign in
-- but change nothing. The `role` column stays until the code that reads it is
-- gone, and a later migration drops it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT '{user}'
    CHECK (roles <@ ARRAY['user', 'admin']);

UPDATE users SET roles = CASE role WHEN 'admin' THEN '{user,admin}'::TEXT[] ELSE '{user}'::TEXT[] END;
