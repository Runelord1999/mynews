import {corsHeaders, checkOrigin} from './api-cors';
import {publicHttpUrl, readRemote} from './safe-remote';
import {extractArticle} from './article-text';
import type {SettingsDb, SettingsRateLimiter} from './api-settings';

export type ArticleOptions = {db?: SettingsDb; allowedOrigins: string[]; rateLimiter?: SettingsRateLimiter};

// Article pages are far larger than feeds and this runs per reader request, so
// the read is capped well below the feed limit to keep parsing cheap.
const maxArticleBytes = 2000000;

async function sha256Hex(value: string) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}

export async function handleArticle(request: Request, options: ArticleOptions): Promise<Response> {
 const cors = {...corsHeaders(request, options.allowedOrigins, 'POST'), 'Cache-Control': 'no-store'};
 const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: cors});
 if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
 if (request.method !== 'POST') return reply({error: 'Use POST to read an article.'}, 405);
 if (!checkOrigin(request, options.allowedOrigins).allowed) return reply({error: 'Invalid origin.'}, 403);

 if (options.rateLimiter) {
  const key = 'article:' + (request.headers.get('cf-connecting-ip') || 'anonymous');
  try {
   if (!(await options.rateLimiter.limit({key})).success) return reply({error: 'Too many article requests. Wait a minute and try again.'}, 429);
  } catch {/* never fail the request because the limiter is unavailable */}
 }

 let input; try {input = await request.json() as {url?: string};} catch {return reply({error: 'Invalid article request.'}, 400);}
 let target; try {target = publicHttpUrl(String(input.url ?? '')).href;} catch {return reply({error: 'That article address cannot be read.'}, 400);}

 const hash = await sha256Hex('full-article-v1:'+target);
 const db = options.db;

 // Available article text read once is served to everyone else for free.
 if (db) {
  try {
   const row = await db.prepare('SELECT summary, words, created_at FROM article_summaries WHERE url_hash = ?').bind(hash).first<{summary: string; words: number; created_at: string}>();
   if (row) return reply({url: target, summary: row.summary, words: row.words, cached: true, readAt: row.created_at});
  } catch {/* a cache miss and a cache failure are the same thing here */}
 }

 let summary = '';
 try {
  const html=await readRemote(target, maxArticleBytes, 18000, true);
  if(/["']isAccessibleForFree["']\s*:\s*(?:false|["']false["'])/i.test(html))return reply({error:'The publisher marks this article as restricted or subscription-only. Open the original article to read it.'},422);
  summary = extractArticle(html);
 } catch(e) {return reply({error: e instanceof Error&&e.message.includes('too large')?e.message:'The article is blocked or unavailable. The publisher may require a subscription, sign-in, or a browser to load it. Open the original article.'}, 502);}
 const words = summary.split(/\s+/).filter(Boolean).length;
 if (words < 20) return reply({error: 'Full article text is unavailable. This page may contain only a preview, require JavaScript, or be a news-index link. Open the original article.'}, 422);

 if (db) {
  try {
   await db.prepare('INSERT INTO article_summaries (url_hash, url, summary, words, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(url_hash) DO UPDATE SET summary = excluded.summary, words = excluded.words, created_at = excluded.created_at')
    .bind(hash, target, summary, words, new Date().toISOString()).run();
  } catch {/* returning the summary matters more than storing it */}
 }
 return reply({url: target, summary, words, cached: false});
}
