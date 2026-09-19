import assert from 'node:assert/strict';
import { parseFeed, safeUrl, summarise, allSources, defaultSources, siteSourceId, engineIds, services, publishers, sourceHost, matchTopic, topicQueryGroups, audiences, audienceRank, audienceAllows, siteAudience, isAudience, parseBlockedWords, blockedWordsText, blockedBy } from '../lib/news.ts';
import { suggestedSites } from '../lib/suggested-sites.ts';
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

// A feed is read once and offered to every topic; anything matching none is
// still aggregated rather than dropped.
const teenTopics = [
  {name: 'Space and astronomy', keywords: 'Moon missions, Mars exploration, exoplanets'},
  {name: 'Dinosaurs and fossils', keywords: 'dinosaur discoveries, fossil discoveries'},
];
assert.equal(matchTopic({title: 'New exoplanets found', excerpt: ''}, teenTopics), 'Space and astronomy');
assert.equal(matchTopic({title: 'A fossil discoveries roundup', excerpt: ''}, teenTopics), 'Dinosaurs and fossils');
assert.equal(matchTopic({title: 'Matches nothing at all', excerpt: ''}, teenTopics), '', 'unmatched items are kept, not tagged');
assert.equal(matchTopic({title: 'X', excerpt: 'talks about Mars exploration'}, teenTopics), 'Space and astronomy', 'the body counts too');
assert.equal(matchTopic({title: 'MOON MISSIONS explained', excerpt: ''}, teenTopics), 'Space and astronomy', 'matching ignores case');
assert.equal(matchTopic({title: 'anything', excerpt: ''}, []), '');

// Keywords are packed into as few queries as the limit allows.
const many = Array.from({length: 20}, (_, i) => ({name: 'T' + i, keywords: Array.from({length: 6}, (_, j) => 'kw' + i + '_' + j).join(', ')}));
const packed = topicQueryGroups(many);
assert.ok(packed.length < many.length, 'twenty topics do not need twenty queries');
assert.ok(packed.every(q => q.length <= 280), 'every query fits the length the API accepts');
const allTerms = many.flatMap(t => t.keywords.split(',').map(k => k.trim()));
assert.ok(allTerms.every(term => packed.some(q => q.includes(term))), 'no keyword is dropped');
assert.deepEqual(topicQueryGroups([]), []);
assert.deepEqual(topicQueryGroups([{name: 'One', keywords: 'alpha, beta'}]), ['alpha OR beta']);
// A single topic longer than the budget is truncated rather than rejected.
assert.ok(topicQueryGroups([{name: 'Long', keywords: Array.from({length: 40}, (_, i) => 'termtermterm' + i).join(', ')}]).every(q => q.length <= 280));

// Suggested sources are well-formed before anything tries to read them.
assert.ok(suggestedSites.length >= 10, 'enough candidates to cover the usual topics');
for (const site of suggestedSites) {
  assert.ok(site.name && site.covers, site.name + ' says what it covers');
  assert.equal(safeUrl(site.url), new URL(site.url).href, site.name + ' has a usable site address');
  assert.ok(site.feedUrl, site.name + ' names a feed');
  assert.equal(safeUrl(site.feedUrl), new URL(site.feedUrl).href, site.name + ' has a usable feed address');
  assert.ok(['http:', 'https:'].includes(new URL(site.feedUrl).protocol));
}
assert.equal(new Set(suggestedSites.map(s => s.feedUrl)).size, suggestedSites.length, 'no duplicate feeds');
assert.equal(new Set(suggestedSites.map(s => s.name)).size, suggestedSites.length, 'no duplicate names');

// Audience labels. Three tiers, most restrictive first, and everything built
// in is General: a whole-web index cannot be held to an audience.
assert.deepEqual(audiences.map(a => a.id), ['children', 'teen', 'general']);
assert.ok(audiences.every(a => a.label && a.hint));
assert.deepEqual([audienceRank.children, audienceRank.teen, audienceRank.general], [0, 1, 2]);
assert.ok(services.every(s => s.audience === 'general'), 'no built-in service claims to be for children');
assert.ok(['children', 'teen', 'general'].every(isAudience));
assert.ok(!isAudience('PG') && !isAudience('') && !isAudience(undefined), 'film ratings are not audiences');

// A site with no label counts as General, so an unconsidered source is held
// back by a filter rather than let through.
assert.equal(siteAudience({}), 'general');
assert.equal(siteAudience({audience: 'nonsense'}), 'general');
assert.equal(siteAudience({audience: 'children'}), 'children');
assert.ok(audienceAllows('general', 'general') && audienceAllows('general', 'children'), 'General is the filter turned off');
assert.ok(audienceAllows('teen', 'teen') && audienceAllows('teen', 'children'));
assert.ok(!audienceAllows('teen', 'general'), 'a General source is dropped by a Teen filter');
assert.ok(!audienceAllows('children', 'teen') && !audienceAllows('children', 'general'));

// The label travels into the source list, so the reader's own judgement is
// what the filter acts on.
const labelled = allSources([
  {name: 'Kids site', url: 'https://kids.example/', searchUrl: '', feedUrl: 'https://kids.example/feed', audience: 'children'},
  {name: 'Unlabelled', url: 'https://plain.example/', searchUrl: '', feedUrl: ''},
]);
assert.equal(labelled.find(s => s.name === 'Kids site').audience, 'children');
assert.equal(labelled.find(s => s.name === 'Unlabelled').audience, 'general');
assert.equal(labelled.filter(s => audienceAllows('children', s.audience)).length, 1, 'only the labelled site survives a Children filter');

// Blocked words. Parsing accepts commas or new lines, folds case, drops blanks
// and duplicates, and is bounded.
assert.deepEqual(parseBlockedWords(' Murder, shooting \n MURDER\n\n,  '), ['murder', 'shooting']);
assert.deepEqual(parseBlockedWords('war   crime'), ['war crime'], 'a phrase keeps one space');
assert.equal(parseBlockedWords(Array.from({length: 300}, (_, i) => 'w' + i).join(',')).length, 200);
assert.equal(parseBlockedWords('x'.repeat(41) + ', ok').length, 1, 'an over-long term is dropped, not truncated');
assert.equal(blockedWordsText(['murder', 'war crime']), 'murder, war crime');
assert.deepEqual(parseBlockedWords(blockedWordsText(['murder', 'war crime'])), ['murder', 'war crime'], 'round-trips');

// Matching is on whole words, over the headline and the excerpt.
const story = (title, excerpt = '') => ({title, excerpt});
assert.equal(blockedBy(story('A murder in Bangkok'), ['murder']), 'murder');
assert.equal(blockedBy(story('Quiet day'), ['murder']), '');
assert.equal(blockedBy(story('Quiet day', 'It ended in a murder.'), ['murder']), 'murder', 'the excerpt counts too');
assert.equal(blockedBy(story('Murder, she wrote'), ['murder']), 'murder', 'punctuation does not hide a match');
assert.equal(blockedBy(story('Scunthorpe classes resume'), ['ass', 'cunt']), '', 'whole words only');
assert.equal(blockedBy(story('Burgundy in autumn'), ['gun']), '');
assert.equal(blockedBy(story('A gun was found'), ['gun']), 'gun');
assert.equal(blockedBy(story('Evidence of a war crime'), ['war crime']), 'war crime', 'a phrase matches as a phrase');
assert.equal(blockedBy(story('A crime of war'), ['war crime']), '', 'the phrase is not matched out of order');
assert.equal(blockedBy(story('Anything at all'), []), '', 'no list, nothing hidden');

// Suggested sources all carry a label, and a Children filter leaves something
// to read rather than an empty page.
assert.ok(suggestedSites.every(s => isAudience(s.audience)), 'every suggestion says who it is written for');
assert.ok(suggestedSites.some(s => s.audience === 'children'), 'a Children filter has something to keep');
assert.ok(suggestedSites.filter(s => audienceAllows('teen', s.audience)).length >= 3);

console.log('PASS: RSS and Atom parsing, site hostnames, topic matching, query packing, source list and defaults, audience labels and whole-word blocked-word matching, full-text content:encoded summaries capped at 250 words, original publisher links, and unsafe URL rejection.');
