import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { convertAttorneyLeadToMatter, normalizeAttorneyLeadRow } from '../src/services/attorneyLeadsService.js'

const root = new URL('../', import.meta.url)
const page = await readFile(new URL('src/pages/AttorneyLeadsPage.jsx', root), 'utf8')
const service = await readFile(new URL('src/services/attorneyLeadsService.js', root), 'utf8')
const migration = await readFile(
  new URL('../../supabase/migrations/202607160006_attorney_lead_to_matter_conversion_phase7.sql', import.meta.url),
  'utf8',
)

async function test(name, fn) {
  try {
    await fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await test('conversion lineage is tenant-consistent and one-to-one', () => {
  assert.match(migration, /create table if not exists public\.attorney_lead_conversions/)
  assert.match(migration, /foreign key \(lead_id, organisation_id\)[\s\S]*references public\.leads\(lead_id, organisation_id\)/)
  assert.match(migration, /foreign key \(attorney_firm_id, organisation_id\)[\s\S]*references public\.attorney_firms\(id, organisation_id\)/)
  assert.match(migration, /foreign key \(transaction_id, organisation_id\)[\s\S]*references public\.transactions\(id, organisation_id\)/)
  assert.match(migration, /unique \(organisation_id, lead_id\)/)
  assert.match(migration, /unique \(transaction_id\)/)
  assert.match(migration, /unique \(attorney_assignment_id\)/)
})

await test('conversion is explicit, authenticated, and restricted to assignment authority', () => {
  assert.match(migration, /auth\.uid\(\) is null/)
  assert.match(migration, /bridge_attorney_lead_can_access\([\s\S]*'assign'/)
  assert.match(migration, /revoke all on function public\.bridge_convert_attorney_lead_to_matter\(uuid, uuid, jsonb\) from public, anon/)
  assert.match(migration, /grant execute on function public\.bridge_convert_attorney_lead_to_matter\(uuid, uuid, jsonb\) to authenticated/)
  assert.match(page, /I confirm that this qualified Lead should become an active firm Matter/)
  assert.match(page, /canAssign \? \(/)
})

await test('type-specific conversion prerequisites are server enforced', () => {
  assert.match(migration, /v_matter_type not in \('transfer', 'bond', 'cancellation'\)/)
  assert.match(migration, /selected client role is not valid for this Matter type/)
  assert.match(migration, /v_lead\.stage not in \('qualified', 'quote_sent', 'follow_up', 'won'\)/)
  assert.match(migration, /valid property address is required before conversion/)
  assert.match(migration, /Choose an Attorney-qualified Matter owner/)
  assert.match(migration, /Choose a Bond Attorney-qualified Matter owner/)
  assert.match(migration, /Choose a Transfer Attorney-qualified Matter owner/)
})

await test('existing Contact becomes the canonical transaction party linkage', () => {
  assert.match(migration, /contact\.organisation_id = p_organisation_id[\s\S]*contact\.contact_id = v_lead\.contact_id/)
  assert.match(migration, /insert into public\.buyers \(name, phone, email\)/)
  assert.match(migration, /buyer_contact_id,[\s\S]*seller_contact_id/)
  assert.match(migration, /case when v_client_role in \('buyer', 'borrower'\) then v_contact\.contact_id/)
  assert.match(migration, /case when v_client_role in \('seller', 'owner'\) then v_contact\.contact_id/)
})

await test('successful conversion creates an active Matter representation directly', () => {
  assert.match(migration, /insert into public\.transactions/)
  assert.match(migration, /'attorney_originated_matter'/)
  assert.match(migration, /'Proceed to Attorneys'/)
  assert.match(migration, /'instruction_received'/)
  assert.match(migration, /insert into public\.transaction_attorney_assignments/)
  assert.match(migration, /'active',[\s\S]*'active',[\s\S]*'accepted'/)
  assert.match(migration, /'attorney_lead_conversion'/)
})

await test('firm-originated conversion never enters Incoming Matters', () => {
  assert.doesNotMatch(migration, /'new_instruction'|'awaiting_client_onboarding'|'awaiting_signed_otp'|'awaiting_documents'|'ready_for_acceptance'/)
  assert.match(migration, /instruction_status,[\s\S]*'accepted'/)
  assert.match(page, /It will not enter Incoming Matters/)
  assert.doesNotMatch(service, /attorneyIncomingMatter|createTransactionFromLeadOverride/)
})

await test('Lead becomes Won only after transaction and assignment creation', () => {
  const transactionInsert = migration.indexOf('insert into public.transactions (')
  const assignmentInsert = migration.indexOf('insert into public.transaction_attorney_assignments (')
  const leadWonUpdate = migration.indexOf("stage = 'won'")
  assert.ok(transactionInsert > 0)
  assert.ok(assignmentInsert > transactionInsert)
  assert.ok(leadWonUpdate > assignmentInsert)
  assert.match(migration, /converted_transaction_id = v_transaction_id/)
  assert.match(migration, /converted_at = v_now/)
  assert.match(migration, /closed_at = v_now/)
  assert.match(migration, /create trigger trg_enforce_attorney_converted_lead_state/)
  assert.match(migration, /Converted Attorney Lead transaction lineage is immutable/)
  assert.match(migration, /Converted Attorney Lead ownership is immutable; reassign the Matter instead/)
  assert.match(migration, /Converted Attorney Leads must remain closed as Won/)
})

await test('conversion is idempotent and repairs pre-existing Lead linkage', () => {
  assert.match(migration, /v_existing\.conversion_status = 'completed'/)
  assert.match(migration, /'existing', true/)
  assert.match(migration, /if v_lead\.converted_transaction_id is not null/)
  assert.match(migration, /on conflict \(organisation_id, lead_id\) do update/)
  assert.match(migration, /Attorney Lead already has a transaction link that requires manual review/)
})

await test('conversion attempts record started, completed, and failed activity', () => {
  assert.match(migration, /'Conversion Started'/)
  assert.match(migration, /'Conversion Completed'/)
  assert.match(migration, /exception when others/)
  assert.match(migration, /conversion_status = 'failed'/)
  assert.match(migration, /'Conversion Failed'/)
})

await test('conversion table cannot be mutated directly by authenticated clients', () => {
  assert.match(migration, /revoke all on table public\.attorney_lead_conversions from public, anon, authenticated/)
  assert.match(migration, /grant select on table public\.attorney_lead_conversions to authenticated/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).*attorney_lead_conversions to authenticated/i)
  assert.match(migration, /create policy attorney_lead_conversions_select/)
})

await test('service validates payload and uses only the dedicated Attorney conversion RPC', async () => {
  const calls = []
  const client = {
    rpc: async (name, args) => {
      calls.push({ name, args })
      return {
        data: {
          success: true,
          existing: false,
          lead_id: 'lead-1',
          transaction_id: 'transaction-1',
          assignment_id: 'assignment-1',
          matter_type: 'transfer',
        },
        error: null,
      }
    },
  }
  const result = await convertAttorneyLeadToMatter({
    organisationId: 'org-1',
    leadId: 'lead-1',
    values: {
      matterType: 'transfer',
      clientRole: 'buyer',
      assignedUserId: 'user-1',
      propertyAddress: '1 Main Road',
      propertyValue: '2500000',
      financeType: 'bond',
      conversionNote: 'Qualified client instruction.',
    },
    client,
  })
  assert.equal(calls[0].name, 'bridge_convert_attorney_lead_to_matter')
  assert.equal(calls[0].args.p_payload.matter_type, 'transfer')
  assert.equal(result.transactionId, 'transaction-1')
  assert.equal(result.assignmentId, 'assignment-1')
  await assert.rejects(
    convertAttorneyLeadToMatter({ organisationId: 'org-1', leadId: 'lead-1', values: { matterType: 'transfer' }, client }),
    /client role/,
  )
})

await test('normalized Leads expose durable conversion linkage to the UI', () => {
  const row = normalizeAttorneyLeadRow({
    lead_id: 'lead-1',
    organisation_id: 'org-1',
    stage: 'won',
    status: 'won',
    converted_transaction_id: 'transaction-1',
    converted_at: '2026-07-16T12:00:00.000Z',
  })
  assert.equal(row.convertedTransactionId, 'transaction-1')
  assert.equal(row.convertedAt, '2026-07-16T12:00:00.000Z')
  assert.match(page, /href=\{`\/transactions\/\$\{encodeURIComponent\(lead\.convertedTransactionId\)\}`\}/)
})

console.log('attorney Lead-to-Matter conversion Phase 7 tests passed')
