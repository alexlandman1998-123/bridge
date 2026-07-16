import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  createAttorneyLeadQuote,
  transitionAttorneyLeadQuote,
} from '../src/services/attorneyLeadsService.js'

const root = new URL('../', import.meta.url)
const migration = await readFile(new URL('../../supabase/migrations/202607160010_attorney_lead_quotes_phase11.sql', import.meta.url), 'utf8')
const page = await readFile(new URL('src/pages/AttorneyLeadsPage.jsx', root), 'utf8')
const service = await readFile(new URL('src/services/attorneyLeadsService.js', root), 'utf8')
const notes = await readFile(new URL('docs/attorney-public-intake-leads-phase-11-notes.md', root), 'utf8')

function test(name, fn) {
  try {
    return Promise.resolve(fn()).then(() => console.log(`ok - ${name}`))
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await test('quotes are tenant-bound, versioned child records of Attorney Leads', () => {
  assert.match(migration, /create table if not exists public\.attorney_lead_quotes/)
  assert.match(migration, /foreign key \(lead_id, organisation_id\)[\s\S]*references public\.leads\(lead_id, organisation_id\)/)
  assert.match(migration, /unique index if not exists attorney_lead_quotes_lead_version_unique_idx/)
  assert.match(migration, /unique index if not exists attorney_lead_quotes_one_accepted_idx[\s\S]*where status = 'accepted'/)
  assert.match(migration, /generated always as \(professional_fee \+ vat_amount \+ disbursements\) stored/)
})

await test('the quote register is read-only outside bounded domain commands', () => {
  assert.match(migration, /alter table public\.attorney_lead_quotes enable row level security/)
  assert.match(migration, /lead\.lead_domain = 'attorney'/)
  assert.match(migration, /bridge_attorney_lead_can_access\([\s\S]*'view'/)
  assert.match(migration, /revoke all on table public\.attorney_lead_quotes from public, anon, authenticated/)
  assert.match(migration, /grant select on table public\.attorney_lead_quotes to authenticated/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table public\.attorney_lead_quotes to authenticated/i)
})

await test('quote creation serializes numbering, bounds values, and locks closed or converted Leads', () => {
  assert.match(migration, /bridge_create_attorney_lead_quote/)
  assert.match(migration, /for update/)
  assert.match(migration, /bridge_attorney_lead_can_access\([\s\S]*'edit'/)
  assert.match(migration, /Converted Attorney Leads cannot receive new quotes/)
  assert.match(migration, /Only open Attorney Leads can receive new quotes/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /coalesce\(max\(quote\.version_number\), 0\) \+ 1/)
  assert.match(migration, /'AQ-' \|\| to_char\(current_date, 'YYYY'\)/)
  assert.match(migration, /Quote validity must be between today and 365 days from today/)
  assert.match(migration, /'Quote Drafted'/)
})

await test('only deliberate draft, send, accept, and decline transitions are permitted', () => {
  assert.match(migration, /v_status not in \('sent', 'accepted', 'declined'\)/)
  assert.match(migration, /v_status = 'sent' and v_quote\.status <> 'draft'/)
  assert.match(migration, /v_status in \('accepted', 'declined'\) and v_quote\.status <> 'sent'/)
  assert.match(migration, /Expired Attorney Lead quote cannot be accepted/)
  assert.match(migration, /A decline reason is required/)
  assert.match(migration, /set status = 'superseded'[\s\S]*status = 'sent'/)
  assert.match(migration, /'Quote Sent'[\s\S]*'Quote Accepted'[\s\S]*'Quote Declined'/)
})

await test('quote decisions lock the parent Lead before the child quote', () => {
  const transition = migration.slice(migration.indexOf('create or replace function public.bridge_transition_attorney_lead_quote'))
  const leadLock = transition.indexOf('select lead.* into v_lead')
  const quoteLock = transition.indexOf('select quote.* into v_quote')
  assert.ok(leadLock >= 0 && quoteLock > leadLock)
  assert.match(transition.slice(leadLock, quoteLock), /for update/)
  assert.match(transition.slice(quoteLock), /for update/)
})

await test('sending and acceptance update only Lead lifecycle state', () => {
  assert.match(migration, /set stage = 'quote_sent', status = 'open'/)
  assert.match(migration, /set stage = 'won', status = 'won', closed_at = v_now/)
  assert.doesNotMatch(migration, /insert into public\.(transactions|transaction_attorney_assignments|attorney_instruction_responses)/i)
  assert.match(notes, /Acceptance never creates a Matter or Incoming Instruction automatically/)
})

await test('service sends normalized quote commands through dedicated RPCs', async () => {
  const calls = []
  const client = { rpc: async (name, args) => {
    calls.push({ name, args })
    return name === 'bridge_create_attorney_lead_quote'
      ? { data: { success: true, quote_id: 'quote-1', quote_number: 'AQ-2026-000001' }, error: null }
      : { data: { success: true, quote_id: 'quote-1', status: args.p_status }, error: null }
  } }
  await createAttorneyLeadQuote({ organisationId: 'org-1', leadId: 'lead-1', values: { professionalFee: '1000.00', vatAmount: '150.00', disbursements: '75.50', validUntil: '2026-07-30', internalNote: 'First version' }, client })
  await transitionAttorneyLeadQuote({ organisationId: 'org-1', quoteId: 'quote-1', status: 'sent', client })
  await transitionAttorneyLeadQuote({ organisationId: 'org-1', quoteId: 'quote-1', status: 'declined', reason: 'Client chose another firm', client })
  assert.deepEqual(calls.map((call) => call.name), [
    'bridge_create_attorney_lead_quote',
    'bridge_transition_attorney_lead_quote',
    'bridge_transition_attorney_lead_quote',
  ])
  assert.equal(calls[0].args.p_payload.professional_fee, '1000.00')
  assert.equal(calls[2].args.p_reason, 'Client chose another firm')
})

await test('service rejects invalid totals, decisions, and missing decline reasons before RPC', async () => {
  const client = { rpc: async () => { throw new Error('RPC must not be called') } }
  await assert.rejects(
    createAttorneyLeadQuote({ organisationId: 'org-1', leadId: 'lead-1', values: { professionalFee: '0', vatAmount: '0', disbursements: '0', validUntil: '2026-07-30' }, client }),
    /greater than zero/,
  )
  await assert.rejects(
    transitionAttorneyLeadQuote({ organisationId: 'org-1', quoteId: 'quote-1', status: 'declined', client }),
    /reason/,
  )
  await assert.rejects(
    transitionAttorneyLeadQuote({ organisationId: 'org-1', quoteId: 'quote-1', status: 'deleted', client }),
    /valid quote action/,
  )
})

await test('Lead drawer exposes the register while preserving explicit Matter conversion', () => {
  assert.match(page, /function LeadQuotesSection/)
  assert.match(page, /Versioned fee proposals/)
  assert.match(page, /Mark as sent/)
  assert.match(page, /Accept quote/)
  assert.match(page, /Decline quote/)
  assert.match(page, /Acceptance marks the Lead Won but does not create a Matter/)
  assert.match(page, /I confirm that this qualified Lead should become an active firm Matter/)
  assert.match(page, />Convert to Matter</)
  assert.match(service, /listAttorneyLeadQuotes/)
})

console.log('Attorney Leads quote register Phase 11 tests passed')
