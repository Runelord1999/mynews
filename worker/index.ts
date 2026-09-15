// Standalone Mynews API. This is the only server the public reader needs:
// GitHub Pages serves the static interface and calls this Worker for live
// headlines and for online settings backups.
import {handleFeed} from '../lib/api-feed';
import {handleSettings, type SettingsDb, type SettingsRateLimiter} from '../lib/api-settings';
import {resolveOrigins} from '../lib/api-cors';

export type WorkerEnv = {
 DB?: SettingsDb;
 ALLOWED_ORIGINS?: string;
 SETTINGS_RATE_LIMITER?: SettingsRateLimiter;
};

const mynewsApi = {
 async fetch(request: Request, env: WorkerEnv): Promise<Response> {
  const {pathname} = new URL(request.url);
  const allowedOrigins = resolveOrigins(env.ALLOWED_ORIGINS);
  if (pathname === '/api/feed') return handleFeed(request, {allowedOrigins});
  if (pathname === '/api/settings') return handleSettings(request, {db: env.DB, allowedOrigins, rateLimiter: env.SETTINGS_RATE_LIMITER});
  if (pathname === '/api/health') return Response.json({ok: true, database: Boolean(env.DB)}, {headers: {'Cache-Control': 'no-store'}});
  return new Response('Not found', {status: 404, headers: {'Cache-Control': 'no-store'}});
 },
};

export default mynewsApi;
