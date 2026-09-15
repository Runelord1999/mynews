// Exercises the standalone Mynews API Worker against an in-memory SQLite
// database: routing, CORS, online settings save/load/delete, private ID
// isolation, hashed storage, size limits and rate limiting.
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync('worker/schema.sql', 'utf8'));
const rows = {
  get size() {return sqlite.prepare('SELECT COUNT(*) AS n FROM settings_backups').get().n;},
  has(key) {return !!sqlite.prepare('SELECT 1 FROM settings_backups WHERE key_hash = ?').get(key);},
};
const DB = {prepare(sql) {return {bind(...args) {return {
  async first() {return sqlite.prepare(sql).get(...args) ?? null;},
  async run() {return sqlite.prepare(sql).run(...args);},
};}};}};

const built = await build({entryPoints: ['worker/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false});
const worker = (await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))).default;

const pages = 'https://runelord1999.github.io';
const token = 'a'.repeat(64), other = 'b'.repeat(64);
const backup = {format: 'mynews-settings', version: 1, exportedAt: new Date().toISOString(), fontSize: 14, topics: [{name: 'AI', keywords: 'AGI'}], sites: [{name: 'Example', url: 'https://example.com/', searchUrl: ''}], articles: []};

let limiterCalls = 0, limiterAllows = true;
const env = () => ({DB, ALLOWED_ORIGINS: pages, SETTINGS_RATE_LIMITER: {async limit() {limiterCalls++; return {success: limiterAllows};}}});
const settings = (body, id = token, origin = pages) => worker.fetch(new Request('https://api.test/api/settings', {method: 'POST', headers: {Authorization: 'Bearer ' + id, 'Content-Type': 'application/json', Origin: origin}, body: JSON.stringify(body)}), env());

// Routing
assert.equal((await worker.fetch(new Request('https://api.test/'), env())).status, 404);
assert.equal((await worker.fetch(new Request('https://api.test/api/health'), env())).status, 200);

// Feed input validation is reachable through the Worker without network access.
const badFeed = await worker.fetch(new Request('https://api.test/api/feed?q=', {headers: {Origin: pages}}), env());
assert.equal(badFeed.status, 400);
assert.equal(badFeed.headers.get('Access-Control-Allow-Origin'), pages);
assert.equal(badFeed.headers.get('Vary'), 'Origin', 'cacheable feed responses must vary on Origin');
const foreignFeed = await worker.fetch(new Request('https://api.test/api/feed?q=', {headers: {Origin: 'https://evil.test'}}), env());
assert.equal(foreignFeed.headers.get('Access-Control-Allow-Origin'), null, 'unknown origins get no CORS grant');

// Preflight
const preflight = await worker.fetch(new Request('https://api.test/api/settings', {method: 'OPTIONS', headers: {Origin: pages}}), env());
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), pages);

// Save, then read back from a second browser holding the same private ID.
assert.equal((await settings({action: 'save', backup})).status, 200);
assert.equal(rows.size, 1);
assert.ok(!rows.has(token), 'only a hash of the private ID is stored');
const loaded = await settings({action: 'load'});
assert.equal(loaded.headers.get('Access-Control-Allow-Origin'), pages);
assert.deepEqual((await loaded.json()).backup.sites, backup.sites);

// Isolation and input handling
assert.equal((await settings({action: 'load'}, other)).status, 404);
assert.equal((await settings({action: 'load'}, 'alice')).status, 401);
assert.equal((await settings({action: 'save', backup}, token, 'https://evil.test')).status, 403);
assert.equal((await settings({action: 'save', backup: {...backup, sites: [{name: 'Bad', url: 'javascript:alert(1)'}]}})).status, 400);
assert.equal((await settings({action: 'save', backup: {...backup, extra: 'x'.repeat(128 * 1024)}})).status, 413);
assert.equal((await settings({action: 'nonsense'})).status, 400);

// Updating replaces rather than appends.
assert.equal((await settings({action: 'save', backup: {...backup, fontSize: 18}})).status, 200);
assert.equal(rows.size, 1);
assert.equal((await (await settings({action: 'load'})).json()).backup.fontSize, 18);

// Rate limiting
assert.ok(limiterCalls > 0, 'rate limiter is consulted');
limiterAllows = false;
assert.equal((await settings({action: 'load'})).status, 429);
limiterAllows = true;

// Users can erase their own online backup.
assert.equal((await settings({action: 'delete'})).status, 200);
assert.equal(rows.size, 0);
assert.equal((await settings({action: 'load'})).status, 404);

console.log('PASS: worker routing, CORS and Vary, online save/load/delete, private ID isolation, hashed storage, size limit and rate limiting.');
