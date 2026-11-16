-- The score of the first run of each daily puzzle, one row for each game, mode,
-- date and user, so a leaderboard can read one date of all users. The `numbers`
-- document keeps the same scores for the stats of each user.
CREATE TABLE IF NOT EXISTS game_results (
	game text NOT NULL,
	mode text NOT NULL,
	day date NOT NULL,
	user_id uuid NOT NULL,
	score smallint NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (game, mode, day, user_id)
);

-- A leaderboard reads the rows of one date by score, and ties in the order
-- they finished.
CREATE INDEX IF NOT EXISTS ix_game_results_board
	ON game_results (game, mode, day, score DESC, created_at);

-- The name each user shows on the leaderboards of every game. A user with no
-- row shows as anonymous.
CREATE TABLE IF NOT EXISTS game_players (
	user_id uuid PRIMARY KEY,
	name text NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now()
);

-- Copies the daily scores that the `numbers` documents already hold. The time
-- of each run is not known, so the time of the last write of its document
-- takes its place. That time only orders ties.
INSERT INTO game_results (game, mode, day, user_id, score, created_at)
SELECT 'numbers', modes.mode, to_date(daily.key, 'YYYYMMDD'), documents.user_id,
	daily.value::smallint, documents.updated_at
FROM documents
CROSS JOIN (VALUES ('solo'), ('vsCpu')) AS modes (mode)
CROSS JOIN LATERAL jsonb_each_text(
	CASE
		WHEN jsonb_typeof(documents.value -> modes.mode -> 'daily') = 'object'
		THEN documents.value -> modes.mode -> 'daily'
		ELSE '{}'::jsonb
	END
) AS daily
WHERE documents.name = 'numbers'
	AND daily.key ~ '^\d{8}$'
	AND daily.value ~ '^\d{1,2}$'
	AND daily.value::int <= 20
ON CONFLICT DO NOTHING;
