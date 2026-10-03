-- The name a user gives at sign-up, for the apps to show. It is null when the
-- user gave none, as with each account made before this column and each made
-- with GitHub or Google.
ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255);
