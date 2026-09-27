import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { deriveProfessionalTransferMilestones, buildClientTransferJourneyPresentation, selectJourneyPublisherStage } from '../src/core/clientPortal/transferJourneyPresentationModel.js'
import { projectSharedMatterJourneyRead } from '../src/services/sharedMatterJourneyReader.js'

const migration = readFileSync(new URL('../../supabase/migrations/20260926170855_client_transfer_journey_milestones.sql', import.meta.url), 'utf8')
const fundingReadinessMigration = readFileSync(new URL('../../supabase/migrations/20260926180540_attorney_client_funding_readiness.sql', import.meta.url), 'utf8')
const db = new PGlite()
await db.exec(`
  create role anon;
  create role authenticated;
  create schema journey_private;
  create table journey_private.test_source(payload jsonb);
  create function journey_private.read_matter_journey(uuid) returns jsonb
    language sql stable security definer as $$ select payload from journey_private.test_source limit 1 $$;
  create table public.transaction_attorney_lane_updates(
    id uuid, transaction_id uuid, lane_key text, visibility text, client_recipients text[] not null default '{}'::text[],
    metadata jsonb, message text, created_at timestamptz);
  create function public.bridge_private_listing_seller_portal_payload(text,text,boolean) returns jsonb
    language sql security definer as $$
      select case when $1 = 'seller-valid' and $2 = 'valid-session' and $3
        then '{"listing":{"id":"00000000-0000-0000-0000-000000000002"}}'::jsonb
        else '{"authRequired":true}'::jsonb end $$;
  create function public.bridge_resolve_private_listing_transaction_id(uuid) returns uuid
    language sql security definer as $$
      select case when $1 = '00000000-0000-0000-0000-000000000002'::uuid
        then '00000000-0000-0000-0000-000000000001'::uuid else null end $$;
  create function public.bridge_has_client_portal_token_transaction_access(uuid) returns boolean
    language sql security definer as $$
      select $1 = '00000000-0000-0000-0000-000000000001'::uuid
        and current_setting('test.buyer_token',true) = 'valid' $$;
`)
await db.query(`insert into public.transaction_attorney_lane_updates
  values ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','transfer','client_visible',
    array['seller'],'{}','Historical update','2026-09-25T10:00:00Z')`)
await db.exec(migration)
await db.exec(fundingReadinessMigration)
assert.equal((await db.query("select client_recipients from public.transaction_attorney_lane_updates where message='Historical update'")).rows[0].client_recipients[0], 'seller')
assert.equal(selectJourneyPublisherStage([{ key: 'registration', status: 'completed' }])?.key, 'registration',
  'attorneys can still publish the final registration update after the milestone completes')
assert.equal(selectJourneyPublisherStage([{ key: 'lodgement', status: 'in_progress' }, { key: 'registration', status: 'not_started' }])?.key,
  'lodgement', 'before registration, the publisher follows the current client stage')

const task = (key, status) => ({ key, status, clientLabel: 'Matter update', label: `Private ${key}` })
const lane = (key, phases) => ({ key, phases: Object.entries(phases).map(([phaseKey, tasks]) => ({
  key: phaseKey, label: phaseKey, clientLabel: 'Matter stage', tasks: tasks.map(([taskKey, status]) => task(taskKey, status)),
})) })
const cases = [
  {
    name: 'cash transfer without existing bond',
    lanes: [lane('transfer', {
      instruction: [['instruction_received', 'completed'], ['matter_opened', 'completed'], ['otp_source_docs_checked', 'completed']],
      fica_authority: [['buyer_fica_review', 'completed'], ['seller_fica_review', 'completed']],
      financial_preparation: [['municipal_rates_clearance_review', 'waiting'], ['sars_transfer_tax_receipt_verified', 'not_started']],
      documents_guarantees: [['cash_funding_source_review', 'not_started'], ['payment_security_review', 'not_started'], ['buyer_signing_review', 'not_started'], ['seller_signing_review', 'not_started']],
      deeds_office: [['lodged_at_deeds_office', 'not_started'], ['registered', 'not_started']],
    })],
    expected: { instruction: 'completed', fica: 'completed', rates: 'waiting', funding: 'not_started', clearances: 'not_started' },
  },
  {
    name: 'bond purchase with seller cancellation',
    lanes: [
      lane('transfer', { instruction: [['instruction_received', 'completed']], fica_authority: [['buyer_fica_review', 'in_progress']],
        financial_preparation: [['municipal_rates_clearance_review', 'completed']],
        documents_guarantees: [['buyer_signing_review', 'completed'], ['seller_signing_review', 'completed']],
        deeds_office: [['lodged_at_deeds_office', 'blocked'], ['registered', 'not_started']] }),
      lane('bond', { bond_finance: [['bank_conditions_resolved', 'waiting'], ['guarantees_issued', 'not_started']],
        deeds_office: [['bond_lodged', 'not_started'], ['bond_registered', 'not_started']] }),
      lane('cancellation', { cancellation_figures: [['cancellation_figures_received', 'completed']],
        cancellation_documents: [['cancellation_guarantees_received', 'waiting']],
        deeds_office: [['cancellation_lodged', 'not_started'], ['cancellation_registered', 'not_started']] }),
    ],
    expected: { fica: 'in_progress', rates: 'completed', funding: 'waiting', signing: 'completed', lodgement: 'blocked' },
  },
  {
    name: 'entity buyer and non-resident seller with specialist checks',
    lanes: [lane('transfer', {
      instruction: [['instruction_received', 'completed']],
      fica_authority: [['buyer_party_capacity_review', 'waiting'], ['seller_fica_review', 'completed']],
      financial_preparation: [['municipal_rates_clearance_review', 'completed'], ['non_resident_seller_withholding_payment_review', 'blocked']],
      documents_guarantees: [['payment_security_review', 'completed'], ['buyer_signing_review', 'not_started']],
      deeds_office: [['lodged_at_deeds_office', 'not_started'], ['registered', 'not_started']],
    })],
    expected: { fica: 'waiting', rates: 'completed', funding: 'completed', clearances: 'blocked' },
  },
]

for (const scenario of cases) {
  const source = { schemaVersion: 1, transactionId: '00000000-0000-0000-0000-000000000001', revision: 1, lanes: scenario.lanes }
  await db.query('delete from journey_private.test_source')
  await db.query('insert into journey_private.test_source(payload) values ($1)', [source])
  const clientRead = (await db.query("select journey_private.read_client_matter_journey('00000000-0000-0000-0000-000000000001') result")).rows[0].result
  const professional = deriveProfessionalTransferMilestones({ status: 'ready', snapshot: source })
  assert.deepEqual(clientRead.clientTransferMilestones, professional, scenario.name)
  for (const [key, status] of Object.entries(scenario.expected)) {
    assert.equal(clientRead.clientTransferMilestones.find(row => row.key === key)?.status, status, `${scenario.name}: ${key}`)
  }
  assert.ok(clientRead.lanes.every(item => item.phases.every(phase => phase.tasks.every(row => /^task_\d+$/.test(row.key)))))
  assert.doesNotMatch(JSON.stringify(clientRead), /Private |bank_conditions_resolved|cash_funding_source_review|sars_transfer_tax_receipt_verified/)
}

// The three professional lanes run in parallel. A client stage must retain an
// outstanding state if a linked attorney still has a substantive prerequisite.
const coordinatedSource = {
  schemaVersion: 1, transactionId: '00000000-0000-0000-0000-000000000001', revision: 2,
  lanes: [
    lane('transfer', {
      instruction: [['instruction_received', 'completed']],
      documents_guarantees: [['payment_security_review', 'completed'], ['buyer_signing_review', 'completed'], ['seller_signing_review', 'completed']],
      financial_preparation: [['sars_transfer_tax_receipt_verified', 'completed']],
      deeds_office: [['lodged_at_deeds_office', 'not_started'], ['registered', 'not_started']],
    }),
    lane('bond', {
      bond_finance: [['bond_approval_letter_received', 'completed'], ['bank_conditions_resolved', 'completed']],
      bond_documents: [['buyer_signed_bond_documents', 'completed'], ['guarantees_issued', 'completed'],
        ['guarantee_wording_accepted', 'completed'], ['bank_approval_to_lodge_received', 'waiting']],
      bond_registration: [['bond_lodgement_instructions_confirmed', 'completed'], ['bond_lodged', 'not_started'], ['bond_registered', 'not_started']],
    }),
    lane('cancellation', {
      cancellation_figures: [['cancellation_figures_received', 'completed'], ['figures_expiry_captured', 'completed']],
      cancellation_documents: [['cancellation_guarantees_accepted', 'completed'],
        ['cancellation_guarantee_allocation_review', 'completed'], ['seller_cancellation_documents_signed', 'completed'],
        ['cancellation_consent_confirmed', 'completed']],
      cancellation_registration: [['cancellation_simultaneous_lodgement_confirmed', 'completed'],
        ['cancellation_lodged', 'not_started'], ['cancellation_registered', 'not_started']],
    }),
  ],
}
const readMilestones = async source => {
  await db.query('delete from journey_private.test_source')
  await db.query('insert into journey_private.test_source(payload) values ($1)', [source])
  const clientRead = (await db.query("select journey_private.read_client_matter_journey('00000000-0000-0000-0000-000000000001') result")).rows[0].result
  const professional = deriveProfessionalTransferMilestones({ status: 'ready', snapshot: source })
  assert.deepEqual(clientRead.clientTransferMilestones, professional, 'attorney and client projections must agree')
  return Object.fromEntries(clientRead.clientTransferMilestones.map(row => [row.key, row.status]))
}
assert.equal((await readMilestones(coordinatedSource)).clearances, 'waiting', 'bank approval to lodge remains visible as a wait')
const changedFigures = structuredClone(coordinatedSource)
changedFigures.lanes[2].phases[0].tasks.find(row => row.key === 'figures_expiry_captured').status = 'blocked'
assert.equal((await readMilestones(changedFigures)).funding, 'blocked', 'stale cancellation figures cannot show funding complete')
const missingConsent = structuredClone(coordinatedSource)
missingConsent.lanes[2].phases[1].tasks.find(row => row.key === 'cancellation_consent_confirmed').status = 'waiting'
assert.equal((await readMilestones(missingConsent)).clearances, 'waiting', 'cancellation consent remains visible as a wait')
const unsignedBond = structuredClone(coordinatedSource)
unsignedBond.lanes[1].phases[1].tasks.find(row => row.key === 'buyer_signed_bond_documents').status = 'waiting'
assert.equal((await readMilestones(unsignedBond)).signing, 'waiting', 'bond signing cannot be hidden by completed transfer signatures')
const bankReady = structuredClone(coordinatedSource)
bankReady.lanes[1].phases[1].tasks.find(row => row.key === 'bank_approval_to_lodge_received').status = 'completed'
assert.equal((await readMilestones(bankReady)).clearances, 'completed')
const deedsRejected = structuredClone(bankReady)
deedsRejected.lanes[0].phases[3].tasks.find(row => row.key === 'lodged_at_deeds_office').status = 'completed'
deedsRejected.lanes[1].phases[2].tasks.find(row => row.key === 'bond_lodged').status = 'blocked'
deedsRejected.lanes[2].phases[2].tasks.find(row => row.key === 'cancellation_lodged').status = 'completed'
assert.equal((await readMilestones(deedsRejected)).lodgement, 'blocked',
  'a rejected bond set cannot appear fully lodged to either client')
const partiallyRegistered = structuredClone(deedsRejected)
partiallyRegistered.lanes[1].phases[2].tasks.find(row => row.key === 'bond_lodged').status = 'completed'
partiallyRegistered.lanes[0].phases[3].tasks.find(row => row.key === 'registered').status = 'completed'
partiallyRegistered.lanes[1].phases[2].tasks.find(row => row.key === 'bond_registered').status = 'completed'
partiallyRegistered.lanes[2].phases[2].tasks.find(row => row.key === 'cancellation_registered').status = 'waiting'
assert.equal((await readMilestones(partiallyRegistered)).registration, 'waiting',
  'transfer alone cannot make the shared client journey look registered')

await db.exec('set role anon')
await assert.rejects(db.query("select journey_private.client_transfer_milestones('{}'::jsonb)"), /permission denied/)
await assert.rejects(db.query("select public.bridge_read_seller_transfer_journey_updates('seller-valid','wrong-session')"), /Seller portal access/)
await assert.rejects(db.query("select public.bridge_read_buyer_transfer_journey_updates('00000000-0000-0000-0000-000000000001')"), /Buyer portal access/)
await db.exec('reset role')
await db.query(`insert into public.transaction_attorney_lane_updates
  values ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','transfer','client_visible',
    '["seller"]'::jsonb,'{"journeyBrief":{"version":1,"stageKey":"rates","currentStatus":"Figures requested"}}',
    'Seller-safe progress','2026-09-26T10:00:00Z')`)
await db.query(`insert into public.transaction_attorney_lane_updates
  values ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','transfer','client_visible',
    '["buyer"]'::jsonb,'{"journeyBrief":{"version":1,"stageKey":"rates","currentStatus":"Private buyer note"}}',
    'Buyer-only progress','2026-09-26T11:00:00Z')`)
await db.exec('set role anon')
const sellerUpdates = (await db.query("select public.bridge_read_seller_transfer_journey_updates('seller-valid','valid-session') result")).rows[0].result
assert.equal(sellerUpdates.length, 1)
assert.equal(sellerUpdates[0].message, 'Seller-safe progress')
assert.doesNotMatch(JSON.stringify(sellerUpdates), /Private buyer note|Buyer-only/)
await db.query("select set_config('test.buyer_token','valid',false)")
const buyerUpdates = (await db.query("select public.bridge_read_buyer_transfer_journey_updates('00000000-0000-0000-0000-000000000001') result")).rows[0].result
assert.equal(buyerUpdates.length, 1)
assert.equal(buyerUpdates[0].message, 'Buyer-only progress')
assert.doesNotMatch(JSON.stringify(buyerUpdates), /Seller-safe/)
await db.exec('reset role')
await db.close()

const milestoneRows = cases[0].expected
const legalJourney = { status: 'ready', snapshot: {
  clientTransferMilestones: Object.entries(milestoneRows).map(([key, status]) => ({ key, status })),
} }
const update = (audience, createdAt, message) => ({ laneKey: 'transfer', visibility: 'client_visible',
  clientRecipients: [audience], createdAt, message,
  metadata: { journeyBrief: { version: 1, stageKey: 'rates', currentStatus: 'Waiting for rates figures',
    waitingOn: 'municipality', clientAction: 'Upload the requested document', registrationEstimate: 'Mid-November',
    delayStatus: 'delayed', delayReason: 'Municipal figures are late' } },
})
const buyer = buildClientTransferJourneyPresentation({ legalJourney,
  attorneyUpdates: [update('seller', '2026-09-26T12:00:00Z', 'Seller-only message'), update('buyer', '2026-09-26T11:00:00Z', 'Buyer-safe message')],
  audience: 'buyer', now: '2026-09-26T13:00:00Z' })
assert.equal(buyer.currentStage.key, 'rates')
assert.equal(buyer.currentUpdate.message, 'Buyer-safe message')
assert.equal(buyer.waitingOn, 'municipality')
assert.equal(buyer.estimatedRegistration, 'Mid-November')
assert.equal(buyer.clientAction, 'Upload the requested document')
assert.equal(buyer.currentStage.delayStatus, 'delayed')
assert.equal(buyer.currentStage.delayReason, 'Municipal figures are late')
assert.equal(buildClientTransferJourneyPresentation({ legalJourney: { status: 'ready', snapshot: {} } }).status, 'unavailable')
assert.deepEqual(projectSharedMatterJourneyRead({ schemaVersion: 1, transactionId: 'x', revision: 1, planRevision: 1, lanes: [],
  clientTransferMilestones: [{ key: 'rates', status: 'waiting', secret: 'never expose' }, { key: 'private_tax_route', status: 'blocked' }] },
{ audience: 'buyer' }).clientTransferMilestones, [{ key: 'rates', status: 'waiting' }])
console.log('Client transfer journey SQL, scenario parity, privacy and portal update checks passed.')
