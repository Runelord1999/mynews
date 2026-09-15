// Exercises the standalone Mynews API Worker against an in-memory SQLite
// database: routing, CORS, shareable settings IDs, owner names, and the
// Master Admin list/rename/delete flow.
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

const sqlite = new DatabaseSync(':memory:');
for (const statement of readFileSync('worker/schema.sql', 'utf8').split(';')) if (statement.trim()) sqlite.exec(statement);
const count = () => sqlite.prepare('SELECT COUNT(*) AS n FROM settings').get().n;
const DB = {prepare(sql) {return {bind(...args) {return {
  async first() {return sqlite.prepare(sql).get(...args) ?? null;},
  async all() {return {results: sqlite.prepare(sql).all(...args)};},
  async run() {return sqlite.prepare(sql).run(...args);},
};}};}};

const built = await build({entryPoints: ['worker/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false});
const worker = (await import('data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64'))).default;

const pages = 'https://runelord1999.github.io';
const backup = {format: 'mynews-settings', version: 1, exportedAt: new Date().toISOString(), fontSize: 14, topics: [{name: 'AI', keywords: 'AGI'}], sites: [{name: 'Example', url: 'https://example.com/', searchUrl: '', feedUrl: ''}], articles: []};

let limiterAllows = true;
const env = extra => ({DB, ALLOWED_ORIGINS: pages, SETTINGS_RATE_LIMITER: {async limit() {return {success: limiterAllows};}}, ...extra});
const headers = extra => ({'Content-Type': 'application/json', Origin: pages, 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'TestBrowser/1.0', ...extra});
const settings = (body, e = env()) => worker.fetch(new Request('https://api.test/api/settings', {method: 'POST', headers: headers(), body: JSON.stringify(body)}), e);
const admin = (body, extra = {}, e = env()) => worker.fetch(new Request('https://api.test/api/admin', {method: 'POST', headers: headers(extra), body: JSON.stringify(body)}), e);

// Routing and CORS
assert.equal((await worker.fetch(new Request('https://api.test/'), env())).status, 404);
assert.deepEqual(await (await worker.fetch(new Request('https://api.test/api/health'), env())).json(), {ok: true, database: true, adminKeyRequired: false});
const feed = await worker.fetch(new Request('https://api.test/api/feed?q=', {headers: {Origin: pages}}), env());
assert.equal(feed.status, 400);
assert.equal(feed.headers.get('Vary'), 'Origin', 'cacheable feed responses must vary on Origin');
assert.equal((await worker.fetch(new Request('https://api.test/api/feed?q=', {headers: {Origin: 'https://evil.test'}}), env())).headers.get('Access-Control-Allow-Origin'), null);

// Site feeds: the browser names the address, so the Worker validates it.
const feedCalls = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.startsWith('https://example.com/')) {
    feedCalls.push(url);
    const body = Array.from({length: 300}, (_, i) => 'alpha' + i).join(' ');
    return new Response(`<rss><item><title>Reactor milestone</title><link>https://example.com/a</link><content:encoded><![CDATA[${body}]]></content:encoded></item><item><title>Unrelated cooking piece</title><link>https://example.com/b</link><description>Pastry technique</description></item></rss>`);
  }
  return realFetch(input, init);
};
const siteFeed = (params, e = env()) => worker.fetch(new Request('https://api.test/api/feed?' + new URLSearchParams(params), {headers: {Origin: pages}}), e);

const feedOk = await siteFeed({q: 'reactor', provider: 'sitefeed', site: 'example.com', feed: 'https://example.com/feed'});
assert.equal(feedOk.status, 200);
const feedBody = await feedOk.json();
assert.equal(feedBody.articles.length, 1, 'only keyword matches are kept');
assert.equal(feedBody.articles[0].title, 'Reactor milestone');
assert.equal(feedBody.articles[0].excerpt.split(/\s+/).length, 250, 'full body trimmed to 250 words');
assert.equal(feedBody.articles[0].provider, 'example.com');

// A feed on another host, a private address, or a missing address is refused
// without any outbound request being made.
const before = feedCalls.length;
assert.equal((await siteFeed({q: 'x', provider: 'sitefeed', site: 'example.com', feed: 'https://evil.test/feed'})).status, 400);
assert.equal((await siteFeed({q: 'x', provider: 'sitefeed', site: 'example.com', feed: 'http://127.0.0.1/feed'})).status, 400);
assert.equal((await siteFeed({q: 'x', provider: 'sitefeed', site: 'example.com', feed: 'http://192.168.1.1/feed'})).status, 400);
assert.equal((await siteFeed({q: 'x', provider: 'sitefeed', site: 'example.com', feed: 'file:///etc/passwd'})).status, 400);
assert.equal((await siteFeed({q: 'x', provider: 'sitefeed', site: 'example.com'})).status, 400, 'feed address required');
assert.equal((await siteFeed({q: 'x', provider: 'sitefeed', feed: 'https://example.com/feed'})).status, 400, 'site required');
assert.equal(feedCalls.length, before, 'no request leaves the Worker for a refused feed');

// A subdomain of the saved site is allowed.
assert.equal((await siteFeed({q: 'reactor', provider: 'sitefeed', site: 'example.com', feed: 'https://example.com/rss'})).status, 200);
globalThis.fetch = realFetch;

// Saving requires a usable ID and an owner name.
assert.equal((await settings({action: 'save', id: 'daryl-markets', owner: 'Daryl', backup})).status, 200);
assert.equal((await settings({action: 'save', id: 'no-owner-here', backup})).status, 400, 'owner name is required');
assert.equal((await settings({action: 'save', id: 'short-owner', owner: 'D', backup})).status, 400);
assert.equal((await settings({action: 'save', id: 'no', owner: 'Daryl', backup})).status, 400, 'too short');
assert.equal((await settings({action: 'save', id: 'has spaces', owner: 'Daryl', backup})).status, 400);
assert.equal(count(), 1);

// IDs are stored in plain text and match case-insensitively.
assert.equal(sqlite.prepare('SELECT id FROM settings').get().id, 'daryl-markets');
assert.equal((await (await settings({action: 'apply', id: 'DARYL-Markets'})).json()).backup.fontSize, 14);

// Nothing about the visitor is stored.
const columns = sqlite.prepare('PRAGMA table_info(settings)').all().map(c => c.name);
assert.deepEqual(columns, ['id', 'owner', 'data', 'created_at', 'updated_at', 'save_count']);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'settings_access'").get().n, 0);
assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM settings').all()).includes('203.0.113.7'), 'no IP address is persisted');
assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM settings').all()).includes('TestBrowser'), 'no user agent is persisted');

// Sharing: anyone with the ID gets the same settings and sees the owner.
const shared = await (await settings({action: 'apply', id: 'daryl-markets'})).json();
assert.deepEqual(shared.backup.sites, backup.sites);
assert.equal(shared.owner, 'Daryl');
assert.equal((await settings({action: 'apply', id: 'never-saved-id'})).status, 404);

// Re-saving updates in place, counts the version, and keeps the creator.
const resaved = await (await settings({action: 'save', id: 'daryl-markets', owner: 'Someone Else', backup: {...backup, fontSize: 18}})).json();
assert.equal(resaved.saveCount, 2);
assert.equal(resaved.owner, 'Daryl', 'the owner is whoever created the ID');
assert.equal(count(), 1);
assert.equal((await (await settings({action: 'apply', id: 'daryl-markets'})).json()).backup.fontSize, 18);

// Rubbish payloads never overwrite good settings.
assert.equal((await settings({action: 'save', id: 'daryl-markets', owner: 'Daryl', backup: {...backup, sites: [{name: 'Bad', url: 'javascript:alert(1)'}]}})).status, 400);
assert.equal((await (await settings({action: 'apply', id: 'daryl-markets'})).json()).backup.fontSize, 18);
assert.equal((await settings({action: 'save', id: 'daryl-markets', owner: 'Daryl', backup: {...backup, extra: 'x'.repeat(128 * 1024)}})).status, 413);
assert.equal((await settings({action: 'save', id: 'daryl-markets', owner: 'Daryl', backup}, env({DB: undefined}))).status, 503);

// Origin and rate limiting
assert.equal((await worker.fetch(new Request('https://api.test/api/settings', {method: 'POST', headers: {...headers(), Origin: 'https://evil.test'}, body: '{}'}), env())).status, 403);
limiterAllows = false;
assert.equal((await settings({action: 'apply', id: 'daryl-markets'})).status, 429);
assert.equal((await admin({action: 'list'})).status, 429);
limiterAllows = true;

// Master Admin is open when no key is configured.
await settings({action: 'save', id: 'team-desk', owner: 'GFM Desk', backup});
const listed = await (await admin({action: 'list'})).json();
assert.equal(listed.entries.length, 2);
const entry = listed.entries.find(e => e.id === 'daryl-markets');
assert.equal(entry.owner, 'Daryl');
assert.ok(entry.createdAt && entry.updatedAt);
assert.equal(entry.topics, 1);
assert.equal(entry.sites, 1);
assert.ok(!JSON.stringify(listed).includes('203.0.113.7'), 'admin never reports IP addresses');

// Setting ADMIN_KEY turns the check on with no change to the page.
const locked = env({ADMIN_KEY: 'battery-staple'});
assert.equal((await worker.fetch(new Request('https://api.test/api/health'), locked)).status, 200);
assert.equal((await (await worker.fetch(new Request('https://api.test/api/health'), locked)).json()).adminKeyRequired, true);
const refused = await admin({action: 'list'}, {}, locked);
assert.equal(refused.status, 401);
assert.equal((await refused.json()).keyRequired, true, 'the page is told a key is needed');
assert.equal((await admin({action: 'list'}, {'X-Admin-Key': 'wrong'}, locked)).status, 401);
assert.equal((await admin({action: 'list'}, {'X-Admin-Key': 'battery-staple'}, locked)).status, 200);

// Rename the ID, and correct an owner name, independently.
assert.equal((await admin({action: 'rename', id: 'daryl-markets', newId: 'team-desk'})).status, 409);
assert.equal((await admin({action: 'rename', id: 'daryl-markets', newId: 'bad id'})).status, 400);
assert.equal((await admin({action: 'rename', id: 'missing-id', newId: 'fresh-name'})).status, 404);
assert.equal((await admin({action: 'rename', id: 'daryl-markets', newOwner: 'D'})).status, 400);
assert.equal((await admin({action: 'rename', id: 'daryl-markets', newOwner: 'Daryl Y'})).status, 200);
assert.equal((await (await settings({action: 'apply', id: 'daryl-markets'})).json()).owner, 'Daryl Y');
assert.equal((await admin({action: 'rename', id: 'daryl-markets', newId: 'GFM-Markets'})).status, 200);
assert.equal((await settings({action: 'apply', id: 'gfm-markets'})).status, 200);
assert.equal((await settings({action: 'apply', id: 'daryl-markets'})).status, 404);
assert.equal((await (await settings({action: 'apply', id: 'gfm-markets'})).json()).owner, 'Daryl Y', 'renaming keeps the owner');

// Delete, from admin and from the user's own dialog.
assert.equal((await admin({action: 'delete', id: 'gfm-markets'})).status, 200);
assert.equal((await settings({action: 'apply', id: 'gfm-markets'})).status, 404);
assert.equal((await settings({action: 'delete', id: 'team-desk'})).status, 200);
assert.equal(count(), 0);

console.log('PASS: routing, CORS, site feeds with SSRF guards, shareable IDs, owner names, sharing and overwrite, no visitor data stored, optional admin key, list/rename/delete.');
