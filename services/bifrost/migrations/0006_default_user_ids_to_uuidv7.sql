-- New users get time-ordered ids, so inserts land at the end of the primary key
-- index instead of scattering across it. Existing ids stay as they are.
ALTER TABLE users ALTER COLUMN id SET DEFAULT uuidv7();
