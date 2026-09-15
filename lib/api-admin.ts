import {corsHeaders, checkOrigin} from './api-cors';
import {normaliseId, normaliseOwner, validId, validOwner} from './settings-id';
import type {SettingsDb, SettingsRateLimiter} from './api-settings';

export type AdminOptions = {db?: SettingsDb; allowedOrigins: string[]; adminKey?: string; rateLimiter?: SettingsRateLimiter};

type SettingsRow = {id: string; owner: string; data: string; created_at: string; updated_at: string; save_count: number};

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
 return {id: row.id, owner: row.owner, createdAt: row.created_at, updatedAt: row.updated_at, saveCount: row.save_count, topics, articles, sites, fontSize};
}

export async function handleAdmin(request: Request, options: AdminOptions): Promise<Response> {
 const cors = {...corsHeaders(request, options.allowedOrigins, 'POST'), 'Cache-Control': 'no-store'};
 const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: cors});
 if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors});
 if (request.method !== 'POST') return reply({error: 'Use POST for admin actions.'}, 405);
 if (!checkOrigin(request, options.allowedOrigins).allowed) return reply({error: 'Invalid origin.'}, 403);

 if (options.rateLimiter) {
  const key = 'admin:' + (request.headers.get('cf-connecting-ip') || 'anonymous');
  try {
   if (!(await options.rateLimiter.limit({key})).success) return reply({error: 'Too many admin requests. Wait a minute and try again.'}, 429);
  } catch {/* never fail the request because the limiter is unavailable */}
 }

 // Master Admin is open by default. Setting the ADMIN_KEY secret on the Worker
 // turns on a key check with no change to this page.
 if (options.adminKey) {
  const supplied = request.headers.get('x-admin-key') || '';
  if (!supplied || !(await keyMatches(supplied, options.adminKey))) return reply({error: 'Incorrect admin key.', keyRequired: true}, 401);
 }

 try {
  const db = options.db; if (!db) throw Error('Database unavailable');
  let input; try {input = await request.json() as {action?: string; id?: string; newId?: string; newOwner?: string};} catch {return reply({error: 'Invalid admin request.'}, 400);}

  if (input.action === 'list') {
   const rows = await db.prepare('SELECT * FROM settings ORDER BY updated_at DESC LIMIT 200').bind().all<SettingsRow>();
   return reply({entries: rows.results.map(summarise)});
  }

  const id = normaliseId(String(input.id ?? ''));
  if (!validId(id)) return reply({error: 'Choose a valid Settings ID.'}, 400);

  if (input.action === 'delete') {
   await db.prepare('DELETE FROM settings WHERE id = ?').bind(id).run();
   return reply({ok: true, id, deleted: true});
  }

  if (input.action === 'rename') {
   const current = await db.prepare('SELECT id FROM settings WHERE id = ?').bind(id).first<{id: string}>();
   if (!current) return reply({error: 'No settings found under that ID.'}, 404);

   // Either half can be changed on its own.
   const wantsOwner = input.newOwner !== undefined;
   const owner = normaliseOwner(String(input.newOwner ?? ''));
   if (wantsOwner && !validOwner(owner)) return reply({error: 'Owner names are 2 to 60 characters.'}, 400);

   const newId = input.newId === undefined ? id : normaliseId(String(input.newId));
   if (!validId(newId)) return reply({error: 'New IDs are 3 to 40 characters using letters, numbers, hyphens and underscores.'}, 400);
   if (newId !== id) {
    const existing = await db.prepare('SELECT id FROM settings WHERE id = ?').bind(newId).first<{id: string}>();
    if (existing) return reply({error: 'That ID is already in use. Choose another.'}, 409);
    await db.prepare('UPDATE settings SET id = ? WHERE id = ?').bind(newId, id).run();
   }
   if (wantsOwner) await db.prepare('UPDATE settings SET owner = ? WHERE id = ?').bind(owner, newId).run();
   return reply({ok: true, id: newId, previousId: id, renamed: newId !== id, ownerChanged: wantsOwner});
  }

  return reply({error: 'Invalid admin action.'}, 400);
 } catch {return reply({error: 'Master Admin is temporarily unavailable. Please try again.'}, 503);}
}
