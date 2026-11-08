import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { parseWhatsAppChatExport as parse, prepareWhatsAppChatImport as prepare } from '../../supabase/functions/_shared/whatsappChatExport.js'
import { handleChatImport } from '../../supabase/functions/meta-integrations/chatImport.js'
const hash = async value => createHash('sha256').update(value).digest('hex')
const exportText = '[03/10/2026, 14:02:11] Samlin: Hello\n[03/10/2026, 14:03:15] Customer: Thanks\nsecond line'
test('iPhone and Android exports retain dates, directions, Unicode and multiline text', () => {
  const data = prepare(exportText, { businessAuthor: 'Samlin' })
  assert.equal(data.messages[0].at, '2026-10-03T12:02:11.000Z')
  assert.equal(data.messages[1].body, 'Thanks\nsecond line')
  assert.deepEqual(data.messages.map(row => row.direction), ['outbound', 'inbound'])
  const android = parse('10/03/26, 12:01 AM - Messages are encrypted\n10/03/26, 12:02 PM - José: Hi 👋', { dateOrder: 'MDY', utcOffset: '-04:00' })
  assert.equal(android.messages[0].at, '2026-10-03T16:02:00.000Z'); assert.equal(android.skipped, 1)
  assert.equal(parse('[2026-10-03, 14:00] A: <Media omitted>').messages[0].body, '[Attachment not imported] <Media omitted>')
})
test('unmodified export validation rejects groups, invalid dates, oversized exports and missing business identity', () => {
  assert.throws(() => prepare(exportText), /participant/)
  assert.throws(() => parse('[31/02/2026, 14:00] A: Invalid'), /date/)
  assert.throws(() => parse('x'.repeat(1024 * 1024 + 1)), /1 MB/)
  assert.throws(() => parse('[03/10/2026, 14:00] A: A\n[03/10/2026, 14:00] B: B\n[03/10/2026, 14:00] C: C'), /Group/)
  assert.throws(() => parse(Array.from({ length: 501 }, () => '[03/10/2026, 14:00] A: A').join('\n')), /500/)
  assert.deepEqual(prepare('[03/10/2026, 14:00] A: Hi\n[03/10/2026, 14:00] A: Hi', { businessAuthor: 'A' }).messages.map(row => row.occurrence), [1, 2])
})
test('server parses original source and blocks non-admins before database access', async () => {
  let args
  const db = { rpc: async (name, payload) => { assert.equal(name, 'whatsapp_manual_chat_import'); args = payload; return { data: { imported: 2 } } } }
  await assert.rejects(handleChatImport({ db, actor: { isAdmin: false }, payload: {} }), /administrator/)
  const result = await handleChatImport({ db, actor: { isAdmin: true, userId: 'actor' }, org: 'org', payload: { senderId: 'sender', contactPhone: '+27 82 123 4567', source: exportText, businessAuthor: 'Samlin', dateOrder: 'DMY', utcOffset: '+02:00', messages: [{ body: 'UNTRUSTED' }] }, hash })
  assert.equal(result.imported, 2); assert.equal(args.p_org, 'org'); assert.equal(args.p_contact, '27821234567'); assert.equal(args.p_messages[0].body, 'Hello')
})

const id = value => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
test('real SQL preserves historical semantics, isolates organisations, rolls back failures and reconciles provider overlap', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table organisations(id uuid primary key);
      create table organisation_users(organisation_id uuid,user_id uuid,role text,status text);
      create table organisation_communication_channels(id uuid primary key,organisation_id uuid,provider text,channel_type text,connection_status text,onboarding_mode text,display_phone_number text,phone_number_id text,waba_id text,business_app_connected_at timestamptz,unique(id,organisation_id));
      create table whatsapp_business_app_contacts(channel_id uuid,phone text,name text,removed boolean);
      create table whatsapp_inbox_conversations(id uuid primary key default gen_random_uuid(),organisation_id uuid,channel_id uuid,contact_phone text,contact_name text,contact_name_source text,status text default 'closed',unread_count int default 0,last_inbound_at timestamptz,last_message_preview text,last_message_at timestamptz,content_version int default 0,updated_at timestamptz,unique(channel_id,contact_phone));
      create table whatsapp_inbox_messages(id uuid primary key default gen_random_uuid(),organisation_id uuid,conversation_id uuid,channel_id uuid,provider_message_id text,direction text,message_type text,body_text text,media_json jsonb default '{}',delivery_status text,event_at timestamptz,message_origin text,live_received boolean,revoked_at timestamptz,edited_at timestamptz,updated_at timestamptz,unique(channel_id,provider_message_id));
      create function whatsapp_business_app_apply_mutation(uuid,text) returns void language sql as 'select';`)
    const ownership = readFileSync(new URL('../../supabase/migrations/20261018094503_whatsapp_inbox_agent_ownership.sql', import.meta.url), 'utf8')
    const sync = readFileSync(new URL('../../supabase/migrations/20261018125856_whatsapp_business_app_sync.sql', import.meta.url), 'utf8')
    await db.exec(ownership.slice(ownership.indexOf('create function public.whatsapp_staff_is_admin'), ownership.indexOf('-- Existing agency senders')))
    await db.exec(sync.slice(sync.indexOf('create function public.whatsapp_business_app_ingest('), sync.indexOf('create or replace function public.whatsapp_inbox_receive(')))
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261103174756_whatsapp_manual_chat_import.sql', import.meta.url), 'utf8'))
    await db.query('insert into organisations values($1),($2)', [id(1), id(2)])
    await db.query("insert into organisation_users values($1,$2,'admin','active'),($1,$3,'agent','active')", [id(1), id(3), id(4)])
    await db.query("insert into organisation_communication_channels values($1,$2,'meta','whatsapp','connected','coexistence','+27 68 643 9449','phone','waba',now())", [id(5), id(1)])
    const messages = [1, 2].map(n => ({ at: '2026-10-03T12:00:00Z', body: 'Hello', direction: 'inbound', precision: 'minute', occurrence: n, key: String(n).repeat(64) }))
    const options = { businessAuthor: 'Samlin', dateOrder: 'DMY', utcOffset: '+02:00' }
    const call = async (org = id(1), actor = id(3), rows = messages, fingerprint = 'a'.repeat(64), opts = options) => (await db.query('select whatsapp_manual_chat_import($1,$2,$3,$4,$5,$6,$7,$8) result', [org, actor, id(5), '27821234567', 'Customer', fingerprint, JSON.stringify(opts), JSON.stringify(rows)])).rows[0].result
    await assert.rejects(call(id(2)), /membership/)
    await assert.rejects(call(id(1), id(4)), /administrator/)
    await assert.rejects(call(id(1), id(3), [...messages, { ...messages[0], at: '2099-01-01' }]), /Invalid exported/)
    assert.equal((await db.query('select count(*) n from whatsapp_inbox_messages')).rows[0].n, 0)
    assert.equal((await call()).imported, 2)
    const thread = (await db.query('select * from whatsapp_inbox_conversations')).rows[0]
    assert.equal(thread.last_inbound_at, null); assert.equal(thread.unread_count, 0); assert.equal(thread.status, 'closed')
    assert.equal((await call()).duplicates, 2)
    assert.equal((await call(id(1), id(3), messages, 'b'.repeat(64))).imported, 0)
    await assert.rejects(call(id(1), id(3), messages, 'a'.repeat(64), { ...options, businessAuthor: 'Customer' }), /different/)
    for (const nativeId of ['native-one', 'native-two']) { await db.query("select whatsapp_business_app_ingest('phone','waba','27821234567',$1,'2026-10-03T12:00:21Z','inbound','text','Hello','{}','Customer','history','sent')", [nativeId]); assert.equal((await call(id(1), id(3), messages, (nativeId === 'native-one' ? 'd' : 'e').repeat(64))).imported, 0) }
    const rows = (await db.query('select * from whatsapp_inbox_messages')).rows
    assert.equal(rows.length, 2); assert.ok(rows.every(row => row.provider_message_id.startsWith('native-')))
    assert.equal((await call(id(1), id(3), messages, 'c'.repeat(64))).imported, 0)
    assert.equal((await db.query("select has_function_privilege('authenticated','whatsapp_manual_chat_import(uuid,uuid,uuid,text,text,text,jsonb,jsonb)','execute') allowed")).rows[0].allowed, false)
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select * from whatsapp_manual_chat_imports'), /permission denied/)
  } finally { await db.close() }
})
