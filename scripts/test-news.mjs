import assert from 'node:assert/strict';
import { parseFeed, safeUrl, summarise, allSources, defaultSources, siteSourceId, engineIds } from '../lib/news.ts';
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
// Sources cover the engines and every saved site, in that order.
const feedSite={name:'Ars Technica',url:'https://arstechnica.com/',searchUrl:'',feedUrl:'https://arstechnica.com/feed/'};
const plainSite={name:'Associated Press',url:'https://apnews.com/',searchUrl:'',feedUrl:''};
const list = allSources([feedSite, plainSite]);
assert.deepEqual(list.map(s => s.id), [...engineIds, siteSourceId(feedSite), siteSourceId(plainSite)]);
assert.equal(list.find(s => s.id === siteSourceId(feedSite)).kind, 'feed');
assert.equal(list.find(s => s.id === siteSourceId(plainSite)).kind, 'search', 'a site without a feed is searched');
assert.equal(allSources([]).length, 3, 'the engines are always offered');

// The default selection reproduces what the reader did before sources became
// selectable: every engine, plus sites that publish a feed.
assert.deepEqual(defaultSources([feedSite, plainSite]), [...engineIds, siteSourceId(feedSite)]);
assert.deepEqual(defaultSources([]), engineIds);
assert.ok(siteSourceId(feedSite).startsWith('site:'), 'site ids cannot collide with engine ids');

console.log('PASS: RSS and Atom parsing, source list and defaults, full-text content:encoded summaries capped at 250 words, original publisher links, and unsafe URL rejection.');
