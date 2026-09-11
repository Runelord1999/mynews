import assert from 'node:assert/strict';
import { parseFeed, safeUrl } from '../lib/news.ts';
const example = '<rss><item><title>A &amp; B</title><link>https://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fexample.com%2Farticle</link><description>&lt;b&gt;Useful&lt;/b&gt; excerpt</description><News:Source>Example</News:Source></item><item><title>Bad</title><link>javascript:alert(1)</link></item></rss>';
const parsed = parseFeed(example, 'OpenAI');
assert.equal(parsed.length, 1);
assert.equal(parsed[0].url, 'https://example.com/article');
assert.equal(parsed[0].excerpt, 'Useful excerpt');
assert.equal(parsed[0].source, 'Example');
assert.throws(() => safeUrl('javascript:alert(1)'));
assert.throws(() => safeUrl('https://name:password@example.com'));
const origin = 'http://localhost:5173';
const anonymous = await fetch(origin + '/api/library');
assert.equal(anonymous.status, 401);
const login = await fetch(origin + '/signin-with-chatgpt?return_to=/', { redirect: 'manual' });
const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
assert.ok(cookie, 'Local preview sign-in cookie');
const headers = { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' };
const read = async () => {const r = await fetch(origin + '/api/library', { headers }); assert.equal(r.status, 200); return r.json();};
const write = async body => {const r = await fetch(origin + '/api/library', {method:'POST', headers, body: JSON.stringify(body)}); assert.equal(r.status, 200, await r.text());};
const before = await read();
const url = 'https://example.com/mynews-test-' + Date.now();
try {
  await write({action:'save',article:{id:url,url,title:'Integration test',excerpt:'Saved excerpt',source:'example.com',date:new Date().toISOString(),topic:'OpenAI'}});
  assert.ok((await read()).articles.some(a => a.url === url), 'Saved article survives a new request');
  const custom = [...before.topics, {name:'Test topic',keywords:'AI, research'}];
  await write({action:'topics',topics:custom});
  assert.deepEqual((await read()).topics, custom);
  const forbidden = await fetch(origin + '/api/library', {method:'POST',headers:{...headers,Origin:'https://different.example'},body:JSON.stringify({action:'topics',topics:custom})});
  assert.equal(forbidden.status,403);
  const invalid = await fetch(origin + '/api/library', {method:'POST',headers,body:JSON.stringify({action:'topics',topics:[]})});
  assert.equal(invalid.status,400);
} finally {
  await write({action:'remove',id:url});
  await write({action:'topics',topics:before.topics});
}
assert.ok(!(await read()).articles.some(a=>a.url===url));
console.log('PASS: RSS parsing, original links, unsafe URL rejection, sign-in protection, article persistence/removal, topic persistence, invalid input, and origin protection.');
