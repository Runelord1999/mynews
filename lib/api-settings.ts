import {parseBackup} from './browser-library';
import {checkOrigin, corsHeaders} from './api-cors';

const limit = 128 * 1024;

// Minimal shape of the D1 binding this handler needs, so the same code runs on
// Workers, on the Next route, and against an in-memory SQLite database in tests.
export type SettingsDb = {
 prepare(sql: string): {bind(...values: unknown[]): {first<T>(): Promise<T | null>; run(): Promise<unknown>}};
};
export type SettingsRateLimiter = {limit(options: {key: string}): Promise<{success: boolean}>};

export type SettingsOptions = {db?: SettingsDb; allowedOrigins: string[]; rateLimiter?: SettingsRateLimiter};

async function sha256Hex(value: string) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}

export async function handleSettings(request: Request, options: SettingsOptions): Promise<Response> {
 const cors = {...corsHeaders(request, options.allowedOrigins, 'POST'), 'Cache-Control': 'no-store'};
 const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: cors});
 if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
 if (request.method !== 'POST') return reply({error: 'Use POST for online settings.'}, 405);
 if (!checkOrigin(request, options.allowedOrigins).allowed) return reply({error: 'Invalid origin.'}, 403);

 // Rate limit before touching the token so guessing an ID is not free either.
 if (options.rateLimiter) {
  const key = request.headers.get('cf-connecting-ip') || 'anonymous';
  try {
   if (!(await options.rateLimiter.limit({key})).success) return reply({error: 'Too many online settings requests. Wait a minute and try again.'}, 429);
  } catch {/* never fail the request because the limiter is unavailable */}
 }

 const token = request.headers.get('authorization')?.replace(/^Bearer /, '') || '';
 if (!/^[a-f0-9]{64}$/.test(token)) return reply({error: 'Enter a valid private user ID.'}, 401);
 try {
  if (Number(request.headers.get('content-length')) > limit) return reply({error: 'Settings exceed the 128 KB online backup limit. Use Save settings to download a file.'}, 413);
  const reader = request.body?.getReader(); if (!reader) return reply({error: 'Missing settings request.'}, 400);
  let size = 0, raw = ''; const decoder = new TextDecoder();
  while (true) {
   const {done, value} = await reader.read(); if (done) break;
   size += value.length; if (size > limit) {await reader.cancel(); return reply({error: 'Settings exceed the 128 KB online backup limit. Use a local file.'}, 413);}
   raw += decoder.decode(value, {stream: true});
  }
  raw += decoder.decode();
  let input; try {input = JSON.parse(raw);} catch {return reply({error: 'Invalid settings request.'}, 400);}
  const hash = await sha256Hex(token);
  const db = options.db; if (!db) throw Error('Database unavailable');
  if (input.action === 'load') {
   const row = await db.prepare('SELECT data, updated_at FROM settings_backups WHERE key_hash = ?').bind(hash).first<{data: string; updated_at: string}>();
   if (!row) return reply({error: 'No saved settings found for this ID. Check the ID and try again.'}, 404);
   return reply({backup: JSON.parse(row.data), updatedAt: row.updated_at});
  }
  if (input.action === 'delete') {
   await db.prepare('DELETE FROM settings_backups WHERE key_hash = ?').bind(hash).run();
   return reply({ok: true, deleted: true});
  }
  if (input.action !== 'save') return reply({error: 'Invalid action.'}, 400);
  let backup; try {backup = parseBackup(JSON.stringify(input.backup));} catch {return reply({error: 'Invalid settings. Your online backup has not changed.'}, 400);}
  const updatedAt = new Date().toISOString();
  await db.prepare('INSERT INTO settings_backups (key_hash, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(key_hash) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(hash, JSON.stringify(backup), updatedAt).run();
  return reply({ok: true, updatedAt});
 } catch {return reply({error: 'Online settings are temporarily unavailable. Please try again.'}, 503);}
}
