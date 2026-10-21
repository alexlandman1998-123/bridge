/** Server credentials are runtime secrets, never browser configuration.
 * Legacy request compatibility is explicitly temporary; disable it after callers migrate.
 * A key plus a user's JWT retains the user's identity and must never become service authority.
 */
export function credentialSet(env = Deno.env) {
  const read = (name) => (env.get(name) || '').trim();
  const map = (name, prefix) => {
    const raw = read(name);
    if (!raw) return [];
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid runtime API credential configuration.');
    return [...new Set([value.default, ...Object.values(value)].filter(v => typeof v === 'string' && v.startsWith(prefix)))];
  };
  const serviceAlias = read('SUPABASE_SERVICE_ROLE_KEY');
  const anonAlias = read('SUPABASE_ANON_KEY');
  const secrets = map('SUPABASE_SECRET_KEYS', 'sb_secret_');
  const publishable = map('SUPABASE_PUBLISHABLE_KEYS', 'sb_publishable_');
  // Supabase may repoint reserved compatibility aliases to modern keys after
  // legacy retirement. Those values must not be classified as retired JWTs.
  if (serviceAlias.startsWith('sb_secret_') && !secrets.includes(serviceAlias)) secrets.push(serviceAlias);
  if (anonAlias.startsWith('sb_publishable_') && !publishable.includes(anonAlias)) publishable.push(anonAlias);
  return {
    secrets,
    publishable,
    legacyService: serviceAlias.startsWith('sb_secret_') ? '' : serviceAlias,
    legacyAnon: anonAlias.startsWith('sb_publishable_') ? '' : anonAlias,
    allowLegacy: read('ARCH9_ALLOW_LEGACY_API_KEYS') === 'true',
  };
}
export function supabaseServiceKey(env = Deno.env) {
  const keys = credentialSet(env);
  return keys.secrets[0] || (keys.allowLegacy ? keys.legacyService : '');
}
export function supabasePublishableKey(env = Deno.env) {
  const keys = credentialSet(env);
  return keys.publishable[0] || (keys.allowLegacy ? keys.legacyAnon : '');
}
export function withApiCredentials(handler, env = Deno.env) {
  return (request, ...rest) => {
    const keys = credentialSet(env);
    const headers = new Headers(request.headers);
    const apiKey = (headers.get('apikey') || '').trim();
    const authorization = (headers.get('authorization') || '').trim();
    const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
    const service = keys.secrets[0];
    const publishable = keys.publishable[0];
    const legacy = [keys.legacyService, keys.legacyAnon].filter(Boolean);
    if (!keys.allowLegacy && [apiKey, bearer].some(v => legacy.includes(v))) {
      return new Response(JSON.stringify({ error: 'Retired API credential.' }), { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
    }
    const replace = (value) => {
      if (keys.allowLegacy && value === keys.legacyService && value) return service || value;
      if (keys.allowLegacy && value === keys.legacyAnon && value) return publishable || value;
      if (keys.secrets.includes(value)) return service;
      return value;
    };
    const nextApiKey = replace(apiKey);
    if (apiKey && nextApiKey !== apiKey) headers.set('apikey', nextApiKey);
    // Only an absent bearer or an exact known API credential can be normalized.
    // An arbitrary JWT is preserved for the handler's normal getUser/RLS checks.
    const nextBearer = bearer ? replace(bearer) : (!authorization ? nextApiKey : '');
    if (nextBearer && nextBearer !== bearer) headers.set('authorization', 'Bearer ' + nextBearer);
    return handler(new Request(request, { headers }), ...rest);
  };
}
