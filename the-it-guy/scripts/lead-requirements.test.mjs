import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const migrationSql = await fs.readFile(new URL('../../supabase/migrations/202606030003_lead_requirements.sql', import.meta.url), 'utf8')

assert.match(migrationSql, /create table if not exists public\.lead_requirements/i)
for (const field of [
  'requirement_id uuid primary key default gen_random_uuid()',
  'organisation_id uuid not null references public.organisations(id)',
  'lead_id uuid not null references public.leads(lead_id)',
  'contact_id uuid references public.contacts(contact_id)',
  'property_types text[]',
  'areas text[]',
  'suburbs text[]',
  'budget_min numeric',
  'budget_max numeric',
  'consent_to_receive_matches boolean not null default false',
  'is_primary boolean not null default false',
]) {
  assert.match(migrationSql, new RegExp(field.replaceAll('(', '\\(').replaceAll(')', '\\)').replaceAll('[', '\\[').replaceAll(']', '\\]')), `migration should include ${field}`)
}

for (const status of ['active', 'paused', 'fulfilled', 'archived']) {
  assert.match(migrationSql, new RegExp(`'${status}'`), `migration should allow ${status}`)
}
for (const intent of ['buy', 'rent', 'sell', 'lease', 'invest', 'other']) {
  assert.match(migrationSql, new RegExp(`'${intent}'`), `migration should allow ${intent}`)
}
for (const indexName of [
  'lead_requirements_org_idx',
  'lead_requirements_lead_idx',
  'lead_requirements_contact_idx',
  'lead_requirements_status_idx',
  'lead_requirements_intent_type_idx',
  'lead_requirements_budget_min_idx',
  'lead_requirements_budget_max_idx',
  'lead_requirements_city_idx',
  'lead_requirements_province_idx',
  'lead_requirements_created_idx',
  'lead_requirements_areas_gin_idx',
  'lead_requirements_suburbs_gin_idx',
  'lead_requirements_property_types_gin_idx',
  'lead_requirements_must_haves_gin_idx',
  'lead_requirements_nice_to_haves_gin_idx',
  'lead_requirements_one_primary_active_idx',
]) {
  assert.match(migrationSql, new RegExp(indexName), `migration should include ${indexName}`)
}

assert.match(migrationSql, /alter table public\.lead_requirements enable row level security/i)
assert.match(migrationSql, /lead_requirements_select_member/i)
assert.match(migrationSql, /lead_requirements_insert_member/i)
assert.match(migrationSql, /lead_requirements_update_member/i)
assert.match(migrationSql, /lead_requirements_delete_member/i)
assert.match(migrationSql, /bridge_is_active_member\(organisation_id\)/i)
assert.match(migrationSql, /bridge_lead_requirement_scope_ok\(organisation_id, lead_id, contact_id\)/i)
assert.match(migrationSql, /add column if not exists requirement_id uuid references public\.lead_requirements\(requirement_id\)/i)
assert.match(migrationSql, /lead_listing_interests_requirement_idx/i)

const pageSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /Requirements/)
assert.match(pageSource, /Create structured requirement from existing lead details/)
assert.match(pageSource, /LeadRequirementsPanel/)
assert.match(pageSource, /buildRequirementSummary/)

const serviceSource = await fs.readFile(new URL('../src/services/leadRequirementService.js', import.meta.url), 'utf8')
assert.match(serviceSource, /export async function createLeadRequirement/)
assert.match(serviceSource, /export async function listLeadRequirements/)
assert.match(serviceSource, /export async function setPrimaryLeadRequirement/)
assert.match(serviceSource, /clearPrimaryRequirement/)
assert.match(serviceSource, /export async function pauseLeadRequirement/)
assert.match(serviceSource, /export async function archiveLeadRequirement/)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadRequirementServiceTestUtils } = await server.ssrLoadModule('/src/services/leadRequirementService.js')
  const {
    buildLeadRequirementPayload,
    buildRequirementFromLeadFallback,
    buildRequirementSummary,
    mapLeadRequirement,
  } = __leadRequirementServiceTestUtils

  const organisationId = '11111111-1111-4111-8111-111111111111'
  const leadId = '22222222-2222-4222-8222-222222222222'
  const contactId = '33333333-3333-4333-8333-333333333333'

  const payload = buildLeadRequirementPayload({
    organisationId,
    leadId,
    contactId,
    title: 'Family home',
    intentType: 'buy',
    propertyTypes: 'House, Townhouse',
    areas: 'Bartlett; Beyers Park',
    suburbs: ['Bartlett'],
    budgetMin: '1800000',
    budgetMax: '2200000',
    bedroomsMin: '3',
    bathroomsMin: '',
    mustHaves: 'garden, fibre',
    dealBreakers: 'main road',
    financeStatus: 'pre_approved',
    timeline: '0_3_months',
    urgency: 'high',
    consentToReceiveMatches: true,
    status: 'active',
    isPrimary: true,
  })

  assert.equal(payload.organisation_id, organisationId)
  assert.equal(payload.lead_id, leadId)
  assert.equal(payload.contact_id, contactId)
  assert.deepEqual(payload.property_types, ['House', 'Townhouse'])
  assert.deepEqual(payload.areas, ['Bartlett', 'Beyers Park'])
  assert.equal(payload.budget_min, 1800000)
  assert.equal(payload.budget_max, 2200000)
  assert.equal(payload.bathrooms_min, null, 'missing optional numeric fields should remain nullable')
  assert.equal(payload.is_primary, true)
  assert.equal(payload.consent_to_receive_matches, true)

  assert.throws(() => buildLeadRequirementPayload({ organisationId, leadId, budgetMin: 300, budgetMax: 100 }), /Budget minimum/i)

  const mapped = mapLeadRequirement({
    requirement_id: '44444444-4444-4444-8444-444444444444',
    organisation_id: organisationId,
    lead_id: leadId,
    contact_id: contactId,
    intent_type: 'not-real',
    property_types: ['house'],
    suburbs: ['Bartlett'],
    budget_max: 2200000,
    bedrooms_min: 3,
    status: 'not-real',
    finance_status: 'cash',
    consent_to_receive_matches: true,
  })
  assert.equal(mapped.intentType, 'buy', 'unknown intent should fall back without hiding the requirement')
  assert.equal(mapped.status, 'active', 'unknown status should fall back without hiding the requirement')
  assert.equal(mapped.financeStatus, 'cash')
  assert.match(buildRequirementSummary(mapped), /3-bed/)
  assert.match(buildRequirementSummary(mapped), /Bartlett/)

  const fallback = buildRequirementFromLeadFallback({
    organisationId,
    leadId,
    contactId,
    budget: 1800000,
    areaInterest: 'Bartlett, Beyers Park',
    propertyInterest: '3 bedroom townhouse near school',
  })
  assert.equal(fallback.budgetMax, 1800000)
  assert.deepEqual(fallback.areas, ['Bartlett', 'Beyers Park'])
  assert.deepEqual(fallback.propertyTypes, ['townhouse'])
  assert.match(fallback.notes, /Legacy property interest/)
} finally {
  await server.close()
}

console.log('lead requirements tests passed')
