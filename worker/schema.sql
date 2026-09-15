-- Shareable settings entries. The Settings ID is stored in plain text so it can
-- be shared like a playlist link and listed in Master Admin. Nothing about the
-- visitor is recorded: no IP address, no user agent, no device details.
CREATE TABLE IF NOT EXISTS settings (
	id text PRIMARY KEY NOT NULL,
	owner text NOT NULL,
	data text NOT NULL,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	save_count integer NOT NULL DEFAULT 1
);
