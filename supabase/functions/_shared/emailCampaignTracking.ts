type Destination = { v: 1; l: string; r: string; t: string; u: string; c: string; o: string; a?: string };
const bytes = new TextEncoder();
const encode = (value: Uint8Array) => btoa(Array.from(value, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function decode(value: string) {
  if (!/^[a-zA-Z0-9_-]+$/.test(value) || value.length > 12000) throw new Error('Invalid capability.');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), char => char.charCodeAt(0));
}
export function campaignDestination(value: unknown) {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.href.length <= 4096 ? url.href : null;
  } catch { return null; }
}
async function signingKey(secret: string, usage: KeyUsage[]) {
  return crypto.subtle.importKey('raw', bytes.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage);
}
export async function signCampaignDestination(secret: string, destination: Omit<Destination, 'v'>) {
  if (!secret || !campaignDestination(destination.u)) throw new Error('Tracking destination is not configured.');
  const d = encode(bytes.encode(JSON.stringify({ v: 1, ...destination })));
  const sig = encode(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret, ['sign']), bytes.encode(d))));
  return { d, sig };
}
export async function verifyCampaignDestination(secret: string, url: URL): Promise<Destination | null> {
  try {
    const d = url.searchParams.get('d') || '', sig = url.searchParams.get('sig') || '';
    if (!secret || d.length > 12000 || !await crypto.subtle.verify('HMAC', await signingKey(secret, ['verify']), decode(sig), bytes.encode(d))) return null;
    const value = JSON.parse(new TextDecoder().decode(decode(d))) as Destination;
    if (value.v !== 1 || value.l !== url.searchParams.get('l') || value.r !== url.searchParams.get('r') || value.t !== url.searchParams.get('t') || !campaignDestination(value.u)) return null;
    return value;
  } catch { return null; }
}
