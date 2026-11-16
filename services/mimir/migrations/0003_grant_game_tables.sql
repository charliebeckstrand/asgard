-- In production, Mimir connects as the `places` user, and this job connects as
-- the admin user, which owns each table that a migration creates. The `places`
-- user owns `documents`, because Midgard created it, but it has no access to a
-- table of the admin user until a grant gives it. With no grant, each write of
-- a run fails on `game_players`.
--
-- This gives `places` the rows of the game tables, and of each table that a
-- later migration creates. It changes no schema rights. A database with no
-- `places` user, as in local work and in tests, skips it.
DO $$
BEGIN
	IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'places') THEN
		GRANT SELECT, INSERT, UPDATE, DELETE ON game_results, game_players TO places;

		ALTER DEFAULT PRIVILEGES IN SCHEMA public
			GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO places;
	END IF;
END
$$;
