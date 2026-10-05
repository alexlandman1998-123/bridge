import { handlePrivatePropertyLeadWebhook, validPrivatePropertySignature } from './privatePropertyLeadWebhook.ts';
const assert = (condition: unknown, message = 'assertion failed') => { if (!condition) throw new Error(message); };
const equal = (actual: unknown, expected: unknown) => assert(JSON.stringify(actual) === JSON.stringify(expected), `${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
const encoder = new TextEncoder();
const lead = { messageType: 'Lead', messageVersion: 1, agencyId: 100, leadId: 123, listingId: 999,
  listingReference: 'T999', listingExternalReference: 'RLS999', listingType: 'Rental', leadName: 'Test Enquirer',
  leadEmail: 'fixture@example.test', leadMessage: 'Enquiry: café 🏡', leadDateTime: '2026-10-05T08:00:00+02:00' };
async function signature(raw: string, secret = 'secret-one') {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(raw)));
}
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
async function request(payload = lead, secret = 'secret-one', signatureOverride?: string) {
  const raw = JSON.stringify(payload);
  return new Request('https://fixture.test/webhook', { method: 'POST', body: raw, headers: {
    'content-type': 'application/json', 'x-signature': signatureOverride ?? hex(await signature(raw, secret)),
  } });
}
function database() {
  const events: any[] = [];
  const writes: any[] = [];
  const ingestion: any[] = [];
  let failNext = false;
  const configs = [
    { id: 'config-one', organisation_id: 'one', branch_guid: 'branch-one', environment: 'production', enabled: true, status: 'approved', go_live_approved_at: '2026-01-01', webhook_secret_id: 'vault-one', metadata_json: { private_property_agency_id: '100' } },
    { id: 'config-two', organisation_id: 'two', branch_guid: 'branch-two', environment: 'production', enabled: true, status: 'active', go_live_approved_at: '2026-01-01', webhook_secret_id: 'vault-two', metadata_json: { private_property_agency_id: '200' } },
  ];
  const tables: Record<string, any[]> = { private_property_agency_configs: configs, private_property_webhook_events: events,
    private_property_listing_syncs: [{ environment: 'production', branch_guid: 'branch-one', property_id: 'different', private_property_ref: 'T999', private_listing_id: 'listing-one' }] };
  return {
    events, writes, ingestion, configs,
    failNext: () => { failNext = true; },
    from(table: string) {
      const filters: ((row: any) => boolean)[] = []; let operation = 'select'; let payload: any;
      const value = (row: any, key: string) => key.includes('->>') ? row[key.split('->>')[0]]?.[key.split('->>')[1]] : row[key];
      const execute = (single = false) => {
        const rows = tables[table] || []; let selected = rows.filter((row) => filters.every((filter) => filter(row)));
        if (operation === 'insert') {
          if (events.some((row) => row.organisation_id === payload.organisation_id && row.provider_lead_id === payload.provider_lead_id)) return { data: null, error: { code: '23505' } };
          const row = { id: 'event-' + (events.length + 1), status: 'received', ...payload }; rows.push(row); selected = [row]; writes.push(payload);
        } else if (operation === 'update') { for (const row of selected) Object.assign(row, payload); writes.push(payload); }
        return { data: single ? selected[0] || null : selected, error: null };
      };
      const q: any = { select: () => q, eq: (key: string, expected: unknown) => { filters.push((r) => value(r, key) === expected); return q; },
        in: (key: string, values: unknown[]) => { filters.push((r) => values.includes(value(r, key))); return q; },
        lt: (key: string, expected: string) => { filters.push((r) => r[key] < expected); return q; },
        insert: (p: any) => { operation = 'insert'; payload = p; return q; }, update: (p: any) => { operation = 'update'; payload = p; return q; },
        single: async () => execute(true), maybeSingle: async () => execute(true), then: (resolve: any, reject: any) => Promise.resolve(execute()).then(resolve, reject) };
      return q;
    },
    async rpc(name: string, args: any) {
      if (name === 'get_private_property_webhook_secret') return { data: args.p_config_id === 'config-one' ? 'secret-one' : 'secret-two', error: null };
      if (failNext) { failNext = false; return { error: { message: 'temporary fixture database failure' } }; }
      ingestion.push(args); return { data: 'lead-' + args.p_organisation_id, error: null };
    },
  };
}
Deno.test('PP verifies the exact raw bytes and supported signature encodings', async () => {
  const raw = JSON.stringify(lead); const bytes = await signature(raw);
  assert(await validPrivatePropertySignature(encoder.encode(raw), hex(bytes), 'secret-one'));
  assert(await validPrivatePropertySignature(encoder.encode(raw), 'sha256=' + hex(bytes).toUpperCase(), 'secret-one'));
  assert(await validPrivatePropertySignature(encoder.encode(raw), btoa(String.fromCharCode(...bytes)), 'secret-one'));
  assert(!await validPrivatePropertySignature(encoder.encode(raw + ' '), hex(bytes), 'secret-one'));
  assert(!await validPrivatePropertySignature(encoder.encode(raw), hex(bytes), 'wrong-secret'));
});
Deno.test('PP routes all configured agencies with their own secrets and all documented listing references', async () => {
  const client = database();
  const first = await handlePrivatePropertyLeadWebhook(await request(), { client }); equal(first.status, 200);
  equal(client.ingestion[0].p_organisation_id, 'one'); equal(client.ingestion[0].p_listing_id, 'listing-one');
  equal(client.ingestion[0].p_raw_payload.listingType, 'Rental'); equal(client.events[0].status, 'processed');
  const second = await handlePrivatePropertyLeadWebhook(await request({ ...lead, agencyId: 200 }, 'secret-two'), { client });
  equal(second.status, 200); equal(client.ingestion[1].p_organisation_id, 'two'); equal(client.ingestion[1].p_listing_id, null);
  const bad = await handlePrivatePropertyLeadWebhook(await request({ ...lead, agencyId: 200, leadId: 124 }), { client });
  equal(bad.status, 401); equal(client.events.length, 2);
});
Deno.test('PP retries a failed event rather than discarding it as a duplicate', async () => {
  const client = database(); client.failNext();
  equal((await handlePrivatePropertyLeadWebhook(await request(), { client })).status, 500); equal(client.events[0].status, 'failed');
  equal((await handlePrivatePropertyLeadWebhook(await request(), { client })).status, 200); equal(client.events[0].status, 'processed');
  const duplicate = await handlePrivatePropertyLeadWebhook(await request(), { client }); equal(duplicate.status, 200);
  equal((await duplicate.json()).status, 'duplicate'); equal(client.ingestion.length, 1);
});
Deno.test('PP concurrent and abandoned deliveries have distinct retry outcomes', async () => {
  const client = database(); client.events.push({ id: 'pending', organisation_id: 'one', provider_lead_id: '123', status: 'received', updated_at: '2026-10-05T06:00:00.000Z' });
  equal((await handlePrivatePropertyLeadWebhook(await request(), { client, now: () => new Date('2026-10-05T06:01:00Z') })).status, 503);
  equal(client.ingestion.length, 0);
  equal((await handlePrivatePropertyLeadWebhook(await request(), { client, now: () => new Date('2026-10-05T06:10:00Z') })).status, 200);
  equal(client.ingestion.length, 1);
});
Deno.test('PP rejects unknown and ambiguous agency ownership without writing leads', async () => {
  const client = database();
  equal((await handlePrivatePropertyLeadWebhook(await request({ ...lead, agencyId: 300 }), { client })).status, 404);
  client.configs.push({ ...client.configs[0], id: 'wrong', organisation_id: 'other' });
  equal((await handlePrivatePropertyLeadWebhook(await request(), { client })).status, 409); equal(client.events.length, 0);
});
Deno.test('PP rejects malformed, unsigned, oversized and contactless payloads', async () => {
  const client = database();
  equal((await handlePrivatePropertyLeadWebhook(new Request('https://fixture.test'), { client })).status, 405);
  equal((await handlePrivatePropertyLeadWebhook(new Request('https://fixture.test', { method: 'POST', body: '[]' }), { client })).status, 400);
  equal((await handlePrivatePropertyLeadWebhook(await request(lead, 'secret-one', ''), { client })).status, 401);
  equal((await handlePrivatePropertyLeadWebhook(await request({ ...lead, leadName: '', leadEmail: '' }), { client })).status, 400);
  equal((await handlePrivatePropertyLeadWebhook(new Request('https://fixture.test', { method: 'POST', body: 'x'.repeat(256 * 1024 + 1) }), { client })).status, 413);
  equal(client.events.length, 0);
});
