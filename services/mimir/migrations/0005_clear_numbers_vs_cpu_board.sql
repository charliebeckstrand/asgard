-- The `vsCpu` leaderboard of the numbers app now keeps only the runs that beat
-- the CPU. The rows from before that change can come from a tie or a loss, and
-- no column tells them apart, so they go. This migration runs after Mimir takes
-- `beatCpu`, so no new row comes from a tie or a loss. The stats of each user
-- stay in their `numbers` document.
DELETE FROM game_results WHERE game = 'numbers' AND mode = 'vsCpu';
