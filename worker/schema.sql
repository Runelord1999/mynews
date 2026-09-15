-- Shareable settings entries. The Settings ID is stored in plain text so it can
-- be shared like a playlist link and listed in the Master Admin panel.
CREATE TABLE IF NOT EXISTS settings (
	id text PRIMARY KEY NOT NULL,
	data text NOT NULL,
	created_at text NOT NULL,
	updated_at text NOT NULL,
	save_count integer NOT NULL DEFAULT 1,
	last_ip text,
	last_country text,
	last_city text,
	last_user_agent text,
	last_device text
);

-- Bounded access trail: the newest 20 events per Settings ID are kept.
CREATE TABLE IF NOT EXISTS settings_access (
	event_id integer PRIMARY KEY AUTOINCREMENT,
	settings_id text NOT NULL,
	action text NOT NULL,
	at text NOT NULL,
	ip text,
	country text,
	city text,
	user_agent text,
	device text
);
CREATE INDEX IF NOT EXISTS settings_access_by_id ON settings_access (settings_id, event_id DESC);
