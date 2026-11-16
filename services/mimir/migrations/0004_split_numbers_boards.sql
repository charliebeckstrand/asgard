-- The numbers app has three leaderboards for each day: `daily` for the solo
-- runs of the daily puzzle, `solo` for the solo runs of other seeds, and `vsCpu`
-- for the runs against the CPU. The `mode` column of `game_results` names the
-- board. Until now, only the runs of the daily puzzle went in, so each `solo`
-- row is a run of the daily puzzle, and moves to `daily`. Each `vsCpu` row is a
-- run against the CPU, so it stays.
UPDATE game_results SET mode = 'daily' WHERE game = 'numbers' AND mode = 'solo';
