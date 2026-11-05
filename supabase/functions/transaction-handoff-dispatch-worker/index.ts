import { supabaseServiceKey, withApiCredentials } from "../_shared/apiCredentials.ts";
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.49.9';
import { dispatchTransactionHandoffJob } from '../_shared/transactionHandoffDelivery.ts';
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

async function sameCredential(left: string, right: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([left, right].map(async value =>
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))));
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function serviceCredentials() {
  const legacy = text(supabaseServiceKey());
  let secrets: string[] = [];
  try {
    const configured = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
      secrets = Object.values(configured).map(text).filter(value => value.startsWith('sb_secret_'));
    }
  } catch { /* Invalid secret configuration never authorizes an unknown key. */ }
  return { legacy, secrets };
}

async function authorized(request: Request, credentials: ReturnType<typeof serviceCredentials>) {
  const apiKey = text(request.headers.get('apikey'));
  const authorization = text(request.headers.get('authorization'));
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (authorization && !bearer) return false;
  if ((!apiKey && !bearer) || apiKey.length > 8192 || bearer.length > 8192) return false;
  if (apiKey && bearer && !await sameCredential(apiKey, bearer)) return false;
  // New keys belong in apikey. Permit the existing scheduler's duplicated
  // header during the forward migration, but never an opaque bearer alone.
  if (!apiKey && bearer.startsWith('sb_secret_')) return false;
  const incoming = apiKey || bearer;
  const allowed = [credentials.legacy, ...credentials.secrets].filter(Boolean);
  const matches = await Promise.all(allowed.map(value => sameCredential(incoming, value)));
  return matches.some(Boolean);
}

function validAppUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

Deno.serve(withApiCredentials(async request => {
  if (request.method !== 'POST') return json(405, { error: 'POST is required.' });
  const credentials = serviceCredentials();
  if (!await authorized(request, credentials)) return json(403, { error: 'Worker authorization required.' });
  const key = credentials.legacy || credentials.secrets[0];
  const url = text(Deno.env.get('SUPABASE_URL'));
  const config = {
    appUrl: text(Deno.env.get('ARCH9_APP_URL')),
    sender: text(Deno.env.get('ARCH9_RESEND_FROM_EMAIL')) || text(Deno.env.get('RESEND_FROM_EMAIL')),
    apiKey: text(Deno.env.get('RESEND_API_KEY')),
  };
  if (!url || !validAppUrl(config.appUrl) || !config.sender || /[\r\n]/.test(config.sender) || !config.apiKey) {
    return json(500, { error: 'Worker environment configuration is incomplete.' });
  }
  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    const body = raw.trim() ? JSON.parse(raw) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'A JSON object is required.' });
    input = body;
  } catch { return json(400, { error: 'A JSON object is required.' }); }
  const mode = input.mode ?? 'dispatch';
  if (mode !== 'health' && mode !== 'dispatch') return json(400, { error: 'Unsupported worker mode.' });
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    if (mode === 'health') {
      // This probe never claims a lease, changes a matter or invokes a provider.
      const [pending, blocked] = await Promise.all([
        client.from('transaction_handoff_dispatch_jobs').select('id', { count: 'exact', head: true }).in('status', ['queued', 'retry', 'leased']),
        client.from('transaction_handoff_dispatch_jobs').select('id', { count: 'exact', head: true }).eq('status', 'blocked'),
      ]);
      if (pending.error || blocked.error || pending.count === null || blocked.count === null) {
        return json(503, { error: 'Dispatch queue could not be checked.' });
      }
      return json(200, { ok: true, mode: 'health', configurationReady: true, queue: { pending: pending.count, blocked: blocked.count } });
    }
    const requested = Number(input.limit);
    const limit = Number.isFinite(requested) ? Math.max(1, Math.min(Math.trunc(requested) || 10, 25)) : 10;
    const claimed = await client.rpc('claim_transaction_handoff_dispatch', { p_limit: limit });
    if (claimed.error) return json(500, { error: 'Dispatch queue could not be claimed.' });
    const results = await Promise.all((claimed.data || []).map((job: any) => dispatchTransactionHandoffJob(client, job, config)));
    return json(200, { ok: true, claimed: results.length, results });
  } catch { return json(503, { error: 'Dispatch worker could not complete.' }); }
}));
