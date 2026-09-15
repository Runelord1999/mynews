import {corsHeaders, checkOrigin} from './api-cors';
import {normaliseId, validId} from './settings-id';
import type {SettingsDb, SettingsRateLimiter} from './api-settings';

export type AdminOptions = {db?: SettingsDb; allowedOrigins: string[]; adminKey?: string; rateLimiter?: SettingsRateLimiter};

type SettingsRow = {
 id: string; data: string; created_at: string; updated_at: string; save_count: number;
 last_ip: string | null; last_country: string | null; last_city: string | null;
 last_user_agent: string | null; last_device: string | null;
};
type AccessRow = {settings_id: string; action: string; at: string; ip: string | null; country: string | null; city: string | null; user_agent: string | null; device: string | null};

async function sha256Hex(value: string) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}

// Compare digests rather than the keys themselves so the check takes the same
// time whatever the supplied key looks like.
async function keyMatches(supplied: string, expected: string) {
 const [a, b] = await Promise.all([sha256Hex(supplied), sha256Hex(expected)]);
 let diff = 0;
 for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
 return diff === 0;
}

function summarise(row: SettingsRow) {
 let topics = 0, articles = 0, sites = 0, fontSize: number | null = null;
 try {
  const data = JSON.parse(row.data) as {topics?: unknown[]; articles?: unknown[]; sites?: unknown[]; fontSize?: number};
  topics = data.topics?.length ?? 0; articles = data.articles?.length ?? 0; sites = data.sites?.length ?? 0;
  fontSize = typeof data.fontSize === 'number' ? data.fontSize : null;
 } catch {/* a row that cannot be parsed still deserves to be listed */}
 return {
  id: row.id, createdAt: row.created_at, updatedAt: row.updated_at, saveCount: row.save_count,
  topics, articles, sites, fontSize,
  lastIp: row.last_ip || '', lastCountry: row.last_country || '', lastCity: row.last_city || '',
  lastUserAgent: row.last_user_agent || '', lastDevice: row.last_device || '',
 };
}

export async function handleAdmin(request: Request, options: AdminOptions): Promise<Response> {
 const cors = {...corsHeaders(request, options.allowedOrigins, 'POST'), 'Cache-Control': 'no-store'};
 const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: cors});
 if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
 if (request.method !== 'POST') return reply({error: 'Use POST for admin actions.'}, 405);
 if (!checkOrigin(request, options.allowedOrigins).allowed) return reply({error: 'Invalid origin.'}, 403);

 // Fail closed: without a configured key there is no way to authorise anyone.
 if (!options.adminKey) return reply({error: 'Master Admin is not configured on this server. Set the ADMIN_KEY secret on the Worker.'}, 503);

 if (options.rateLimiter) {
  const key = 'admin:' + (request.headers.get('cf-connecting-ip') || 'anonymous');
  try {
   if (!(await options.rateLimiter.limit({key})).success) return reply({error: 'Too many admin requests. Wait a minute and try again.'}, 429);
  } catch {/* never fail the request because the limiter is unavailable */}
 }

 const supplied = request.headers.get('x-admin-key') || '';
 if (!supplied || !(await keyMatches(supplied, options.adminKey))) return reply({error: 'Incorrect admin key.'}, 401);

 try {
  const db = options.db; if (!db) throw Error('Database unavailable');
  let input; try {input = await request.json() as {action?: string; id?: string; newId?: string};} catch {return reply({error: 'Invalid admin request.'}, 400);}

  if (input.action === 'list') {
   const rows = await db.prepare('SELECT * FROM settings ORDER BY updated_at DESC LIMIT 200').bind().all<SettingsRow>();
   const events = await db.prepare('SELECT settings_id, action, at, ip, country, city, user_agent, device FROM settings_access ORDER BY event_id DESC LIMIT 500').bind().all<AccessRow>();
   const history: Record<string, Array<Omit<AccessRow, 'settings_id'>>> = {};
   for (const event of events.results) (history[event.settings_id] ??= []).push({action: event.action, at: event.at, ip: event.ip, country: event.country, city: event.city, user_agent: event.user_agent, device: event.device});
   return reply({entries: rows.results.map(summarise), history});
  }

  const id = normaliseId(String(input.id ?? ''));
  if (!validId(id)) return reply({error: 'Choose a valid Settings ID.'}, 400);

  if (input.action === 'delete') {
   await db.prepare('DELETE FROM settings WHERE id = ?').bind(id).run();
   await db.prepare('DELETE FROM settings_access WHERE settings_id = ?').bind(id).run();
   return reply({ok: true, id, deleted: true});
  }

  if (input.action === 'rename') {
   const newId = normaliseId(String(input.newId ?? ''));
   if (!validId(newId)) return reply({error: 'New IDs are 3 to 40 characters using letters, numbers, hyphens and underscores.'}, 400);
   if (newId === id) return reply({ok: true, id, renamed: false});
   const existing = await db.prepare('SELECT id FROM settings WHERE id = ?').bind(newId).first<{id: string}>();
   if (existing) return reply({error: 'That ID is already in use. Choose another.'}, 409);
   const current = await db.prepare('SELECT id FROM settings WHERE id = ?').bind(id).first<{id: string}>();
   if (!current) return reply({error: 'No settings found under that ID.'}, 404);
   await db.prepare('UPDATE settings SET id = ? WHERE id = ?').bind(newId, id).run();
   await db.prepare('UPDATE settings_access SET settings_id = ? WHERE settings_id = ?').bind(newId, id).run();
   return reply({ok: true, id: newId, previousId: id, renamed: true});
  }

  return reply({error: 'Invalid admin action.'}, 400);
 } catch {return reply({error: 'Master Admin is temporarily unavailable. Please try again.'}, 503);}
}
