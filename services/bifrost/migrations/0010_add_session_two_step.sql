-- Whether the session passed a second step: a passkey sign-in, or a passkey,
-- an app code or a recovery code checked on it. Admin routes and changes to how
-- a user signs in need it. `failed_steps` counts wrong checks; the fifth ends
-- the session.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS two_step BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS failed_steps INT NOT NULL DEFAULT 0;
