CREATE TABLE IF NOT EXISTS settings_backups (
	key_hash text PRIMARY KEY NOT NULL,
	data text NOT NULL,
	updated_at text NOT NULL
);
