import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { buildTemplateMessage, normalizePhone, previewTemplate, templateFields, templateIdentity } from '../../supabase/functions/_shared/whatsappCampaign.js'
import { applyWhatsAppCampaignWebhook } from '../../supabase/functions/_shared/whatsappCampaignWebhook.js'
import { createCampaignHandler } from '../../supabase/functions/whatsapp-campaigns/handler.js'
const template = { id: '123', name: 'new_listing', status: 'APPROVED', category: 'MARKETING', language: 'en_US', components: [{ type: 'HEADER', format: 'IMAGE' }, { type: 'BODY', text: 'Hi {{1}}, view {{2}}.' }, { type: 'FOOTER', text: 'Reply STOP to opt out.' }, { type: 'BUTTONS', buttons: [{ type: 'PHONE_NUMBER', text: 'Call us', phone_number: '+27123456789' }, { type: 'URL', text: 'View property', url: 'https://example.com/listings/{{1}}' }] }] }
const values = { 'header.media': { text: 'https://example.com/home.jpg' }, 'body.1': { source: 'first_name' }, 'body.2': { text: 'our new home' }, 'button.1': { text: 'home-1' } }
const contact = { phone: '+27 82 123 4567', full_name: 'Alex Buyer' }
test('Meta payload preserves language, media, ordered parameters and zero-based button index', () => {
  assert.deepEqual(buildTemplateMessage(template, values, contact), { messaging_product: 'whatsapp', recipient_type: 'individual', to: '27821234567', type: 'template', template: { name: 'new_listing', language: { code: 'en_US' }, components: [{ type: 'header', parameters: [{ type: 'image', image: { link: 'https://example.com/home.jpg' } }] }, { type: 'body', parameters: [{ type: 'text', text: 'Alex' }, { type: 'text', text: 'our new home' }] }, { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: 'home-1' }] }] } })
  assert.equal(previewTemplate(template, values, contact), 'Hi Alex, view our new home.\n\nReply STOP to opt out.')
})
test('named parameters retain their exact names', () => {
  const t = { ...template, language: 'en', components: [{ type: 'BODY', text: 'Hello {{customer_name}}' }] }
  assert.deepEqual(buildTemplateMessage(t, { 'body.customer_name': { source: 'full_name' } }, contact).template.components[0].parameters, [{ type: 'text', text: 'Alex Buyer', parameter_name: 'customer_name' }])
})
test('blocks unapproved, unsupported, missing variables and unsafe media', () => {
  assert.throws(() => buildTemplateMessage({ ...template, status: 'PAUSED' }, values, contact), /approve/)
  assert.throws(() => buildTemplateMessage(template, { ...values, 'body.1': { text: '' } }, contact), /Body · 1/)
  assert.throws(() => buildTemplateMessage(template, { ...values, 'header.media': { text: 'http://127.0.0.1/a' } }, contact), /HTTPS/)
  assert.throws(() => buildTemplateMessage(template, { ...values, 'body.1': { text: 'one\ntwo' } }, contact), /single line/)
  assert.ok(templateFields({ ...template, components: [{ type: 'CAROUSEL' }] }).unsupported.length)
  assert.ok(templateFields({ ...template, category: 'AUTHENTICATION' }).unsupported.length)
})
test('static templates and phone validation', () => {
  assert.equal(buildTemplateMessage({ ...template, components: [{ type: 'BODY', text: 'Hello there' }] }, {}, contact).template.components, undefined)
  assert.equal(normalizePhone('082 123 4567'), '27821234567')
  assert.equal(normalizePhone('+44 7700 900123'), '447700900123')
  for (const value of ['abc123', '+0001234567', '123', '0821234567ext2']) assert.equal(normalizePhone(value), '')
})
test('unauthenticated/inactive/foreign users cannot access data or Meta', async () => {
  let touched = false
  const handler = createCampaignHandler({ db: { from() { touched = true; throw Error('no') } }, authorize: async () => null, meta: async () => { touched = true } })
  for (const action of ['workspace', 'templates', 'save', 'save_contact', 'opt_out', 'preflight', 'prepare', 'dispatch', 'detail']) await assert.rejects(handler({ organisationId: '00000000-0000-0000-0000-000000000001', action }, ''), /active membership/)
  assert.equal(touched, false)
})
test('PostgreSQL tenant isolation, atomic prepare, claims, opt-outs and callback ordering', async () => {
  const db = new PGlite()
  const org = '00000000-0000-0000-0000-000000000001', other = '00000000-0000-0000-0000-000000000002', sender = '00000000-0000-0000-0000-000000000003', cid = '00000000-0000-0000-0000-000000000004', c1 = '00000000-0000-0000-0000-000000000005', c2 = '00000000-0000-0000-0000-000000000006'
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth; create table auth.users(id uuid primary key); create table organisations(id uuid primary key); create function bridge_is_active_member(target_org uuid) returns boolean language sql as $$select target_org = current_setting('test.org',true)::uuid$$; create table organisation_communication_channels(id uuid primary key, organisation_id uuid, connection_status text, channel_type text, provider text, phone_number_id text, waba_id text);`)
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260913134659_whatsapp_campaigns.sql', import.meta.url), 'utf8'))
    await db.exec(`insert into organisations values ('${org}'),('${other}'); insert into organisation_communication_channels values ('${sender}','${org}','connected','whatsapp','meta','100','200'); insert into whatsapp_marketing_contacts(id,organisation_id,full_name,phone,consent_status,consent_source,consent_at) values ('${c1}','${org}','Alex','27821234567','opted_in','Registration form',now()),('${c2}','${org}','Pat','27821234568','opted_in','Registration form',now()); insert into whatsapp_campaigns(id,organisation_id,name,sender_id,contact_ids) values ('${cid}','${org}','Test campaign','${sender}',array['${c1}','${c2}']::uuid[]);`)
    const msgs = [{ contact_id: c1, payload: { to: '27821234567' } }, { contact_id: c2, payload: { to: '27821234568' } }]
    const prepare = (rev, messages = msgs) => db.query('select whatsapp_campaign_prepare($1,$2,$3,$4,$5)', [cid, org, rev, JSON.stringify(template), JSON.stringify(messages)])
    await assert.rejects(prepare(2), /changed/)
    await assert.rejects(prepare(1, [msgs[0], { ...msgs[1], payload: { to: 'wrong' } }]), /phone changed/)
    assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_recipients')).rows[0].n, 0)
    await prepare(1); await prepare(1)
    assert.equal((await db.query('select count(*)::int n from whatsapp_campaign_recipients')).rows[0].n, 2)
    const recipients = (await db.query('select * from whatsapp_campaign_recipients order by phone')).rows
    const rid = recipients[0].id
    const claim = (id, organisation = org) => db.query('select * from whatsapp_campaign_claim($1,$2)', [id, organisation])
    assert.equal((await claim(rid, other)).rows.length, 0)
    assert.equal((await claim(rid)).rows.length, 1)
    assert.equal((await claim(rid)).rows.length, 0)
    await db.query("update whatsapp_marketing_contacts set consent_status='opted_out',opted_out_at=now() where id=$1", [c2])
    assert.equal((await claim(recipients[1].id)).rows.length, 0)
    assert.equal((await db.query('select status from whatsapp_campaign_recipients where id=$1', [recipients[1].id])).rows[0].status, 'skipped')
    const callback = (status, phone = '100', mid = 'wamid.test') => db.query('select whatsapp_campaign_status($1,$2,$3,$4,$5,now(),$6) ok', [mid, `arch9-wa:${rid}`, phone, '200', status, 'Example failure'])
    assert.equal((await callback('read', '999')).rows[0].ok, false)
    await callback('read'); await callback('sent'); await callback('delivered'); await callback('failed'); await callback('read')
    const delivered = (await db.query('select * from whatsapp_campaign_recipients where id=$1', [rid])).rows[0]
    assert.equal(delivered.status, 'read'); assert.ok(delivered.read_at); assert.ok(delivered.delivered_at); assert.equal(delivered.error_message, null)
    assert.equal((await callback('sent', '100', 'wamid.other')).rows[0].ok, false)
    const performance = (await db.query('select * from whatsapp_campaign_performance')).rows[0]
    assert.equal(performance.display_status, 'partial'); assert.equal(performance.delivered, 1); assert.equal(performance.read, 1); assert.equal(performance.skipped, 1)
    await db.exec(`set role authenticated; set test.org='${other}';`)
    assert.equal((await db.query('select * from whatsapp_campaign_performance')).rows.length, 0)
    assert.equal((await db.query('select * from whatsapp_marketing_contacts')).rows.length, 0)
    await assert.rejects(db.query("update whatsapp_campaigns set name='forged'"), /permission denied/)
    await assert.rejects(db.query('select whatsapp_campaign_claim($1,$2)', [rid, org]), /permission denied/)
    await db.exec(`set test.org='${org}';`)
    assert.equal((await db.query('select * from whatsapp_campaign_performance')).rows.length, 1)
  } finally { await db.close() }
})

test('Meta comparison survives JSONB key ordering', () => {
  const reorder = (value) => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).reverse().map(([k,v]) => [k,reorder(v)])) : value
  assert.equal(templateIdentity(template), templateIdentity(reorder(template)))
  assert.notEqual(templateIdentity(template), templateIdentity({ ...template, language: 'en' }))
})

// Small PostgREST adapter for exercising the real handler against isolated SQL.
// It implements only query operations used by the campaign handler in this test.
function sqlClient(db) {
  return {
    rpc: async (name, args) => {
      try { const names = Object.keys(args); const values = Object.values(args).map((v) => v && typeof v === 'object' ? JSON.stringify(v) : v); const rows = (await db.query(`select * from ${name}(${names.map((key, i) => `${key} => $${i + 1}`).join(',')})`, values)).rows; return { data: rows, error: null } } catch (error) { return { data: null, error } }
    },
    from: (table) => {
      let columns = '*', filters = [], values = [], mutation = null, mode = '', limit = '', offset = ''
      const bind = (v) => { values.push(v); return `$${values.length}` }
      const query = {
        select(c = '*') { columns = c; return query },
        eq(k, v) { filters.push(`${k} = ${bind(v)}`); return query },
        neq(k, v) { filters.push(`${k} <> ${bind(v)}`); return query },
        or(filter) { assert.ok(filter.startsWith('consent_at.is.null,consent_at.lte.')); filters.push(`(consent_at is null or consent_at <= ${bind(filter.split('.lte.')[1])})`); return query },
        in(k, vs) { filters.push(`${k} in (${vs.map(bind).join(',')})`); return query },
        order() { return query },
        limit(n) { limit = ` limit ${Number(n)}`; return query },
        range(a, b) { limit = ` limit ${b - a + 1}`; offset = ` offset ${a}`; return query },
        single() { mode = 'single'; return query },
        maybeSingle() { mode = 'maybe'; return query },
        update(patch) { mutation = Object.entries(patch).map(([k, v]) => `${k}=${bind(v)}`).join(','); return query },
        async then(resolve, reject) {
          try {
            const where = filters.length ? ` where ${filters.join(' and ')}` : ''
            const sql = mutation ? `update ${table} set ${mutation}${where} returning ${columns}` : `select ${columns} from ${table}${where}${limit}${offset}`
            const rows = (await db.query(sql, values)).rows
            if (mode === 'single' && rows.length !== 1) throw new Error('Expected one row')
            return resolve({ data: mode ? rows[0] || null : rows, error: null })
          } catch (error) { return resolve({ data: null, error }) }
        },
      }
      return query
    },
  }
}
test('real handler + PostgreSQL: preflight, concurrent dispatch, lost response, resume and paused templates', async () => {
  const db = new PGlite()
  const org = '00000000-0000-0000-0000-000000000011', sender = '00000000-0000-0000-0000-000000000012', cid = '00000000-0000-0000-0000-000000000013', c1 = '00000000-0000-0000-0000-000000000014', c2 = '00000000-0000-0000-0000-000000000015'
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth; create table auth.users(id uuid primary key); create table organisations(id uuid primary key); create function bridge_is_active_member(target_org uuid) returns boolean language sql as $$select true$$; create table organisation_communication_channels(id uuid primary key, organisation_id uuid, connection_status text, channel_type text, provider text, phone_number_id text, waba_id text, meta_access_token text);`)
    await db.exec(readFileSync(new URL('../../supabase/migrations/20260913134659_whatsapp_campaigns.sql', import.meta.url), 'utf8'))
    await db.exec(`insert into organisations values ('${org}'); insert into organisation_communication_channels values ('${sender}','${org}','connected','whatsapp','meta','100','200','test-token'); insert into whatsapp_marketing_contacts(id,organisation_id,full_name,phone,consent_status,consent_source,consent_at) values ('${c1}','${org}','Alex','27821234567','opted_in','Form',now()),('${c2}','${org}','Pat','27821234568','opted_in','Form',now());`)
    await db.query('insert into whatsapp_campaigns(id,organisation_id,name,sender_id,contact_ids,template,parameter_values) values ($1,$2,$3,$4,$5,$6,$7)', [cid, org, 'Live flow test', sender, [c1,c2], JSON.stringify(template), JSON.stringify(values)])
    let sent = [], paused = false
    const handler = createCampaignHandler({ db: sqlClient(db), authorize: async () => 'test-user', meta: async (_connection, path, payload) => {
      if (path.includes('message_templates')) return { data: [{ ...template, status: paused ? 'PAUSED' : 'APPROVED' }] }
      sent.push(payload)
      if (payload.to.endsWith('8')) throw Error('timeout after request')
      return { messages: [{ id: `wamid.${payload.to}` }] }
    } })
    const call = (action, extra = {}) => handler({ organisationId: org, campaignId: cid, action, ...extra }, 'Bearer test')
    await assert.rejects(call('preflight', { revision: 99 }), /draft changed/)
    assert.equal((await call('preflight', { revision: 1 })).recipients, 2)
    await call('prepare', { revision: 1 })
    await Promise.all([call('dispatch'), call('dispatch')])
    assert.equal(sent.length, 2)
    assert.ok(sent.every((p) => p.biz_opaque_callback_data.startsWith('arch9-wa:')))
    assert.deepEqual((await db.query('select status from whatsapp_campaign_recipients order by phone')).rows.map((r) => r.status), ['sent','unknown'])
    await call('dispatch')
    assert.equal(sent.length, 2, 'resume never retries a sent or uncertain recipient')
    assert.equal((await db.query('select display_status from whatsapp_campaign_performance')).rows[0].display_status, 'needs_attention')
    paused = true
    await assert.rejects(call('dispatch'), /no longer approved/)
    assert.equal(sent.length, 2)
    const timestamp = Math.floor(Date.now() / 1000) + 5
    const stop = { entry: [{ id: '200', changes: [{ value: { metadata: { phone_number_id: '100' }, messages: [{ from: '27821234567', text: { body: 'STOP' }, timestamp: String(timestamp) }] } }] }] }
    await applyWhatsAppCampaignWebhook(sqlClient(db), stop)
    assert.equal((await db.query('select consent_status from whatsapp_marketing_contacts where id=$1', [c1])).rows[0].consent_status, 'opted_out')
    await applyWhatsAppCampaignWebhook(sqlClient(db), stop)
    await db.query("update whatsapp_marketing_contacts set consent_status='opted_in',opted_out_at=null,consent_at=$1 where id=$2", [new Date((timestamp + 60) * 1000).toISOString(), c1])
    await applyWhatsAppCampaignWebhook(sqlClient(db), stop)
    assert.equal((await db.query('select consent_status from whatsapp_marketing_contacts where id=$1', [c1])).rows[0].consent_status, 'opted_in', 'an old STOP retry cannot undo a later, explicit opt-in')
  } finally { await db.close() }
})
