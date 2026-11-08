async function digest(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
type RecordValue = Record<string, unknown>;
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const origins = new Set(['https://madisonplace.co.za', 'https://www.madisonplace.co.za', 'https://app.arch9.co.za']);
export async function handleMadisonEnquiry(request: Request, deps: { client: any; hashSalt: string }) {
  const origin = request.headers.get('origin') || '';
  const allowed = origins.has(origin);
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin',
    ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  const respond = (status: number, data: RecordValue) => new Response(JSON.stringify(data), { status, headers });
  if (origin && !allowed) return respond(403, { error: 'This website cannot submit a Madison Place enquiry.' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return respond(405, { error: 'Use POST to submit an enquiry.' });
  if (!deps.client || !deps.hashSalt) return respond(503, { error: 'Enquiries are temporarily unavailable. Please try again shortly.' });
  let body: RecordValue;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return respond(413, { error: 'Your enquiry is too long. Please shorten your message.' });
    body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
  } catch { return respond(400, { error: 'Your enquiry could not be read. Please try again.' }); }
  const id = text(body.requestId), name = text(body.name), email = text(body.email).toLowerCase(), phone = text(body.phone);
  const interest = text(body.interest), message = text(body.message);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    || name.length < 2 || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254
    || phone.length < 6 || phone.length > 40 || message.length > 4000 || interest.length > 100
    || body.consent !== true || text(body.website)) return respond(400, { error: 'Enter your name, email and phone number, and agree to be contacted.' });
  const ip = text(request.headers.get('x-forwarded-for')).split(',')[0] || 'unknown';
  // Private, keyed digests. Never persist IP addresses or trust a client-supplied tenant/owner.
  const fingerprint = await digest(JSON.stringify([name, email, phone, interest, message]));
  const { data, error } = await deps.client.rpc('madison_capture_website_enquiry', {
    p_id: id, p_name: name, p_email: email, p_phone: phone, p_interest: interest, p_message: message,
    p_fingerprint: fingerprint, p_ip_hash: await digest(`${deps.hashSalt}:${ip}`),
  });
  if (error) {
    const status = error.code === '54000' ? 429 : error.code === '55000' ? 503 : error.code === '22023' ? 400 : 503;
    return respond(status, { error: status === 429 ? 'Too many enquiries. Please wait before trying again.'
      : status === 400 ? 'The enquiry details changed. Check your details and submit again.'
      : 'Your enquiry could not be saved. Please try again; your details are still here.' });
  }
  return respond(200, { reference: data.reference, saved: true, duplicate: data.duplicate === true, emailStatus: 'queued' });
}
