import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { sendAttorneyQuoteEmail } from '../src/services/attorneyQuoteEmailService.js'

const root = new URL('../', import.meta.url)
const migration = await readFile(new URL('../../supabase/migrations/202607160012_attorney_quote_email_delivery_phase13.sql', import.meta.url), 'utf8')
const handler = await readFile(new URL('../../supabase/functions/send-email/handlers/attorneyQuote.ts', import.meta.url), 'utf8')
const emailIndex = await readFile(new URL('../../supabase/functions/send-email/index.ts', import.meta.url), 'utf8')
const emailTypes = await readFile(new URL('../../supabase/functions/send-email/types.ts', import.meta.url), 'utf8')
const leadsPage = await readFile(new URL('src/pages/AttorneyLeadsPage.jsx', root), 'utf8')
const leadsService = await readFile(new URL('src/services/attorneyLeadsService.js', root), 'utf8')
const emailService = await readFile(new URL('src/services/attorneyQuoteEmailService.js', root), 'utf8')
const notes = await readFile(new URL('docs/attorney-public-intake-leads-phase-13-notes.md', root), 'utf8')

function test(name, fn) {
  try {
    return Promise.resolve(fn()).then(() => console.log(`ok - ${name}`))
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await test('quote links retain only a canonical email delivery snapshot', () => {
  assert.match(migration, /last_email_delivery_id uuid references public\.communication_deliveries\(id\)/)
  assert.match(migration, /last_email_status in \('sent', 'failed'\)/)
  assert.match(migration, /email_attempt_count between 0 and 10000/)
  assert.match(migration, /email_dispatch_status[\s\S]*'prepared', 'sent', 'failed'/)
  assert.doesNotMatch(migration, /create table if not exists public\.attorney.*email_deliver/i)
})

await test('database prepares the recipient and token without accepting either from the browser', () => {
  assert.match(migration, /bridge_prepare_attorney_quote_email\(\s*p_organisation_id uuid,\s*p_quote_id uuid/)
  assert.match(migration, /bridge_create_attorney_quote_public_link\(p_organisation_id, p_quote_id\)/)
  assert.match(migration, /'recipient_email', lower\(trim\(contact\.email\)\)/)
  assert.match(migration, /join public\.contacts contact/)
  assert.match(migration, /Attorney Lead requires a valid client email address/)
  assert.doesNotMatch(migration, /bridge_prepare_attorney_quote_email\([\s\S]{0,180}p_(?:to|token|recipient)/i)
})

await test('email preparation enforces edit authority and current Lead and quote state', () => {
  assert.match(migration, /bridge_attorney_lead_can_access\([\s\S]*'edit'/)
  assert.match(migration, /Only open unconverted Attorney Leads can email quotes/)
  assert.match(migration, /Only a current sent Attorney Lead quote can be emailed/)
  const prepare = migration.slice(migration.indexOf('create or replace function public.bridge_prepare_attorney_quote_email'))
  const leadLock = prepare.indexOf('select lead.* into v_lead')
  const quoteLock = prepare.indexOf('select quote.* into v_quote')
  assert.ok(leadLock >= 0 && quoteLock > leadLock)
  assert.match(prepare.slice(leadLock, quoteLock), /for update/)
  assert.match(prepare.slice(quoteLock), /for update/)
})

await test('dispatch reservation prevents concurrent or accidental duplicate sends', () => {
  assert.match(migration, /email_dispatch_key uuid/)
  assert.match(migration, /email_dispatch_status = 'prepared'/)
  assert.match(migration, /email_dispatch_started_at > now\(\) - interval '10 minutes'/)
  assert.match(migration, /last_emailed_at > now\(\) - interval '30 seconds'/)
  assert.match(migration, /email delivery is already in progress or was just sent/)
  assert.match(migration, /link\.email_dispatch_key = p_dispatch_key/)
})

await test('delivery outcome is service-role audited and failure revokes the bearer link', () => {
  assert.match(migration, /bridge_record_attorney_quote_email_delivery/)
  assert.match(migration, /if auth\.role\(\) <> 'service_role' then raise exception 'Service role required'/)
  assert.match(migration, /last_email_delivery_id = p_delivery_id/)
  assert.match(migration, /v_status = 'failed' and status = 'active' then 'revoked'/)
  assert.match(migration, /Quote Email Sent/)
  assert.match(migration, /Quote Email Failed/)
  assert.match(migration, /grant execute on function public\.bridge_record_attorney_quote_email_delivery[\s\S]*to service_role/)
})

await test('dedicated email handler authenticates and resolves its envelope server-side', () => {
  assert.match(emailIndex, /handleAttorneyQuoteEmail/)
  assert.match(emailIndex, /\["attorney_quote", "attorney_quote_email"\]/)
  assert.match(emailTypes, /SendAttorneyQuotePayload/)
  assert.match(handler, /SUPABASE_ANON_KEY/)
  assert.match(handler, /Authorization: authorization/)
  assert.match(handler, /bridge_prepare_attorney_quote_email/)
  assert.doesNotMatch(handler, /payload\.(?:to|token|recipientEmail|quoteUrl)/)
})

await test('quote URLs use configured application origins, never request-controlled origins', () => {
  assert.match(handler, /PUBLIC_APP_URL/)
  assert.match(handler, /CLIENT_APP_URL/)
  assert.match(handler, /VITE_PUBLIC_APP_URL/)
  assert.match(handler, /const quoteUrl = `\$\{appBaseUrl\}\/quote\/\$\{normalizeText\(envelope\.token\)\}`/)
  assert.doesNotMatch(handler, /req\.headers\.get\("origin"\)|req\.headers\.get\("referer"\)/)
})

await test('email uses canonical Resend delivery telemetry and complete content', () => {
  assert.match(handler, /prepareEmailDelivery/)
  assert.match(handler, /communicationType: "attorney_quote"/)
  assert.match(handler, /sendViaResendApi/)
  assert.match(handler, /markEmailDeliverySent/)
  assert.match(handler, /markEmailDeliveryFailed/)
  assert.match(handler, /renderBridgeEmailLayout/)
  assert.match(handler, /Review Secure Quote/)
  assert.match(handler, /Professional fee/)
  assert.match(handler, /plain|const text =/i)
  assert.match(handler, /replyTo: supportEmail/)
})

await test('browser service sends only type and quote context', async () => {
  const requestBodyStart = emailService.indexOf('body: {')
  const requestBodyEnd = emailService.indexOf('},', requestBodyStart)
  const requestBody = emailService.slice(requestBodyStart, requestBodyEnd)

  assert.notEqual(requestBodyStart, -1)
  assert.notEqual(requestBodyEnd, -1)
  assert.match(emailService, /type: 'attorney_quote'/)
  assert.match(emailService, /organisationId: scopedOrganisationId/)
  assert.match(emailService, /quoteId: scopedQuoteId/)
  assert.doesNotMatch(requestBody, /\bto:|token:|recipientEmail:/)
  await assert.rejects(sendAttorneyQuoteEmail({ organisationId: '', quoteId: '' }), /context/)
})

await test('Lead workspace exposes send, resend, and delivery status', () => {
  assert.match(leadsPage, /Email client/)
  assert.match(leadsPage, /Resend email/)
  assert.match(leadsPage, /Email \{quoteLinks\.find/)
  assert.match(leadsPage, /sendAttorneyQuoteEmail/)
  assert.match(leadsService, /last_email_delivery_id/)
  assert.match(leadsService, /email_attempt_count/)
})

await test('Phase 13 remains transactional and never creates operational work', () => {
  assert.match(notes, /never creates a Matter, transaction, assignment, mandate, or Incoming Instruction/)
  assert.doesNotMatch(migration, /insert into public\.(transactions|transaction_attorney_assignments|attorney_instruction_responses)/i)
  assert.doesNotMatch(handler, /\.from\("(?:transactions|transaction_attorney_assignments|attorney_instruction_responses)"\)/)
})

console.log('Attorney quote email delivery Phase 13 tests passed')
