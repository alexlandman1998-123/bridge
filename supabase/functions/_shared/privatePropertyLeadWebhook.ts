type Json = Record<string, unknown>;
type Client = { from: (table: string) => any; rpc: (name: string, args: Json) => any };
const text = (value: unknown) => value == null ? '' : String(value).trim();
const json = (status: number, body: Json) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

function signatureBytes(value: string) {
  const candidate = value.replace(/^sha256=/i, '').trim();
  if (/^[0-9a-f]{64}$/i.test(candidate)) return Uint8Array.from(candidate.match(/.{2}/g)!.map((item) => parseInt(item, 16)));
  try { return Uint8Array.from(atob(candidate), (character) => character.charCodeAt(0)); } catch { return new Uint8Array(); }
}
export async function validPrivatePropertySignature(raw: Uint8Array, signature: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, raw as BufferSource));
  const actual = signatureBytes(signature);
  if (actual.length !== expected.length) return false;
  let different = 0;
  for (let index = 0; index < expected.length; index++) different |= expected[index] ^ actual[index];
  return different === 0;
}

export async function handlePrivatePropertyLeadWebhook(request: Request, {
  client, secretFromEnv = () => '', now = () => new Date(),
}: { client: Client | null; secretFromEnv?: (name: string) => string; now?: () => Date }) {
  if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!client) return json(503, { error: 'webhook_storage_not_configured' });
  if (Number(request.headers.get('content-length') || 0) > 256 * 1024) return json(413, { error: 'payload_too_large' });
  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > 256 * 1024) return json(413, { error: 'payload_too_large' });
  let payload: Json;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
  } catch { return json(400, { error: 'invalid_json' }); }
  const agencyId = text(payload.agencyId);
  const providerLeadId = text(payload.leadId);
  if (!/^\d+$/.test(agencyId) || !providerLeadId) return json(400, { error: 'missing_private_property_identifiers' });
  if (!text(request.headers.get('x-signature'))) return json(401, { error: 'invalid_signature' });
  try {
    const configs = await client.from('private_property_agency_configs')
      .select('id,organisation_id,branch_guid,metadata_json,webhook_secret_id,go_live_approved_at')
      .eq('environment', 'production').eq('enabled', true).in('status', ['approved', 'active'])
      .eq('metadata_json->>private_property_agency_id', agencyId);
    if (configs.error) throw configs.error;
    const candidates = (configs.data || []).filter((row: Json) => row.go_live_approved_at);
    if (!candidates.length) return json(404, { error: 'private_property_agency_not_configured' });
    if (new Set(candidates.map((row: Json) => row.organisation_id)).size !== 1) {
      return json(409, { error: 'ambiguous_private_property_agency' });
    }
    let verified = false;
    let secretConfigured = false;
    for (const config of candidates) {
      const metadata = (config.metadata_json || {}) as Json;
      const stored = config.webhook_secret_id
        ? await client.rpc('get_private_property_webhook_secret', { p_config_id: config.id })
        : { data: secretFromEnv(text(metadata.private_property_webhook_secret_name)), error: null };
      if (stored.error) throw stored.error;
      const secret = typeof stored.data === 'string' ? stored.data : '';
      if (!secret) continue;
      secretConfigured = true;
      if (await validPrivatePropertySignature(raw, text(request.headers.get('x-signature')), secret)) { verified = true; break; }
    }
    if (!verified) return json(secretConfigured ? 401 : 503, { error: secretConfigured ? 'invalid_signature' : 'webhook_secret_not_configured' });
    const config = candidates[0]; // Agency ownership was verified independently of branch/listing routing.
    if (text(payload.messageType).toLowerCase() !== 'lead') return json(200, { received: true, status: 'ignored' });
    if (!text(payload.leadName) && !text(payload.leadEmail) && !text(payload.leadPhoneNumber || payload.leadPhone)) {
      return json(400, { error: 'missing_lead_identity' });
    }

    const timestamp = now().toISOString();
    const eventResult = await client.from('private_property_webhook_events').insert({ organisation_id: config.organisation_id,
      agency_id: agencyId, provider_lead_id: providerLeadId, message_type: text(payload.messageType), payload_json: payload, updated_at: timestamp })
      .select('id,status').single();
    let event = eventResult.data;
    if (eventResult.error?.code === '23505') {
      const existing = await client.from('private_property_webhook_events').select('id,status,updated_at')
        .eq('organisation_id', config.organisation_id).eq('provider_lead_id', providerLeadId).single();
      if (existing.error) throw existing.error;
      if (existing.data.status === 'processed') return json(200, { received: true, status: 'duplicate' });
      let claim = client.from('private_property_webhook_events').update({ status: 'received', error_message: null, updated_at: timestamp })
        .eq('id', existing.data.id).eq('status', existing.data.status);
      if (existing.data.status !== 'failed') claim = claim.lt('updated_at', new Date(now().getTime() - 5 * 60 * 1000).toISOString());
      const claimed = await claim.select('id,status').maybeSingle();
      if (claimed.error) throw claimed.error;
      if (!claimed.data) return json(503, { error: 'lead_processing_in_progress' });
      event = claimed.data;
    } else if (eventResult.error) throw eventResult.error;
    try {
      // Use every documented reference, scope to the verified agency's branches,
      // and refuse to guess when multiple local listings match.
      const references = [...new Set([payload.listingId, payload.listingReference, payload.listingExternalReference].map(text).filter(Boolean))];
      const listingIds = new Set<string>();
      for (const column of ['property_id', 'private_property_ref']) {
        if (!references.length) break;
        const syncs = await client.from('private_property_listing_syncs').select('private_listing_id')
          .eq('environment', 'production').in('branch_guid', candidates.map((row: Json) => row.branch_guid)).in(column, references);
        if (syncs.error) throw syncs.error;
        for (const row of syncs.data || []) listingIds.add(row.private_listing_id);
      }
      if (listingIds.size > 1) throw new Error('Private Property references match more than one local listing.');
      const ingested = await client.rpc('private_property_ingest_lead', {
        p_organisation_id: config.organisation_id, p_external_reference: `PP:${providerLeadId}`,
        p_name: text(payload.leadName), p_email: text(payload.leadEmail), p_phone: text(payload.leadPhoneNumber || payload.leadPhone),
        p_message: text(payload.leadMessage), p_listing_id: [...listingIds][0] || null, p_raw_payload: payload,
      });
      if (ingested.error) throw ingested.error;
      const marked = await client.from('private_property_webhook_events').update({ status: 'processed', lead_id: ingested.data,
        processed_at: timestamp, updated_at: timestamp }).eq('id', event.id);
      if (marked.error) throw marked.error;
      return json(200, { received: true, status: 'processed' });
    } catch (error) {
      await client.from('private_property_webhook_events').update({ status: 'failed',
        error_message: error instanceof Error ? error.message : 'Lead processing failed.', updated_at: timestamp }).eq('id', event.id);
      return json(500, { error: 'lead_processing_failed' });
    }
  } catch {
    // Never return supplier credentials, signing keys, or raw contact data.
    return json(500, { error: 'webhook_processing_failed' });
  }
}
