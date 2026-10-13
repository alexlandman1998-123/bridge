import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import fs from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'
import { PGlite } from '@electric-sql/pglite'

// Real review commands, triggers, outbox claims and email rendering. Only the
// sender, branding lookup and recipient-control infrastructure are synthetic.
const read = (path) => fs.readFile(new URL(path, import.meta.url), 'utf8')
const db = new PGlite()
const sql = async (query, values = []) => (await db.query(query, values)).rows
const actor = randomUUID(), organisation = randomUUID()
const automation = 'client_portal_document_rejected'
const migration = await read('../../supabase/migrations/20261013145642_seller_document_rejection_email.sql')
const legacy = await read('../../supabase/migrations/202608030004_client_seller_offer_portal_notifications.sql')
function functionSql(source, name) {
  const start = source.search(new RegExp(`create(?: or replace)? function public\\.${name}\\(`))
  const end = source.indexOf('\n$$;', start)
  assert.ok(start >= 0 && end > start, name)
  return source.slice(start, end + 4)
}

await db.exec(await read('./fixtures/seller-document-journey.sql'))
await db.exec(`
  create table profiles(id uuid primary key, email text, full_name text);
  alter table private_listing_seller_onboarding add column created_at timestamptz default now(), add column seller_portal_token text;
  alter table client_portal_contexts add column client_name text, add column seller_workspace_token text;
  alter table notification_events
    add column recipient_user_id uuid, add column transaction_id uuid, add column offer_id uuid,
    add column recipient_address text, add column provider text, add column idempotency_key text,
    add column next_dispatch_attempt_at timestamptz, add column created_at timestamptz default now(),
    add column dispatch_attempt_count integer default 0, add column max_dispatch_attempts integer default 5,
    add column last_dispatch_attempt_at timestamptz, add column last_dispatch_error text,
    add column provider_message_id text, add column communication_delivery_id uuid,
    add column sent_at timestamptz, add column failed_at timestamptz, add column error_message text;
  create unique index outbox_dedupe on notification_events(organisation_id,dedupe_key);
  create table private_listing_seller_portal_signing_documents(
    id uuid primary key, private_listing_id uuid, document_key text, status text,
    version_id uuid, version_digest text, source_version_digest text,
    signed_document_id uuid, revoked_at timestamptz, revoke_reason text,
    reviewed_html text, required_signers jsonb
  );
  create table private_listing_seller_portal_signature_evidence(id uuid primary key, signing_document_id uuid, signature_value text);
`)
await sql('insert into auth.users values($1)', [actor])
await sql('insert into organisations values($1)', [organisation])
await sql("insert into profiles values($1,'agent@example.test','Agent One')", [actor])
await sql("select set_config('app.uid',$1,false),set_config('app.org',$2,false)", [actor, organisation])
await db.exec(await read('../../supabase/migrations/20261004121736_seller_document_review_runtime_reconciliation.sql'))
await db.exec(await read('../../supabase/migrations/20261012150343_seller_document_review_portal_listing_text_id.sql'))
await db.exec(functionSql(await read('../../supabase/migrations/202607140004_client_portal_phase1_access_stability.sql'), 'bridge_private_listing_seller_portal_link_is_active'))
for (const name of ['bridge_client_seller_phase5_profile_contact', 'bridge_client_seller_phase5_listing_label', 'bridge_queue_client_seller_portal_event_phase5', 'bridge_claim_client_seller_portal_notifications_phase5', 'bridge_handle_private_listing_document_notifications_phase5']) {
  await db.exec(functionSql(legacy, name))
}
await db.exec(`create trigger portal_document_notifications after insert or update on private_listing_documents
  for each row execute function bridge_handle_private_listing_document_notifications_phase5();`)
await sql("insert into notification_automation_definitions(automation_key,implementation_status,default_enabled) values($1,'active',true)", [automation])
await db.exec(await read('../../supabase/migrations/20261013114906_seller_portal_signed_document_rejection.sql'))
await db.exec(migration)

const originalDeno = globalThis.Deno, originalFetch = globalThis.fetch
const sent = [], deliveries = []
let providerFails = false
globalThis.Deno = { env: { get: (key) => ({ SUPABASE_URL: 'https://synthetic.example.test', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', RESEND_API_KEY: 'synthetic-email', PUBLIC_APP_URL: 'https://app.example.test' })[key] } }
globalThis.fetch = () => { throw new Error('Remote calls are forbidden in this test') }
const emailClient = {
  async rpc(name, values) {
    assert.equal(name, 'bridge_claim_client_seller_portal_notifications_phase5')
    return { data: await sql('select * from bridge_claim_client_seller_portal_notifications_phase5($1,$2,$3)', [values.p_transaction_id, values.p_event_id, values.p_limit]), error: null }
  },
  from(table) {
    assert.ok(['notification_events', 'communication_deliveries'].includes(table), table)
    let patch, rowId
    const query = {
      update(value) { patch = value; return query },
      eq(column, value) { assert.equal(column, 'id'); rowId = value; return query },
      insert(value) { assert.equal(table, 'communication_deliveries'); deliveries.push(value); return query },
      select() { return query },
      async single() { return { data: { id: randomUUID() }, error: null } },
      async then(resolve) {
        const keys = Object.keys(patch)
        keys.forEach((key) => assert.match(key, /^[a-z_]+$/))
        await sql(`update notification_events set ${keys.map((key, index) => `${key}=$${index + 1}`).join(',')} where id=$${keys.length + 1}`, [...keys.map((key) => patch[key]), rowId])
        return resolve({ error: null })
      },
    }
    return query
  },
}
globalThis.__sellerRejectionEmailClient = emailClient
globalThis.__sellerRejectionSend = async (options) => {
  sent.push(options)
  return providerFails ? { ok: false, error: { message: 'Synthetic provider failure' } } : { ok: true, data: { id: `synthetic-${sent.length}` } }
}
const bundle = await build({
  entryPoints: [new URL('../../supabase/functions/send-email/handlers/clientSellerPortalNotification.ts', import.meta.url).pathname],
  bundle: true, platform: 'node', format: 'esm', write: false,
  plugins: [{ name: 'synthetic-email-boundaries', setup(builder) {
    builder.onResolve({ filter: /^supabase$/ }, () => ({ path: 'supabase', namespace: 'synthetic' }))
    builder.onResolve({ filter: /\/services\/(emailBranding|resend|notificationControls)\.ts$/ }, (args) => {
      // The shared layout still uses the real branding normalization functions.
      if (args.path.includes('emailBranding') && !args.importer.endsWith('/handlers/clientSellerPortalNotification.ts')) return undefined
      return { path: args.path, namespace: 'synthetic' }
    })
    builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, (args) => ({ loader: 'js', contents:
      args.path === 'supabase' ? 'export const createClient=()=>globalThis.__sellerRejectionEmailClient'
        : args.path.includes('resend') ? 'export const sendViaResendApi=options=>globalThis.__sellerRejectionSend(options)'
          : args.path.includes('notificationControls') ? 'export async function applyNotificationQueueControls() {}'
            : "export async function resolveEmailBranding(){return {organisationName:'Synthetic Agency',primaryColor:'#123abc'}};export async function resolveAudienceEmailSender(){return 'Agency <agency@example.test>'};export const isClientEmailRecipientRole=role=>role==='seller'",
    }))
  } }],
})
const emailHandler = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const request = () => new Request('https://functions.example.test/send-email', { headers: { authorization: 'Bearer synthetic-service' } })
const sendEvent = async (eventId) => {
  const response = await emailHandler.handleClientSellerPortalNotificationEmail(request(), { type: 'client_seller_portal_dispatch', queueDue: false, eventId })
  assert.equal(response.status, 200)
  return response.json()
}
async function seed({ signed = false, email = 'seller@example.test', active = true } = {}) {
  const listing = randomUUID(), requirement = randomUUID(), document = randomUUID()
  await sql('insert into private_listings(id,organisation_id,assigned_agent_id,created_by,address_line_1) values($1,$2,$3,$3,\'24 Oak Avenue\')', [listing, organisation, actor])
  await sql("insert into private_listing_seller_onboarding(private_listing_id,token,seller_portal_token,seller_portal_link_active,form_data) values($1,'legacy-token','current-portal-token',$2,$3)", [listing, active, JSON.stringify({ sellerName: 'Seller One', email: '', sellerEmail: email })])
  if (signed) {
    await sql("insert into private_listing_seller_portal_signing_documents(id,private_listing_id,document_key,status,version_id,version_digest,source_version_digest,reviewed_html,required_signers) values($1,$2,'signed_fica_declaration','signed',$3,'current-digest','source-digest','FROZEN SIGNED COPY',$4)", [document, listing, randomUUID(), JSON.stringify([{ name: 'Seller One', email: 'seller@example.test' }])])
    await sql('insert into private_listing_seller_portal_signature_evidence values($1,$2,\'IMMUTABLE SIGNATURE\')', [randomUUID(), document])
  } else {
    await sql("insert into private_listing_document_requirements(id,private_listing_id,requirement_key,requirement_name,status) values($1,$2,'identity_document','Seller ID','required')", [requirement, listing])
    await sql("insert into private_listing_documents(id,private_listing_id,requirement_id,document_type,document_name,status,storage_path) values($1,$2,$3,'identity_document','Seller ID','uploaded','synthetic/id.pdf')", [document, listing, requirement])
  }
  return { listing, requirement, document, signed }
}
async function reject(row, reason = 'The identity page is cropped.') {
  const command = row.signed
    ? 'select bridge_reject_seller_portal_signed_document($1,\'current-digest\',$2,$3) as result'
    : 'select bridge_review_private_listing_seller_document_p1_8($1,\'reject\',$2,0) as result'
  return (await sql(command, row.signed ? [row.document, reason, actor] : [row.document, reason]))[0].result
}
const events = (listing) => sql('select * from notification_events where listing_id=$1 and automation_key=$2', [listing, automation])

test('uploaded-file rejection reaches the existing email dispatcher with its saved reason and current seller portal link', async () => {
  const row = await seed()
  const reason = 'The ID page is cropped. <script>unsafe()</script>'
  await reject(row, reason)
  const [event] = await events(row.listing)
  assert.equal(event.recipient_email, 'seller@example.test')
  assert.equal(event.payload_json.reason, reason)
  assert.equal(event.payload_json.sellerPortalToken, 'current-portal-token')
  assert.equal(event.payload_json.documentSource, 'uploaded')
  assert.equal((await sendEvent(event.id)).sent, 1)
  const mail = sent.at(-1)
  assert.equal(mail.to, 'seller@example.test')
  assert.equal(mail.subject, 'Document rejected: Seller ID')
  assert.ok(mail.text.includes(reason))
  assert.ok(mail.text.includes('https://app.example.test/client/current-portal-token/selling'))
  assert.ok(!mail.html.includes('<script>'))
  assert.ok(!mail.text.includes('/private-listings/'))
  assert.equal((await sendEvent(event.id)).sent, 0)
  await assert.rejects(reject(row, reason), (error) => error.code === '40001')
  assert.equal((await events(row.listing)).length, 1)
})

test('online-signed rejection queues the same email while preserving the signed copy and signature history', async () => {
  const row = await seed({ signed: true })
  const [before] = await sql('select * from private_listing_seller_portal_signing_documents where id=$1', [row.document])
  const evidence = await sql('select * from private_listing_seller_portal_signature_evidence where signing_document_id=$1', [row.document])
  const result = await reject(row)
  const [event] = await events(row.listing)
  assert.equal(result.notificationEventId, event.id)
  assert.equal(result.notificationQueued, true)
  assert.equal(event.payload_json.documentTitle, 'Seller FICA Declaration')
  assert.equal(event.payload_json.documentSource, 'online_signed')
  assert.match(event.payload_json.nextAction, /agent will prepare a corrected copy for signature/)
  const [after] = await sql('select * from private_listing_seller_portal_signing_documents where id=$1', [row.document])
  assert.deepEqual({ ...after, status: before.status, revoked_at: before.revoked_at, revoke_reason: before.revoke_reason }, before)
  assert.deepEqual(await sql('select * from private_listing_seller_portal_signature_evidence where signing_document_id=$1', [row.document]), evidence)
  assert.equal((await sendEvent(event.id)).sent, 1)
  assert.ok(sent.at(-1).text.includes('Reason: The identity page is cropped.'))
  assert.equal((await sendEvent(event.id)).sent, 0)
  await assert.rejects(reject(row), (error) => error.code === '40001')
  assert.equal((await events(row.listing)).length, 1)
})

test('a failed send retries through the existing outbox using the same provider idempotency key', async () => {
  const row = await seed({ signed: true })
  await reject(row)
  const [event] = await events(row.listing)
  providerFails = true
  try { assert.equal((await sendEvent(event.id)).failed, 1) } finally { providerFails = false }
  const firstKey = sent.at(-1).idempotencyKey
  assert.equal((await events(row.listing))[0].status, 'failed')
  await sql('update notification_events set next_dispatch_attempt_at=now() where id=$1', [event.id])
  assert.equal((await sendEvent(event.id)).sent, 1)
  assert.equal(sent.at(-1).idempotencyKey, firstKey)
  assert.equal((await events(row.listing))[0].dispatch_attempt_count, 2)
})

test('queue failures roll back rejection and its activity for both document routes', async () => {
  await db.exec(`create function fail_rejection_queue() returns trigger language plpgsql as $$ begin
    if new.automation_key='client_portal_document_rejected' then raise exception 'Synthetic queue failure'; end if; return new; end; $$;
    create trigger fail_rejection_queue before insert on notification_events for each row execute function fail_rejection_queue();`)
  try {
    for (const signed of [false, true]) {
      const row = await seed({ signed })
      await assert.rejects(reject(row), /Synthetic queue failure/)
      const table = signed ? 'private_listing_seller_portal_signing_documents' : 'private_listing_documents'
      assert.equal((await sql(`select status from ${table} where id=$1`, [row.document]))[0].status, signed ? 'signed' : 'uploaded')
      assert.equal((await events(row.listing)).length, 0)
      assert.equal((await sql('select count(*)::int as count from private_listing_activity where private_listing_id=$1', [row.listing]))[0].count, 0)
    }
  } finally { await db.exec('drop trigger fail_rejection_queue on notification_events; drop function fail_rejection_queue();') }
})

test('recipient and portal lookup remain within this listing and omit inactive or absent entry links', async () => {
  const noEmail = await seed({ signed: true, email: '' })
  await sql("insert into client_portal_contexts values($1,'different-listing','selling','active','other@example.test',now(),'Other Seller','wrong-token')", [randomUUID()])
  assert.equal((await reject(noEmail)).notificationQueued, false)
  assert.equal((await events(noEmail.listing)).length, 0)
  const fallback = await seed({ email: '' })
  await sql("insert into client_portal_contexts values($1,$2,'selling','active','portal-seller@example.test',now(),'Portal Seller','portal-token')", [randomUUID(), fallback.listing])
  await reject(fallback)
  assert.equal((await events(fallback.listing))[0].recipient_email, 'portal-seller@example.test')
  const inactive = await seed({ active: false })
  await reject(inactive)
  const [event] = await events(inactive.listing)
  assert.equal(event.payload_json.sellerPortalToken, undefined)
  await sendEvent(event.id)
  assert.ok(!sent.at(-1).text.includes('/client/'))
  assert.ok(!sent.at(-1).text.includes('/private-listings/'))
  assert.match(sent.at(-1).text, /Contact your agent/)
})

test('reapplying the migration preserves existing events and signatures, with no historical sends or client RPC access', async () => {
  const before = await sql('select * from notification_events order by id')
  const evidence = await sql('select * from private_listing_seller_portal_signature_evidence order by id')
  await db.exec(migration)
  assert.deepEqual(await sql('select * from notification_events order by id'), before)
  assert.deepEqual(await sql('select * from private_listing_seller_portal_signature_evidence order by id'), evidence)
  for (const signature of ['private.bridge_queue_seller_document_rejection_email(uuid,uuid,text,text,boolean,integer)', 'public.bridge_reject_seller_portal_signed_document(uuid,text,text,uuid)']) {
    const [permissions] = await sql("select has_function_privilege('anon',$1,'EXECUTE') as anon, has_function_privilege('authenticated',$1,'EXECUTE') as authenticated, has_function_privilege('service_role',$1,'EXECUTE') as server, (select prosecdef from pg_proc where oid=$1::regprocedure) as definer", [signature])
    assert.deepEqual(permissions, { anon: false, authenticated: false, server: true, definer: false })
  }
})

test('notification preferences can disable rejection email without preventing the review decision', async () => {
  await sql('update notification_automation_definitions set default_enabled=false where automation_key=$1', [automation])
  try {
    const row = await seed({ signed: true })
    assert.equal((await reject(row)).notificationQueued, false)
    assert.equal((await events(row.listing)).length, 0)
  } finally { await sql('update notification_automation_definitions set default_enabled=true where automation_key=$1', [automation]) }
})

after(async () => {
  globalThis.Deno = originalDeno
  globalThis.fetch = originalFetch
  delete globalThis.__sellerRejectionEmailClient
  delete globalThis.__sellerRejectionSend
  await db.close()
})
