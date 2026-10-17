const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
function encryptionBytes() {
  const bytes = Uint8Array.from(atob(text(Deno.env.get('META_TOKEN_ENCRYPTION_KEY'))), c => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error('Meta connection encryption is not configured.');
  return bytes;
}
export async function encryptMetaToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', encryptionBytes(), 'AES-GCM', false, ['encrypt']);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token)));
  return `${btoa(String.fromCharCode(...iv))}.${btoa(String.fromCharCode(...encrypted))}`;
}
export async function decryptMetaToken(ciphertext: string) {
  const [a,b] = ciphertext.split('.');
  if (!a || !b) throw new Error('Reconnect the Meta account.');
  const key = await crypto.subtle.importKey('raw', encryptionBytes(), 'AES-GCM', false, ['decrypt']);
  const iv = Uint8Array.from(atob(a), c => c.charCodeAt(0));
  const encrypted = Uint8Array.from(atob(b), c => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted));
}
export async function whatsappAccessToken(connection: { token_ciphertext?: string | null; meta_access_token?: string | null }) {
  return connection.token_ciphertext ? await decryptMetaToken(connection.token_ciphertext) : text(connection.meta_access_token);
}
