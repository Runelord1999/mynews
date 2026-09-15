import {parseFeed, plain, safeUrl, type Article} from './news';
import {corsHeaders} from './api-cors';

async function readRemote(url: string) {
 const response = await fetch(url, {signal: AbortSignal.timeout(12000)});
 if (!response.ok) throw Error('Feed unavailable');
 const reader = response.body?.getReader(); if (!reader) throw Error('Empty response');
 let size = 0, text = ''; const decoder = new TextDecoder();
 while (true) {
  const {done, value} = await reader.read(); if (done) break;
  size += value.length; if (size > 1500000) {await reader.cancel(); throw Error('Feed too large');}
  text += decoder.decode(value, {stream: true});
 }
 return text + decoder.decode();
}

export async function handleFeed(request: Request, options: {allowedOrigins: string[]}) {
 const cors = corsHeaders(request, options.allowedOrigins, 'GET');
 if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
 const params = new URL(request.url).searchParams;
 const q = params.get('q')?.trim();
 const provider = params.get('provider') || 'bing';
 const site = params.get('site')?.trim() || '';
 const fail = (error: string, status: number) => Response.json({error}, {status, headers: {...cors, 'Cache-Control': 'no-store'}});
 if (!q || q.length > 300 || !['bing', 'google', 'hackernews'].includes(provider) || site.length > 253 || (site && !/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/i.test(site))) return fail('Invalid keywords or source.', 400);
 try {
  let articles: Article[] = [];
  const search = site ? '(' + q + ') site:' + site : q;
  if (provider === 'hackernews') {
   const terms = q.split(/\s+OR\s+/).map(t => t.trim()).filter(Boolean); if (terms.length > 10) throw Error('Too many keyword terms');
   const results = await Promise.all(terms.map(async term => {
    const data = JSON.parse(await readRemote('https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=20&query=' + encodeURIComponent(term))) as {hits: Array<{objectID: string; title: string; url: string | null; story_text: string | null; created_at: string; points: number; num_comments: number}>};
    return data.hits.flatMap(hit => {
     try {
      const url = safeUrl(hit.url || 'https://news.ycombinator.com/item?id=' + hit.objectID);
      const host = new URL(url).hostname;
      if (site && host !== site && !host.endsWith('.' + site)) return [];
      return [{id: url, url, title: plain(hit.title || ''), excerpt: hit.story_text ? plain(hit.story_text).slice(0, 350) : 'Discussed on Hacker News · ' + hit.points + ' points · ' + hit.num_comments + ' comments. Open the original story for the full article.', source: host.replace(/^www\./, ''), date: hit.created_at, topic: q, provider: 'Hacker News'}];
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
