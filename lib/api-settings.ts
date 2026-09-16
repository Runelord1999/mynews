import {parseBackup} from './browser-library';
import {checkOrigin, corsHeaders} from './api-cors';
import {normaliseId, normaliseOwner, validId, validOwner} from './settings-id';

const limit = 128 * 1024;

// Minimal shape of the D1 binding these handlers need, so the same code runs on
// Workers and against an in-memory SQLite database in tests.
export type SettingsDb = {
 prepare(sql: string): {bind(...values: unknown[]): {first<T>(): Promise<T | null>; all<T>(): Promise<{results: T[]}>; run(): Promise<unknown>}};
};
export type SettingsRateLimiter = {limit(options: {key: string}): Promise<{success: boolean}>};
export type SettingsOptions = {db?: SettingsDb; allowedOrigins: string[]; rateLimiter?: SettingsRateLimiter};

export async function handleSettings(request: Request, options: SettingsOptions): Promise<Response> {
 const cors = {...corsHeaders(request, options.allowedOrigins, 'POST'), 'Cache-Control': 'no-store'};
 const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: cors});
 if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
 if (request.method !== 'POST') return reply({error: 'Use POST for online settings.'}, 405);
 if (!checkOrigin(request, options.allowedOrigins).allowed) return reply({error: 'Invalid origin.'}, 403);

 // The limiter keys on the caller's IP but nothing about it is stored.
 if (options.rateLimiter) {
  const key = request.headers.get('cf-connecting-ip') || 'anonymous';
  try {
   if (!(await options.rateLimiter.limit({key})).success) return reply({error: 'Too many settings requests. Wait a minute and try again.'}, 429);
  } catch {/* never fail the request because the limiter is unavailable */}
 }

 try {
  if (Number(request.headers.get('content-length')) > limit) return reply({error: 'Settings exceed the 128 KB online limit. Use Save Settings Locally to download a file instead.'}, 413);
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
  const now = new Date().toISOString();

  // 'load' is accepted as an alias so older clients keep working.
  if (input.action === 'apply' || input.action === 'load') {
   const row = await db.prepare('SELECT owner, data, updated_at FROM settings WHERE id = ?').bind(id).first<{owner: string; data: string; updated_at: string}>();
   if (!row) return reply({error: 'No settings saved under that ID. Check the ID and try again.'}, 404);
   return reply({id, owner: row.owner, backup: JSON.parse(row.data), updatedAt: row.updated_at});
  }

  if (input.action === 'delete') {
   await db.prepare('DELETE FROM settings WHERE id = ?').bind(id).run();
   return reply({ok: true, id, deleted: true});
  }

  if (input.action !== 'save') return reply({error: 'Invalid action "' + String(input.action ?? '') + '".'}, 400);
  const owner = normaliseOwner(String(input.owner ?? ''));
  if (!validOwner(owner)) return reply({error: 'Add an owner name of 2 to 60 characters so this ID can be traced back to whoever created it.'}, 400);
  let backup; try {backup = parseBackup(JSON.stringify(input.backup));} catch {return reply({error: 'Those settings could not be read. Nothing was saved.'}, 400);}

  // Anyone holding an ID can overwrite it, so replacing someone else's saved
  // settings has to be asked for rather than assumed.
  const existing = await db.prepare('SELECT owner, updated_at, save_count FROM settings WHERE id = ?').bind(id).first<{owner: string; updated_at: string; save_count: number}>();
  if (existing && input.overwrite !== true) {
   return reply({error: 'This ID already holds settings.', conflict: true, existing: {id, owner: existing.owner, updatedAt: existing.updated_at, saveCount: existing.save_count}}, 409);
  }
  // The owner is whoever created the ID, so a later save never rewrites it.
  await db.prepare(
   `INSERT INTO settings (id, owner, data, created_at, updated_at, save_count) VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, save_count = settings.save_count + 1`,
  ).bind(id, owner, JSON.stringify(backup), now, now).run();
  const saved = await db.prepare('SELECT owner, created_at, save_count FROM settings WHERE id = ?').bind(id).first<{owner: string; created_at: string; save_count: number}>();
  return reply({ok: true, id, owner: saved?.owner ?? owner, updatedAt: now, createdAt: saved?.created_at ?? now, saveCount: saved?.save_count ?? 1});
 } catch {return reply({error: 'Online settings are temporarily unavailable. Please try again.'}, 503);}
}
