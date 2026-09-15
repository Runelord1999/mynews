import {parseBackup} from './browser-library';
import {checkOrigin, corsHeaders} from './api-cors';
import {normaliseId, validId} from './settings-id';

const limit = 128 * 1024;
const deviceLimit = 600;
const historyPerId = 20;

// Minimal shape of the D1 binding these handlers need, so the same code runs on
// Workers and against an in-memory SQLite database in tests.
export type SettingsDb = {
 prepare(sql: string): {bind(...values: unknown[]): {first<T>(): Promise<T | null>; all<T>(): Promise<{results: T[]}>; run(): Promise<unknown>}};
};
export type SettingsRateLimiter = {limit(options: {key: string}): Promise<{success: boolean}>};
export type SettingsOptions = {db?: SettingsDb; allowedOrigins: string[]; rateLimiter?: SettingsRateLimiter};

// Where the request came from. Cloudflare fills these in at the edge; the
// device blob is reported by the browser itself and is therefore untrusted,
// so it is length-capped and stored as an opaque string.
export type Visitor = {ip: string; country: string; city: string; userAgent: string; device: string};

export function readVisitor(request: Request, device: unknown): Visitor {
 const cf = (request as Request & {cf?: {country?: string; city?: string}}).cf;
 return {
  ip: (request.headers.get('cf-connecting-ip') || '').slice(0, 64),
  country: (cf?.country || request.headers.get('cf-ipcountry') || '').slice(0, 8),
  city: (cf?.city || '').slice(0, 80),
  userAgent: (request.headers.get('user-agent') || '').slice(0, 400),
  device: typeof device === 'object' && device ? JSON.stringify(device).slice(0, deviceLimit) : '',
 };
}

async function logAccess(db: SettingsDb, id: string, action: string, at: string, visitor: Visitor) {
 try {
  await db.prepare('INSERT INTO settings_access (settings_id, action, at, ip, country, city, user_agent, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
   .bind(id, action, at, visitor.ip, visitor.country, visitor.city, visitor.userAgent, visitor.device).run();
  // Keep the trail bounded so one noisy ID cannot fill the database.
  await db.prepare('DELETE FROM settings_access WHERE settings_id = ? AND event_id NOT IN (SELECT event_id FROM settings_access WHERE settings_id = ? ORDER BY event_id DESC LIMIT ?)')
   .bind(id, id, historyPerId).run();
 } catch {/* the access trail must never fail the user's request */}
}

export async function handleSettings(request: Request, options: SettingsOptions): Promise<Response> {
 const cors = {...corsHeaders(request, options.allowedOrigins, 'POST'), 'Cache-Control': 'no-store'};
 const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: cors});
 if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
 if (request.method !== 'POST') return reply({error: 'Use POST for online settings.'}, 405);
 if (!checkOrigin(request, options.allowedOrigins).allowed) return reply({error: 'Invalid origin.'}, 403);

 if (options.rateLimiter) {
  const key = request.headers.get('cf-connecting-ip') || 'anonymous';
  try {
   if (!(await options.rateLimiter.limit({key})).success) return reply({error: 'Too many settings requests. Wait a minute and try again.'}, 429);
  } catch {/* never fail the request because the limiter is unavailable */}
 }

 try {
  if (Number(request.headers.get('content-length')) > limit) return reply({error: 'Settings exceed the 128 KB online limit. Use Save settings to download a file instead.'}, 413);
  const reader = request.body?.getReader(); if (!reader) return reply({error: 'Missing settings request.'}, 400);
  let size = 0, raw = ''; const decoder = new TextDecoder();
  while (true) {
   const {done, value} = await reader.read(); if (done) break;
   size += value.length; if (size > limit) {await reader.cancel(); return reply({error: 'Settings exceed the 128 KB online limit. Use a local file instead.'}, 413);}
   raw += decoder.decode(value, {stream: true});
  }
  raw += decoder.decode();
  let input; try {input = JSON.parse(raw);} catch {return reply({error: 'Invalid settings request.'}, 400);}

  const id = normaliseId(String(input.id ?? ''));
  if (!validId(id)) return reply({error: 'Settings IDs are 3 to 40 characters using letters, numbers, hyphens and underscores.'}, 400);
  const db = options.db; if (!db) throw Error('Database unavailable');
  const visitor = readVisitor(request, input.device);
  const now = new Date().toISOString();

  // 'load' is accepted as an alias so older clients keep working.
  if (input.action === 'apply' || input.action === 'load') {
   const row = await db.prepare('SELECT data, updated_at FROM settings WHERE id = ?').bind(id).first<{data: string; updated_at: string}>();
   if (!row) return reply({error: 'No settings saved under that ID. Check the ID and try again.'}, 404);
   await logAccess(db, id, 'apply', now, visitor);
   return reply({id, backup: JSON.parse(row.data), updatedAt: row.updated_at});
  }

  if (input.action === 'delete') {
   await db.prepare('DELETE FROM settings WHERE id = ?').bind(id).run();
   await db.prepare('DELETE FROM settings_access WHERE settings_id = ?').bind(id).run();
   return reply({ok: true, id, deleted: true});
  }

  if (input.action !== 'save') return reply({error: 'Invalid action.'}, 400);
  let backup; try {backup = parseBackup(JSON.stringify(input.backup));} catch {return reply({error: 'Those settings could not be read. Nothing was saved.'}, 400);}
  await db.prepare(
   `INSERT INTO settings (id, data, created_at, updated_at, save_count, last_ip, last_country, last_city, last_user_agent, last_device)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, save_count = settings.save_count + 1,
     last_ip = excluded.last_ip, last_country = excluded.last_country, last_city = excluded.last_city,
     last_user_agent = excluded.last_user_agent, last_device = excluded.last_device`,
  ).bind(id, JSON.stringify(backup), now, now, visitor.ip, visitor.country, visitor.city, visitor.userAgent, visitor.device).run();
  await logAccess(db, id, 'save', now, visitor);
  const saved = await db.prepare('SELECT created_at, save_count FROM settings WHERE id = ?').bind(id).first<{created_at: string; save_count: number}>();
  return reply({ok: true, id, updatedAt: now, createdAt: saved?.created_at ?? now, saveCount: saved?.save_count ?? 1});
 } catch {return reply({error: 'Online settings are temporarily unavailable. Please try again.'}, 503);}
}
