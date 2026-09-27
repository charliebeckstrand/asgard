-- One JSON document for each user and each name: `places` holds the list of
-- places, and `visits` holds the visited regions. The handlers parse each
-- document when they read it, so the shape of a document is not a column.
--
-- In production this is the `places` database that Midgard created, which
-- already has this table, so the statement only records itself there.
CREATE TABLE IF NOT EXISTS documents (
	user_id uuid NOT NULL,
	name text NOT NULL,
	value jsonb NOT NULL,
	updated_at timestamptz NOT NULL DEFAULT now(),
	PRIMARY KEY (user_id, name)
);
