// Shared CORS policy for the public Mynews API. The reader is served from a
// different origin (GitHub Pages) than the API, so every response must name the
// caller explicitly and vary on Origin so shared caches never mix them up.
export const publicOrigins = ['https://runelord1999.github.io'];

export function resolveOrigins(configured?: string) {
  const extra = (configured || '').split(',').map(value => value.trim()).filter(Boolean);
  return extra.length ? extra : publicOrigins;
}

export function checkOrigin(request: Request, allowed: string[]) {
  const origin = request.headers.get('origin');
  // Same-origin and server-to-server calls send no Origin header.
  if (!origin) return { origin: null, allowed: true };
  const list = new Set([...allowed, new URL(request.url).origin]);
  return { origin, allowed: list.has(origin) };
}

export function corsHeaders(request: Request, allowed: string[], methods: string) {
  const check = checkOrigin(request, allowed);
  return {
    Vary: 'Origin',
    ...(check.origin && check.allowed ? { 'Access-Control-Allow-Origin': check.origin } : {}),
    'Access-Control-Allow-Methods': methods + ', OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  } as Record<string, string>;
}
