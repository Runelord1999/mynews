import {parseFeed, plain, safeUrl, summarise, type Article} from './news';
import {publicHttpUrl, readRemote} from './safe-remote';
import {corsHeaders} from './api-cors';

// The feed URL comes from the browser, so it is checked here rather than
// trusted: same host as the saved site, public address only, http(s) only.
function safeFeedUrl(feed: string, site: string) {
 const url = publicHttpUrl(feed);
 if (url.hostname !== site && !url.hostname.endsWith('.' + site)) throw Error('Feed must be on the same website.');
 return url.href;
}

// A publisher feed carries whatever the publisher just posted, so the topic's
// keywords are applied here instead of by the upstream search engine.
function matchesKeywords(article: Article, q: string) {
 const terms = q.split(/\s+OR\s+/).map(t => t.trim().toLowerCase()).filter(Boolean);
 if (!terms.length) return true;
 const haystack = (article.title + ' ' + article.excerpt).toLowerCase();
 return terms.some(term => haystack.includes(term));
}

export async function handleFeed(request: Request, options: {allowedOrigins: string[]}) {
 const cors = corsHeaders(request, options.allowedOrigins, 'GET');
 if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
 const params = new URL(request.url).searchParams;
 const q = params.get('q')?.trim();
 const provider = params.get('provider') || 'bing';
 const site = params.get('site')?.trim() || '';
 const fail = (error: string, status: number) => Response.json({error}, {status, headers: {...cors, 'Cache-Control': 'no-store'}});
 const feed = params.get('feed')?.trim() || '';
 if (!q || q.length > 300 || !['bing', 'google', 'hackernews', 'sitefeed'].includes(provider) || site.length > 253 || (site && !/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/i.test(site))) return fail('Invalid keywords or source.', 400);
 if (provider === 'sitefeed' && (!feed || feed.length > 4096 || !site)) return fail('A site feed needs its website and feed address.', 400);
 try {
  let articles: Article[] = [];
  const search = site ? '(' + q + ') site:' + site : q;
  if (provider === 'sitefeed') {
   let target; try {target = safeFeedUrl(feed, site);} catch {return fail('That feed address cannot be used.', 400);}
   const xml = await readRemote(target);
   articles = parseFeed(xml, q).filter(a => matchesKeywords(a, q)).map(a => ({...a, provider: site}));
  } else if (provider === 'hackernews') {
   const terms = q.split(/\s+OR\s+/).map(t => t.trim()).filter(Boolean); if (terms.length > 10) throw Error('Too many keyword terms');
   const results = await Promise.all(terms.map(async term => {
    const data = JSON.parse(await readRemote('https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=20&query=' + encodeURIComponent(term))) as {hits: Array<{objectID: string; title: string; url: string | null; story_text: string | null; created_at: string; points: number; num_comments: number}>};
    return data.hits.flatMap(hit => {
     try {
      const url = safeUrl(hit.url || 'https://news.ycombinator.com/item?id=' + hit.objectID);
      const host = new URL(url).hostname;
      if (site && host !== site && !host.endsWith('.' + site)) return [];
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
  return Response.json({articles, fetchedAt: new Date().toISOString()}, {headers: {...cors, 'Cache-Control': 'public, max-age=300'}});
 } catch {return fail('This source is temporarily unavailable. Other sources may still have stories.', 502);}
}
