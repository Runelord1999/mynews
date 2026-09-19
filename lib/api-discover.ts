import {corsHeaders, checkOrigin} from './api-cors';
import {publicHttpUrl, readRemote} from './safe-remote';
import {parseFeed} from './news';
import type {SettingsRateLimiter} from './api-settings';

export type DiscoverOptions = {allowedOrigins: string[]; rateLimiter?: SettingsRateLimiter};

// Paths to try when a page declares no feed of its own. Most publishing
// platforms answer on one of these.
const commonPaths = ['/feed/', '/rss.xml', '/feed.xml', '/atom.xml', '/index.xml'];

function declaredFeeds(html: string, base: string) {
 const found: string[] = [];
 for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
  const tag = match[0];
  if (!/rel=["']?alternate/i.test(tag)) continue;
  if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
  const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
  if (!href) continue;
  try {found.push(new URL(href, base).href);} catch {/* a malformed href is not a feed */}
 }
 return Array.from(new Set(found));
}

async function describe(url: string) {
 const xml = await readRemote(url, 400000, 8000);
 if (!/<(rss|feed)\b/i.test(xml)) throw Error('Not a feed');
 const items = parseFeed(xml, '');
 const title = xml.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').trim().slice(0, 120) || '';
 return {url, title, items: items.length, sample: items[0]?.title ?? ''};
}

export async function handleDiscover(request: Request, options: DiscoverOptions): Promise<Response> {
 const cors = {...corsHeaders(request, options.allowedOrigins, 'POST'), 'Cache-Control': 'no-store'};
 const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: cors});
 if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
 if (request.method !== 'POST') return reply({error: 'Use POST to look for a feed.'}, 405);
 if (!checkOrigin(request, options.allowedOrigins).allowed) return reply({error: 'Invalid origin.'}, 403);

 if (options.rateLimiter) {
  const key = 'discover:' + (request.headers.get('cf-connecting-ip') || 'anonymous');
  try {
   if (!(await options.rateLimiter.limit({key})).success) return reply({error: 'Too many lookups. Wait a minute and try again.'}, 429);
  } catch {/* never fail the request because the limiter is unavailable */}
 }

 let input; try {input = await request.json() as {url?: string};} catch {return reply({error: 'Invalid request.'}, 400);}
 let target; try {target = publicHttpUrl(String(input.url ?? '')).href;} catch {return reply({error: 'That website address cannot be used.'}, 400);}

 // The address given may already be a feed.
 try {return reply({feeds: [await describe(target)]});} catch {/* carry on and treat it as a page */}

 let candidates: string[] = [];
 try {
  const html = await readRemote(target, 600000, 10000);
  candidates = declaredFeeds(html, target);
 } catch {return reply({error: 'That website did not respond, so its feed could not be looked up.'}, 502);}

 if (!candidates.length) {
  const origin = new URL(target).origin;
  candidates = commonPaths.map(path => origin + path);
 }

 const feeds = [];
 // Bounded so one lookup cannot fan out into a crawl.
 for (const candidate of candidates.slice(0, 6)) {
  try {feeds.push(await describe(candidate));} catch {/* not a feed; try the next */}
  if (feeds.length >= 3) break;
 }
 if (!feeds.length) return reply({error: 'No RSS or Atom feed was found on that website. It may not publish one.', feeds: []}, 404);
 return reply({feeds});
}
