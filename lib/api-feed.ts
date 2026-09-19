import {parseFeed, plain, safeUrl, summarise, type Article} from './news';
import {publicHttpUrl, readRemote} from './safe-remote';
import {corsHeaders} from './api-cors';

// The feed URL comes from the browser, so it is checked here rather than
// trusted: same host as the saved site, public address only, http(s) only.
// A feed address is checked for being a public http(s) address, not for
// sharing a hostname with its site: plenty of publishers serve theirs from a
// separate host, and /api/article already reads any public address.
function safeFeedUrl(feed: string) {
 return publicHttpUrl(feed).href;
}

export async function handleFeed(request: Request, options: {allowedOrigins: string[]}) {
 const cors = corsHeaders(request, options.allowedOrigins, 'GET');
 if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
 const params = new URL(request.url).searchParams;
 const q = params.get('q')?.trim() || '';
 const provider = params.get('provider') || 'bing';
 const site = params.get('site')?.trim() || '';
 const fail = (error: string, status: number) => Response.json({error}, {status, headers: {...cors, 'Cache-Control': 'no-store'}});
 const feed = params.get('feed')?.trim() || '';
 // One request can carry several hostnames so a reader selecting a dozen
 // publishers still costs one query per engine rather than a dozen.
 const hosts = site ? site.split(',').map(h => h.trim()).filter(Boolean) : [];
 const validHost = (h: string) => h.length <= 253 && /^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/i.test(h);
 const isFeed = provider === 'sitefeed';
 // A feed carries whatever the publisher posted, so it needs no keywords.
 if ((!q && !isFeed) || q.length > 300 || !['bing', 'google', 'hackernews', 'sitefeed'].includes(provider) || hosts.length > 15 || !hosts.every(validHost)) return fail('Invalid keywords or source.', 400);
 if (isFeed && (!feed || feed.length > 4096)) return fail('A site feed needs its feed address.', 400);
 try {
  let articles: Article[] = [];
  let total: number | undefined;
  const search = hosts.length ? '(' + q + ') (' + hosts.map(h => 'site:' + h).join(' OR ') + ')' : q;
  if (provider === 'sitefeed') {
   let target; try {target = safeFeedUrl(feed);} catch {return fail('That feed address cannot be used.', 400);}
   const xml = await readRemote(target);
   const parsed = parseFeed(xml, q);
   total = parsed.length;
   // Everything the feed holds is returned. Which topic each item answers is
   // decided by the reader, against every topic at once, rather than here
   // against one topic per request.
   articles = parsed.map(a => ({...a, provider: hosts[0] || new URL(target).hostname.replace(/^www\./, '')}));
  } else if (provider === 'hackernews') {
   const terms = q.split(/\s+OR\s+/).map(t => t.trim()).filter(Boolean); if (terms.length > 10) throw Error('Too many keyword terms');
   const results = await Promise.all(terms.map(async term => {
    const data = JSON.parse(await readRemote('https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=20&query=' + encodeURIComponent(term))) as {hits: Array<{objectID: string; title: string; url: string | null; story_text: string | null; created_at: string; points: number; num_comments: number}>};
    return data.hits.flatMap(hit => {
     try {
      const url = safeUrl(hit.url || 'https://news.ycombinator.com/item?id=' + hit.objectID);
      const host = new URL(url).hostname;
      if (hosts.length && !hosts.some(h => host === h || host.endsWith('.' + h))) return [];
      return [{id: url, url, title: plain(hit.title || ''), excerpt: hit.story_text ? summarise(hit.story_text) : 'Discussed on Hacker News · ' + hit.points + ' points · ' + hit.num_comments + ' comments. Open the original story for the full article.', source: host.replace(/^www\./, ''), date: hit.created_at, topic: q, provider: 'Hacker News'}];
     } catch {return [];}
    });
   }));
   articles = Array.from(new Map(results.flat().map(a => [a.url, a])).values()).slice(0, 20);
  } else {
   const url = provider === 'google' ? 'https://news.google.com/rss/search?q=' + encodeURIComponent(search) + '&hl=en-US&gl=US&ceid=US:en' : 'https://www.bing.com/news/search?q=' + encodeURIComponent(search) + '&format=rss';
   const xml = await readRemote(url); if (!xml.includes('<rss')) throw Error('Invalid feed');
   articles = parseFeed(xml, q).map(a => ({...a, provider: provider === 'google' ? 'Google News' : 'Bing News', excerpt: provider === 'google' ? 'Coverage from ' + a.source + '. Open the publisher’s article for the full report.' : a.excerpt}));
  }
  return Response.json({articles, ...(total === undefined ? {} : {total}), fetchedAt: new Date().toISOString()}, {headers: {...cors, 'Cache-Control': 'public, max-age=300'}});
 } catch {return fail('This source is temporarily unavailable. Other sources may still have stories.', 502);}
}
