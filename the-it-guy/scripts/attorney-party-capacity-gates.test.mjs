import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveMatterScenarioProfile, partyCapacityFacts, partyCapacityCheckRequirements } from '../src/services/matterScenarioProfile.js'

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const actor = '00000000-0000-0000-0000-000000000001'
const matter = '00000000-0000-0000-0000-000000000002'
const lane = '00000000-0000-0000-0000-000000000003'
const specialistMatter = '00000000-0000-0000-0000-000000000004'
const specialistLane = '00000000-0000-0000-0000-000000000005'
const closedMatter = '00000000-0000-0000-0000-000000000006'
const closedLane = '00000000-0000-0000-0000-000000000007'
await db.exec(`
create role anon;
create role authenticated;
create schema auth;
create schema journey_private;
create function auth.uid() returns uuid language sql as $$select '${actor}'::uuid$$;
create function public.bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql as $$select true$$;
create function journey_private.withdraw_unlodged_attorney_readiness(uuid,text,text) returns void language plpgsql as $$begin return; end$$;
create table journey_private.task_catalog(lane_key text,step_key text,definition jsonb,phase_key text,phase_label text,phase_order int,task_order int,primary key(lane_key,step_key));
create table public.transactions(id uuid primary key,routing_profile_json jsonb,lifecycle_state text);
create table public.transaction_subprocesses(id uuid primary key,transaction_id uuid,process_type text);
create table public.transaction_subprocess_steps(id uuid primary key default gen_random_uuid(),subprocess_id uuid,step_key text,status text,comment text,step_label text,owner_type text,sort_order int,visibility_scope text,unique(subprocess_id,step_key));
`)
const profile = resolveMatterScenarioProfile({ parties: [
  { id: 'buyer-company', role: 'buyer', name: 'Buyer Company', entityType: 'company',
    ownershipShare: 50, taxResidence: 'south_africa',
    representatives: [{ id: 'director', name: 'Director', capacity: 'Director' }] },
  { id: 'buyer-individual', role: 'buyer', name: 'Buyer Individual', entityType: 'individual',
    ownershipShare: 50, identityRoute: 'sa_id', maritalRegime: 'single', taxResidence: 'south_africa' },
  { id: 'seller-trust', role: 'seller', name: 'Seller Trust', entityType: 'trust',
    ownershipShare: 100, taxResidence: 'south_africa',
    representatives: [{ id: 'trustee', name: 'Trustee', capacity: 'Trustee' }] },
] })
await db.query('insert into public.transactions(id,routing_profile_json) values ($1,$2)', [matter, {
  scenarioProfile: profile,
  workflowPlan: { status: 'active', version: 'attorney_matter_workflow_plan_v10', lanes: [
    { laneKey: 'transfer', taskCount: 6, stepKeys: [
      'buyer_fica_review', 'seller_fica_review', 'buyer_signing_review',
      'seller_signing_review', 'lodgement_ready', 'lodged_at_deeds_office',
    ] },
  ] },
}])
await db.query('insert into public.transaction_subprocesses values ($1,$2,$3)', [lane, matter, 'transfer'])
const specialistProfile = resolveMatterScenarioProfile({ parties: [
  { id: 'estate', role: 'seller', name: 'Estate', entityType: 'estate', ownershipShare: 100 },
  { id: 'buyer', role: 'buyer', name: 'Buyer', entityType: 'individual', ownershipShare: 100 },
] })
await db.query('insert into public.transactions(id,routing_profile_json) values ($1,$2)', [specialistMatter, {
  scenarioProfile: specialistProfile,
  workflowPlan: { status: 'active', lanes: [{ laneKey: 'transfer', taskCount: 1, stepKeys: ['buyer_fica_review'] }] },
}])
await db.query('insert into public.transaction_subprocesses values ($1,$2,$3)', [specialistLane, specialistMatter, 'transfer'])
await db.query('insert into public.transactions(id,routing_profile_json,lifecycle_state) values ($1,$2,$3)', [
  closedMatter,
  { scenarioProfile: specialistProfile, workflowPlan: { status: 'active', lanes: [
    { laneKey: 'transfer', taskCount: 1, stepKeys: ['buyer_fica_review'] },
  ] } },
  'registered',
])
await db.query('insert into public.transaction_subprocesses values ($1,$2,$3)', [closedLane, closedMatter, 'transfer'])
const keys = [
  'buyer_fica_review', 'seller_fica_review', 'buyer_party_capacity_review',
  'seller_party_capacity_review', 'buyer_signing_review', 'seller_signing_review',
  'lodgement_ready', 'lodged_at_deeds_office',
]
for (const [index, key] of keys.entries()) await db.query(
  'insert into public.transaction_subprocess_steps(id,subprocess_id,step_key,status,comment) values ($1,$2,$3,$4,$5)',
  [`00000000-0000-0000-0000-${String(index + 10).padStart(12, '0')}`, lane, key, 'not_started', null],
)
await db.exec(readFileSync(new URL('../../supabase/migrations/20260926135022_attorney_phase2_party_capacity.sql', import.meta.url), 'utf8'))
const catalog = await db.query("select count(*)::int as count from journey_private.task_catalog where lane_key='transfer'")
assert.equal(catalog.rows[0].count, 3)
const routing = (await db.query('select routing_profile_json from public.transactions where id=$1', [matter])).rows[0].routing_profile_json
assert.deepEqual(routing.workflowPlan.lanes[0].stepKeys.slice(0, 4), [
  'buyer_fica_review', 'seller_fica_review', 'buyer_party_capacity_review', 'seller_party_capacity_review',
])
assert.equal(routing.workflowPlan.lanes[0].taskCount, 8)
const specialistRouting = (await db.query('select routing_profile_json from public.transactions where id=$1', [specialistMatter])).rows[0].routing_profile_json
assert.ok(specialistRouting.workflowPlan.lanes[0].stepKeys.includes('party_capacity_specialist_review'))
const closedRouting = (await db.query('select routing_profile_json from public.transactions where id=$1', [closedMatter])).rows[0].routing_profile_json
assert.deepEqual(closedRouting.workflowPlan.lanes[0].stepKeys, ['buyer_fica_review'])
await assert.rejects(
  db.query("update public.transaction_subprocess_steps set status='completed' where subprocess_id=$1 and step_key='party_capacity_specialist_review'", [specialistLane]),
  /specialist hold/,
)
const complete = key => db.query(
  "update public.transaction_subprocess_steps set status='completed',comment='Attorney reviewed the current evidence.' where subprocess_id=$1 and step_key=$2",
  [lane, key],
)
await assert.rejects(complete('buyer_signing_review'), /current attorney capacity decision/)
const cleared = structuredClone(profile)
for (const party of cleared.parties) party.capacityReview = {
  status: 'cleared', note: 'Identity, beneficial ownership, entity authority and named signatories reviewed.',
  confirmations: Object.fromEntries(partyCapacityCheckRequirements(party).map(check => [check.key, true])),
  reviewedBy: actor, reviewedAt: '2026-09-26T12:00:00Z', reviewedFacts: partyCapacityFacts(party),
}
const missingCheck = structuredClone(cleared)
missingCheck.parties[0].capacityReview.confirmations.beneficial_ownership = false
await db.query('update public.transactions set routing_profile_json=$1 where id=$2', [{ ...routing, scenarioProfile: missingCheck }, matter])
await assert.rejects(complete('buyer_party_capacity_review'), /beneficial_ownership/)
const missingParty = structuredClone(cleared)
missingParty.parties[1].capacityReview.status = 'pending'
await db.query('update public.transactions set routing_profile_json=$1 where id=$2', [{ ...routing, scenarioProfile: missingParty }, matter])
await assert.rejects(complete('buyer_party_capacity_review'), /Buyer Individual/)
await db.query('update public.transactions set routing_profile_json=$1 where id=$2', [{ ...routing, scenarioProfile: cleared }, matter])
const forged = structuredClone(cleared)
forged.parties[0].capacityReview.reviewedBy = '00000000-0000-0000-0000-000000000099'
await assert.rejects(
  db.query('update public.transactions set routing_profile_json=$1 where id=$2', [{ ...routing, scenarioProfile: forged }, matter]),
  /Only the assigned transfer attorney/,
)
await complete('buyer_party_capacity_review')
await assert.rejects(complete('buyer_signing_review'), /buyer_fica_review/)
await complete('buyer_fica_review')
await complete('buyer_signing_review')
await complete('seller_fica_review')
await complete('seller_party_capacity_review')
await complete('seller_signing_review')
await complete('lodgement_ready')
const changed = structuredClone(cleared)
changed.parties[0].representatives[0].name = 'Replacement Director'
await db.query('update public.transactions set routing_profile_json=$1 where id=$2', [{ ...routing, scenarioProfile: changed }, matter])
await assert.rejects(complete('lodged_at_deeds_office'), /current attorney capacity decision/)
await assert.rejects(
  db.query("update public.transaction_subprocess_steps set status='not_applicable' where subprocess_id=$1 and step_key='buyer_party_capacity_review'", [lane]),
  /Party capacity and signing require attorney-reviewed completion/,
)
await db.close()
console.log('Party capacity gates passed: mixed buyers, company/trust decisions, FICA/signing sequence, stale signatories, and outcome restrictions.')
