import assert from 'node:assert/strict';
import { parseFeed, safeUrl, summarise, allSources, defaultSources, siteSourceId, engineIds, services, publishers, sourceHost } from '../lib/news.ts';
const example = '<rss><item><title>A &amp; B</title><link>https://www.bing.com/news/apiclick.aspx?url=https%3A%2F%2Fexample.com%2Farticle</link><description>&lt;b&gt;Useful&lt;/b&gt; excerpt</description><News:Source>Example</News:Source></item><item><title>Bad</title><link>javascript:alert(1)</link></item></rss>';
const parsed = parseFeed(example, 'OpenAI');
assert.equal(parsed.length, 1);
assert.equal(parsed[0].url, 'https://example.com/article');
assert.equal(parsed[0].excerpt, 'Useful excerpt');
assert.equal(parsed[0].source, 'Example');
assert.throws(() => safeUrl('javascript:alert(1)'));
assert.throws(() => safeUrl('https://name:password@example.com'));

// A full-text RSS feed fills content:encoded, which wins over the teaser.
const body = Array.from({length: 400}, (_, i) => 'word' + i).join(' ');
const fullText = `<rss><item><title>Long read</title><link>https://example.com/long</link><description>Short teaser</description><content:encoded><![CDATA[<p>${body}</p>]]></content:encoded><pubDate>Mon, 01 Jan 2035 00:00:00 GMT</pubDate></item></rss>`;
const long = parseFeed(fullText, 'AI');
assert.equal(long.length, 1);
assert.ok(long[0].excerpt.startsWith('word0 word1'), 'full body wins over the teaser');
assert.equal(long[0].excerpt.split(/\s+/).length, 250, 'capped at 250 words');
assert.ok(long[0].excerpt.endsWith('…'), 'truncation is marked');

// Atom entries carry the link as an attribute and the body in <content>.
const atom = '<feed><entry><title>Atom story</title><link rel="alternate" href="https://example.com/atom"/><content>Body from an Atom feed</content><updated>2035-01-01T00:00:00Z</updated></entry></feed>';
const parsedAtom = parseFeed(atom, 'AI');
assert.equal(parsedAtom.length, 1);
assert.equal(parsedAtom[0].url, 'https://example.com/atom');
assert.equal(parsedAtom[0].excerpt, 'Body from an Atom feed');

// A short teaser is left exactly as it is, with no ellipsis.
assert.equal(summarise('<p>Just  a   teaser</p>'), 'Just a teaser');
assert.equal(summarise('one two three', 2), 'one two…');
// Everything shipped is a service; only what a reader adds is "their" site.
assert.equal(services.length, 12, 'three indexes plus nine publishers');
assert.equal(publishers.length, 9);
assert.deepEqual(services.slice(0, 3).map(s => s.id), engineIds);
assert.ok(services.every(s => s.id && s.name && s.hint));
assert.equal(services.find(s => s.name === 'Ars Technica').kind, 'feed', 'a shipped feed is read directly');
assert.equal(services.find(s => s.name === 'Reuters').kind, 'search', 'the rest are searched by site');
assert.deepEqual(defaultSources(), services.map(s => s.id), 'everything shipped starts selected');

// A fresh library adds nothing of its own, so Your Sites starts empty.
assert.deepEqual(allSources([]).map(s => s.id), services.map(s => s.id));

// A site the reader adds appears after the services and cannot collide.
const own = {name: 'My Blog', url: 'https://example.com/', searchUrl: '', feedUrl: ''};
const withOwn = allSources([own]);
assert.equal(withOwn.length, 13);
assert.equal(withOwn[12].id, siteSourceId(own));
assert.ok(!services.some(s => s.id === siteSourceId(own)));
assert.ok(services.every(s => s.id.startsWith('service:') || engineIds.includes(s.id)));

// A site: query names the bare host, so a page served without www still counts.
assert.equal(sourceHost('https://www.snexplores.org/'), 'snexplores.org');
assert.equal(sourceHost('https://www.nasa.gov/learning-resources/for-kids-and-students/'), 'nasa.gov');
assert.equal(sourceHost('https://kids.nationalgeographic.com/'), 'kids.nationalgeographic.com', 'a real subdomain is kept');
assert.equal(sourceHost('https://kids.frontiersin.org/'), 'kids.frontiersin.org');

console.log('PASS: RSS and Atom parsing, site hostnames, source list and defaults, full-text content:encoded summaries capped at 250 words, original publisher links, and unsafe URL rejection.');
