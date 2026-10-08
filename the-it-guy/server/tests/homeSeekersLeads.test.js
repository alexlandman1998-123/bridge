import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHomeSeekersLeadCaptureResponse } from '../services/homeSeekersLeadCaptureApi.js'
import { createHomeSeekersLeadDatabase, homeSeekersSqlConnection, HOME_SEEKERS_LEAD_FIXTURE as f } from './fixtures/homeSeekersLeadDatabase.js'
import { isRentalCrmLead } from '../../src/services/rentals/rentalCrmLeadModel.js'

const body = { type: 'general_enquiry', name: 'Fixture Visitor', email: 'visitor@example.test', privacyAccepted: true, idempotencyKey: 'fixture-enquiry-123456', pageUrl: `https://${f.host}/demo/homeseekers/contact` }
const headers = { host: f.host, 'x-forwarded-for': '198.51.100.1' }

test('Home Seekers enquiries create CRM leads atomically and queue scoped notifications', async (t) => {
  const db = await createHomeSeekersLeadDatabase()
  const previous = process.env.WEBSITES_LEAD_FINGERPRINT_SECRET
  process.env.WEBSITES_LEAD_FINGERPRINT_SECRET = 'fixture-secret'.repeat(5)
  const dispatched = []
  const capture = (change = {}, options = {}) => createHomeSeekersLeadCaptureResponse({ headers, body: { ...body, ...change }, getConnection: homeSeekersSqlConnection(db), dispatchNotification: async (id) => dispatched.push(id), ...options })
  try {
    await t.test('sales, rentals, valuations and general enquiries reach the right CRM record', async () => {
      for (const [type, intent, listingId, category, rental] of [
        ['general_enquiry', 'buy', null, 'buyer', false],
        ['general_enquiry', 'sell', null, 'seller', false],
        ['general_enquiry', 'rent', null, 'buyer', true],
        ['valuation_request', null, null, 'seller', false],
        ['property_enquiry', null, f.sale, 'buyer', false],
        ['property_enquiry', null, f.rental, 'buyer', true],
      ]) {
        const key = `${type}-${intent || listingId || 'valuation'}-1234567890`
        const result = await capture({ type, leadIntent: intent, listingId, idempotencyKey: key }, { headers: { ...headers, 'x-forwarded-for': `198.51.100.${dispatched.length + 10}` } })
        assert.equal(result.status, 201)
        assert.deepEqual(Object.keys(result.body).sort(), ['accepted', 'duplicate'])
        const receipt = (await db.query('select * from website_lead_submissions where idempotency_key=$1', [key])).rows[0]
        const lead = (await db.query('select * from leads where lead_id=$1', [receipt.lead_id])).rows[0]
        const contact = (await db.query('select * from contacts where contact_id=$1', [receipt.contact_id])).rows[0]
        const event = (await db.query('select * from notification_events where id=$1', [receipt.notification_event_id])).rows[0]
        assert.equal(receipt.status, 'routed')
        assert.equal(lead.organisation_id, f.org)
        assert.equal(lead.lead_category, category)
        assert.equal(lead.lead_source, 'Website')
        assert.equal(lead.enquired_listing_id, listingId)
        assert.equal(lead.assigned_agent_id, listingId ? f.agent : null)
        assert.equal(lead.ownership_status, listingId ? 'assigned' : 'awaiting_assignment')
        assert.equal(contact.email, body.email)
        assert.equal(isRentalCrmLead(lead), rental)
        if (rental) assert.equal(lead.raw_enquiry_payload.role, 'tenant')
        assert.equal(event.assigned_user_id, f.principal, 'keep the existing principal alert routing')
        assert.equal(event.status, 'queued', 'record the durable notification before dispatch')
        assert.equal(dispatched.at(-1), event.id)
        assert.equal((await db.query('select count(*)::int as count from transaction_notifications where event_data->>\'leadId\'=$1', [lead.lead_id])).rows[0].count, 1)
      }
      assert.equal((await db.query('select count(*)::int as count from contacts')).rows[0].count, 1, 'reuse the contact within this organisation')
    })
    await t.test('an unchanged retry creates one lead and an unaccepted duplicate never shows success', async () => {
      const first = await capture()
      assert.equal(first.status, 201)
      const count = (await db.query('select count(*)::int as count from leads')).rows[0].count
      assert.equal((await capture()).status, 202)
      assert.equal((await db.query('select count(*)::int as count from leads')).rows[0].count, count)
      await db.query('update website_lead_submissions set status=\'failed\' where idempotency_key=$1', [body.idempotencyKey])
      const retry = await capture()
      assert.equal(retry.status, 503)
      assert.equal(retry.body.accepted, undefined)
    })
    await t.test('notification delivery failure preserves the accepted lead and queue', async () => {
      const key = 'notification-failure-1234567890'
      assert.equal((await capture({ idempotencyKey: key }, { dispatchNotification: async () => { throw new Error('Fixture dispatcher offline') } })).status, 201)
      const receipt = (await db.query('select * from website_lead_submissions where idempotency_key=$1', [key])).rows[0]
      assert.equal(receipt.status, 'routed')
      assert.equal(receipt.notification_status, 'pending')
    })
    await t.test('durable claims prevent duplicate delivery and retain backoff after failure', async () => {
      const eventId = (await db.query('select notification_event_id from website_lead_submissions where idempotency_key=$1', ['notification-failure-1234567890'])).rows[0].notification_event_id
      const first = await db.query('select * from website_claim_lead_notifications(1,$1)', [eventId])
      assert.equal(first.rows.length, 1)
      assert.equal(first.rows[0].idempotency_key, first.rows[0].dedupe_key)
      assert.equal((await db.query('select * from website_claim_lead_notifications(1,$1)', [eventId])).rows.length, 0)
      const receiptId = (await db.query('select id from website_lead_submissions where notification_event_id=$1', [eventId])).rows[0].id
      const completion = (await db.query("select website_complete_lead_notification($1,$2,'failed',null,'Fixture unavailable') as result", [receiptId, eventId])).rows[0].result
      assert.equal(completion.retryScheduled, true)
      assert.equal((await db.query('select * from website_claim_lead_notifications(1,$1)', [eventId])).rows.length, 0, 'a retry waits for its due time')
    })
    await t.test('unpublished and foreign listings cannot create a lead or notification', async () => {
      const before = (await db.query('select count(*)::int as count from leads')).rows[0].count
      await db.query('update website_listing_publications set status=\'unpublished\' where listing_id=$1', [f.sale])
      assert.equal((await capture({ type: 'property_enquiry', listingId: f.sale, idempotencyKey: 'withdrawn-listing-123456' })).status, 404)
      await db.query('update website_listing_publications set status=\'published\' where listing_id=$1', [f.sale])
      await db.query('update private_listings set organisation_id=\'33333333-3333-4333-8333-333333333333\' where id=$1', [f.sale])
      assert.equal((await capture({ type: 'property_enquiry', listingId: f.sale, idempotencyKey: 'foreign-listing-123456789' })).status, 404)
      assert.equal((await db.query('select count(*)::int as count from leads')).rows[0].count, before)
    })
    await t.test('an inactive listing agent leaves the rental lead awaiting assignment', async () => {
      await db.query('update organisation_users set status=\'inactive\' where user_id=$1', [f.agent])
      const key = 'inactive-rental-agent-123456'
      const result = await capture({ type: 'property_enquiry', listingId: f.rental, idempotencyKey: key }, { headers: { ...headers, 'x-forwarded-for': '198.51.100.180' } })
      assert.equal(result.status, 201)
      const lead = (await db.query('select lead.* from leads lead join website_lead_submissions receipt on receipt.lead_id=lead.lead_id where receipt.idempotency_key=$1', [key])).rows[0]
      assert.equal(lead.assigned_agent_id, null)
      assert.equal(lead.ownership_status, 'awaiting_assignment')
      assert.equal(isRentalCrmLead(lead), true)
      await db.query('update organisation_users set status=\'active\' where user_id=$1', [f.agent])
    })
    await t.test('an unpublished enquiry page cannot record a lead', async () => {
      const before = (await db.query('select count(*)::int as count from leads')).rows[0].count
      await db.exec("delete from website_pages where page_kind='valuation'")
      assert.equal((await capture({ type: 'valuation_request', idempotencyKey: 'unpublished-valuation-123456' })).status, 404)
      assert.equal((await db.query('select count(*)::int as count from leads')).rows[0].count, before)
    })
    await t.test('rate limits return a rejection, including an unchanged blocked retry', async () => {
      for (let i = 0; i < 5; i++) assert.equal((await capture({ idempotencyKey: `rate-limit-enquiry-${i}-123456` }, { headers: { ...headers, 'x-forwarded-for': '198.51.100.250' } })).status, 201)
      const change = { idempotencyKey: 'rate-limit-blocked-123456', pageUrl: 'https://app.arch9.co.za/demo/homeseekers/contact' }
      const options = { headers: { host: 'app.arch9.co.za', 'x-forwarded-for': '198.51.100.250' } }
      assert.equal((await capture(change, options)).status, 429)
      assert.equal((await capture(change, options)).status, 429)
    })
    await t.test('scheduled retries are Home Seekers only, include all enquiry types and reject orphaned/exhausted events', async () => {
      assert.equal((await db.query('select public.website_run_home_seekers_lead_dispatcher() as result')).rows[0].result.reason, 'vault_configuration_missing')
      await db.exec("insert into vault.decrypted_secrets values ('arch9_project_url','https://fixture.example.test'),('arch9_service_role_key','fixture-service-key');")
      await db.exec("update notification_events set dispatch_attempt_count=5 where id=(select id from notification_events where payload_json->>'enquiryType'='general enquiry' order by created_at,id limit 1);")
      await db.exec("insert into notification_events(organisation_id,source,automation_key,channel,status,recipient_email) values ('33333333-3333-4333-8333-333333333333','agency_website','website_lead_received','email','queued','other@example.test'),('2958d402-368e-43c9-b728-0098e10505f1','agency_website','website_lead_received','email','queued','orphan@example.test');")
      const stale = (await db.query("update notification_events set status='processing',last_dispatch_attempt_at=now()-interval '10 minutes' where id=(select id from notification_events where lead_id is not null and dispatch_attempt_count=0 limit 1) returning id")).rows[0].id
      const result = (await db.query('select public.website_run_home_seekers_lead_dispatcher() as result')).rows[0].result
      assert.ok(result.scheduled > 0)
      const requests = (await db.query('select * from net.requests')).rows
      assert.equal(requests.length, result.scheduled)
      const ids = requests.map((request) => request.body.eventId)
      assert.ok(ids.includes(stale))
      const events = (await db.query('select * from notification_events where id=any($1::uuid[])', [ids])).rows
      assert.ok(events.every((event) => event.organisation_id === f.org && event.lead_id && event.dispatch_attempt_count < 5))
      assert.ok(events.some((event) => event.payload_json.enquiryType === 'property enquiry'))
      assert.ok(events.some((event) => event.payload_json.enquiryType === 'valuation request'))
      assert.ok(events.some((event) => event.payload_json.enquiryType === 'general enquiry'))
      const jobs = (await db.query('select jobname from cron.job')).rows.map((job) => job.jobname)
      assert.deepEqual(jobs, ['arch9-home-seekers-lead-dispatcher-1m'])
      await db.exec(await readFile(new URL('../../../supabase/migrations/20261004104401_home_seekers_lead_notification_queue.sql', import.meta.url), 'utf8'))
      assert.equal((await db.query('select count(*)::int as count from cron.job')).rows[0].count, 1, 'migration retry does not duplicate the schedule')
      assert.equal((await db.query("select has_function_privilege('anon','public.website_run_home_seekers_lead_dispatcher()','execute') as allowed")).rows[0].allowed, false)
      assert.equal((await db.query("select has_function_privilege('authenticated','public.website_run_home_seekers_lead_dispatcher()','execute') as allowed")).rows[0].allowed, false)
      assert.equal((await db.query("select has_function_privilege('service_role','public.website_run_home_seekers_lead_dispatcher()','execute') as allowed")).rows[0].allowed, true)
    })
  } finally {
    if (previous === undefined) delete process.env.WEBSITES_LEAD_FINGERPRINT_SECRET
    else process.env.WEBSITES_LEAD_FINGERPRINT_SECRET = previous
    await db.close()
  }
})

test('bad enquiry fields fail before CRM access and missing configuration fails explicitly', async () => {
  for (const change of [{ privacyAccepted: false }, { name: {} }, { phone: 'abc' }, { email: 'bad' }, { type: 'property_enquiry', listingId: 'not-a-uuid' }, { listingId: f.sale }, { pageUrl: 'https://other.example/demo/homeseekers' }]) {
    assert.equal((await createHomeSeekersLeadCaptureResponse({ headers, body: { ...body, ...change }, getConnection: () => assert.fail('Unexpected CRM access') })).status, 400)
  }
  const previous = process.env.WEBSITES_LEAD_FINGERPRINT_SECRET
  delete process.env.WEBSITES_LEAD_FINGERPRINT_SECRET
  try { assert.equal((await createHomeSeekersLeadCaptureResponse({ headers, body, getConnection: () => assert.fail('Unexpected CRM access') })).status, 503) }
  finally { if (previous !== undefined) process.env.WEBSITES_LEAD_FINGERPRINT_SECRET = previous }
})
