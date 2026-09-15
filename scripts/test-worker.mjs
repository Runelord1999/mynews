// Exercises the standalone Mynews API Worker against an in-memory SQLite
// database: routing, CORS, shareable settings IDs, access logging, and the
// Master Admin list/rename/delete flow with its server-side key.
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const sqlite = new DatabaseSync(':memory:');
for (const statement of readFileSync('worker/schema.sql', 'utf8').split(';')) if (statement.trim()) sqlite.exec(statement);
const count = table => sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const DB = {prepare(sql) {return {bind(...args) {return {
  async first() {return sqlite.prepare(sql).get(...args) ?? null;},
  async all() {return {results: sqlite.prepare(sql).all(...args)};},
  async run() {return sqlite.prepare(sql).run(...args);},
};}};}};

const built = await build({entryPoints: ['worker/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false});
const worker = (await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))).default;

const pages = 'https://runelord1999.github.io';
const adminKey = 'correct-horse-battery-staple';
const backup = {format: 'mynews-settings', version: 1, exportedAt: new Date().toISOString(), fontSize: 14, topics: [{name: 'AI', keywords: 'AGI'}], sites: [{name: 'Example', url: 'https://example.com/', searchUrl: ''}], articles: []};
const device = {platform: 'Windows', mobile: false, screen: '2560x1440@1x', cores: 16, timezone: 'Asia/Singapore'};

let limiterAllows = true;
const env = () => ({DB, ALLOWED_ORIGINS: pages, ADMIN_KEY: adminKey, SETTINGS_RATE_LIMITER: {async limit() {return {success: limiterAllows};}}});
const headers = extra => ({'Content-Type': 'application/json', Origin: pages, 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'TestBrowser/1.0', ...extra});
const settings = (body, e = env()) => worker.fetch(new Request('https://api.test/api/settings', {method: 'POST', headers: headers(), body: JSON.stringify(body)}), e);
const admin = (body, key = adminKey, e = env()) => worker.fetch(new Request('https://api.test/api/admin', {method: 'POST', headers: headers({'X-Admin-Key': key}), body: JSON.stringify(body)}), e);

// Routing and CORS
assert.equal((await worker.fetch(new Request('https://api.test/'), env())).status, 404);
assert.deepEqual(await (await worker.fetch(new Request('https://api.test/api/health'), env())).json(), {ok: true, database: true, admin: true});
const feed = await worker.fetch(new Request('https://api.test/api/feed?q=', {headers: {Origin: pages}}), env());
assert.equal(feed.status, 400);
assert.equal(feed.headers.get('Vary'), 'Origin', 'cacheable feed responses must vary on Origin');
assert.equal((await worker.fetch(new Request('https://api.test/api/feed?q=', {headers: {Origin: 'https://evil.test'}}), env())).headers.get('Access-Control-Allow-Origin'), null);

// Human-readable IDs are accepted; unusable ones are rejected before any write.
assert.equal((await settings({action: 'save', id: 'daryl-markets', backup, device})).status, 200);
assert.equal((await settings({action: 'save', id: 'no', backup})).status, 400, 'too short');
assert.equal((await settings({action: 'save', id: 'has spaces', backup})).status, 400);
assert.equal((await settings({action: 'save', id: 'a'.repeat(41), backup})).status, 400);
assert.equal(count('settings'), 1);

// IDs are stored in plain text, and are case-insensitive.
assert.equal(sqlite.prepare('SELECT id FROM settings').get().id, 'daryl-markets');
assert.equal((await (await settings({action: 'apply', id: 'DARYL-Markets'})).json()).backup.fontSize, 14);

// Sharing: a second person applies the same ID and gets the same settings.
const shared = await settings({action: 'apply', id: 'daryl-markets'});
assert.equal(shared.status, 200);
assert.deepEqual((await shared.json()).backup.sites, backup.sites);
assert.equal((await settings({action: 'apply', id: 'never-saved-id'})).status, 404);

// Saving again updates in place and counts the version.
const resaved = await (await settings({action: 'save', id: 'daryl-markets', backup: {...backup, fontSize: 18}, device})).json();
assert.equal(resaved.saveCount, 2);
assert.equal(count('settings'), 1);
assert.equal((await (await settings({action: 'apply', id: 'daryl-markets'})).json()).backup.fontSize, 18);

// Rubbish payloads never overwrite good settings.
assert.equal((await settings({action: 'save', id: 'daryl-markets', backup: {...backup, sites: [{name: 'Bad', url: 'javascript:alert(1)'}]}})).status, 400);
assert.equal((await (await settings({action: 'apply', id: 'daryl-markets'})).json()).backup.fontSize, 18);
assert.equal((await settings({action: 'save', id: 'daryl-markets', backup: {...backup, extra: 'x'.repeat(128 * 1024)}})).status, 413);
assert.equal((await settings({action: 'save', id: 'daryl-markets', backup}, {...env(), DB: undefined})).status, 503);

// Origin and rate limiting
assert.equal((await worker.fetch(new Request('https://api.test/api/settings', {method: 'POST', headers: {...headers(), Origin: 'https://evil.test'}, body: '{}'}), env())).status, 403);
limiterAllows = false;
assert.equal((await settings({action: 'apply', id: 'daryl-markets'})).status, 429);
assert.equal((await admin({action: 'list'})).status, 429);
limiterAllows = true;

// The access trail records who used an ID, and stays bounded.
const trail = sqlite.prepare('SELECT * FROM settings_access ORDER BY event_id').all();
assert.ok(trail.length >= 4);
assert.equal(trail[0].ip, '203.0.113.7');
assert.equal(trail[0].user_agent, 'TestBrowser/1.0');
assert.ok(JSON.parse(trail[0].device).cores === 16);
for (let i = 0; i < 25; i++) await settings({action: 'apply', id: 'daryl-markets'});
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM settings_access WHERE settings_id = ?').get('daryl-markets').n, 20, 'trail capped at 20 per ID');

// Master Admin refuses everyone without the server-side key.
assert.equal((await admin({action: 'list'}, 'wrong-key')).status, 401);
assert.equal((await admin({action: 'list'}, '')).status, 401);
assert.equal((await admin({action: 'list'}, adminKey, {...env(), ADMIN_KEY: undefined})).status, 503, 'fails closed when unconfigured');

// Listing exposes creation time, usage and last-seen client details.
await settings({action: 'save', id: 'team-desk', backup, device});
const listed = await (await admin({action: 'list'})).json();
assert.equal(listed.entries.length, 2);
const entry = listed.entries.find(e => e.id === 'daryl-markets');
assert.ok(entry.createdAt && entry.updatedAt);
assert.equal(entry.lastIp, '203.0.113.7');
assert.equal(entry.topics, 1);
assert.equal(entry.sites, 1);
assert.ok(listed.history['daryl-markets'].length > 0);

// Rename carries the access trail with it and refuses collisions.
assert.equal((await admin({action: 'rename', id: 'daryl-markets', newId: 'team-desk'})).status, 409);
assert.equal((await admin({action: 'rename', id: 'daryl-markets', newId: 'bad id'})).status, 400);
assert.equal((await admin({action: 'rename', id: 'missing-id', newId: 'fresh-name'})).status, 404);
assert.equal((await admin({action: 'rename', id: 'daryl-markets', newId: 'GFM-Desk'})).status, 200);
assert.equal((await settings({action: 'apply', id: 'gfm-desk'})).status, 200);
assert.equal((await settings({action: 'apply', id: 'daryl-markets'})).status, 404);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM settings_access WHERE settings_id = ?').get('gfm-desk').n, 20);

// Delete removes the entry and its trail.
assert.equal((await admin({action: 'delete', id: 'gfm-desk'})).status, 200);
assert.equal((await settings({action: 'apply', id: 'gfm-desk'})).status, 404);
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM settings_access WHERE settings_id = ?').get('gfm-desk').n, 0);
assert.equal(count('settings'), 1);

// Users can still delete their own entry without the admin key.
assert.equal((await settings({action: 'delete', id: 'team-desk'})).status, 200);
assert.equal(count('settings'), 0);

console.log('PASS: routing, CORS, shareable IDs, sharing and overwrite, validation, rate limiting, bounded access trail, admin key enforcement, list/rename/delete.');
