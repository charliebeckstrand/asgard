-- The numbers app no longer has a daily puzzle (Charlie, 2026-11-18), so its
-- data goes: the rows of the `daily` board in `game_results`, and the `daily`
-- object of each mode of each `numbers` document, which holds the score of the
-- first run of each daily puzzle by its date. The runs of the daily puzzles stay
-- in the score counts of each mode, because the counts do not tell which run
-- was a daily puzzle. The code that stops reading and writing the daily data
-- deploys with it. A run that the old code counts during the deploy can leave a
-- daily row or score, which nothing reads, and the next counted run of its mode
-- drops the score.
DELETE FROM game_results WHERE game = 'numbers' AND mode = 'daily';

-- A mode that is not an object has no `daily` key, and stays as it is.
UPDATE documents
SET value = jsonb_set(value, '{solo}', (value -> 'solo') - 'daily')
WHERE name = 'numbers'
	AND jsonb_typeof(value -> 'solo') = 'object'
	AND value -> 'solo' ? 'daily';

UPDATE documents
SET value = jsonb_set(value, '{vsCpu}', (value -> 'vsCpu') - 'daily')
WHERE name = 'numbers'
	AND jsonb_typeof(value -> 'vsCpu') = 'object'
	AND value -> 'vsCpu' ? 'daily';
