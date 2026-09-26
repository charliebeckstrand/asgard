-- The `roles` column replaced `role`, and no code reads `role` now.
ALTER TABLE users DROP COLUMN IF EXISTS role;
