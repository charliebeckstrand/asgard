-- Time-ordered ids keep inserts at the end of each primary key index.
ALTER TABLE vdr_security_events ALTER COLUMN id SET DEFAULT uuidv7();
ALTER TABLE vdr_bans ALTER COLUMN id SET DEFAULT uuidv7();
ALTER TABLE vdr_threats ALTER COLUMN id SET DEFAULT uuidv7();
