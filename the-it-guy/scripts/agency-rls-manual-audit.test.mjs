import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)
const repoRoot = new URL('../../', import.meta.url)

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function readAppFile(relativePath) {
  return readFile(new URL(relativePath, appRoot), 'utf8')
}

async function readRepoFile(relativePath) {
  return readFile(new URL(relativePath, repoRoot), 'utf8')
}

function assertIncludes(source, marker, context) {
  assert.ok(source.includes(marker), `${context} is missing "${marker}"`)
}

function assertMatches(source, pattern, context) {
  assert.match(source, pattern, context)
}

function assertIncludesAll(source, markers, context) {
  for (const marker of markers) assertIncludes(source, marker, context)
}

function assertMatchesAll(source, patterns, context) {
  for (const pattern of patterns) assertMatches(source, pattern, context)
}

function assertTableRls(source, table, context) {
  assertMatches(
    source,
    new RegExp(`alter\\s+table(?:\\s+if\\s+exists)?\\s+public\\.${escapeRegExp(table)}\\s+enable\\s+row\\s+level\\s+security`, 'i'),
    `${context}: ${table} must enable row level security`,
  )
}

function getPolicyBlock(source, table, policyName, context) {
  const createPattern = new RegExp(`create\\s+policy\\s+${escapeRegExp(policyName)}\\b`, 'i')
  const createMatch = createPattern.exec(source)
  assert.ok(createMatch, `${context}: missing policy ${policyName}`)

  const rest = source.slice(createMatch.index)
  const afterPolicyName = rest.slice(createMatch[0].length)
  const nextStatement = /\n(?:drop\s+policy|create\s+policy|grant\b|alter\s+table\b|commit\b)/i.exec(afterPolicyName)
  const block = nextStatement ? rest.slice(0, createMatch[0].length + nextStatement.index) : rest

  assertMatches(
    block,
    new RegExp(`on\\s+public\\.${escapeRegExp(table)}\\b`, 'i'),
    `${context}: policy ${policyName} must target public.${table}`,
  )

  return block
}

function assertPolicy(source, table, policyName, requiredMarkers, context) {
  const block = getPolicyBlock(source, table, policyName, context)
  for (const marker of requiredMarkers) {
    if (marker instanceof RegExp) assertMatches(block, marker, `${context}: policy ${policyName} is missing ${marker}`)
    else assertIncludes(block, marker, `${context}: policy ${policyName}`)
  }
}

function assertMembershipPolicies(source, table, policyNames, context, extraMarkers = []) {
  assertTableRls(source, table, context)
  for (const policyName of policyNames) {
    assertPolicy(source, table, policyName, ['bridge_is_active_member(organisation_id)', ...extraMarkers], context)
  }
}

async function auditPackageScripts() {
  const packageJson = JSON.parse(await readAppFile('package.json'))
  const scripts = packageJson.scripts || {}

  assertIncludesAll(Object.keys(scripts).join('\n'), [
    'test:agency-workflow-smoke',
    'test:agency-browser-smoke',
    'test:agency-full-smoke',
    'test:agency-runtime-isolation',
    'test:agency-rls-manual-audit',
    'test:agency-runtime-readiness',
  ], 'Agency smoke scripts')
}

async function auditLeadRlsMigrations() {
  const ingestion = await readRepoFile('supabase/migrations/202606030004_lead_ingestion_logs.sql')
  assertIncludesAll(ingestion, [
    'create table if not exists public.lead_ingestion_logs',
    'organisation_id uuid not null',
    'payload jsonb not null',
    'lead_id uuid references public.leads',
    'contact_id uuid references public.contacts',
    "status in ('new', 'assigned', 'processed', 'duplicate', 'failed')",
  ], 'Lead ingestion log schema')
  assertMembershipPolicies(ingestion, 'lead_ingestion_logs', [
    'lead_ingestion_logs_select_member',
    'lead_ingestion_logs_insert_member',
    'lead_ingestion_logs_update_member',
    'lead_ingestion_logs_delete_member',
  ], 'Lead ingestion log RLS')

  const assignment = await readRepoFile('supabase/migrations/202606030006_lead_assignment_routing.sql')
  assertIncludesAll(assignment, [
    'add column if not exists assigned_queue_id text',
    'add column if not exists first_contacted_at timestamptz',
    "ownership_status in (",
    "'awaiting_assignment'",
    "'assigned'",
    "'contacted'",
    'create table if not exists public.lead_assignment_history',
    "assignment_source text not null default 'manual'",
  ], 'Lead assignment schema')
  assertMembershipPolicies(assignment, 'lead_assignment_history', [
    'lead_assignment_history_select_member',
    'lead_assignment_history_insert_member',
    'lead_assignment_history_update_member',
  ], 'Lead assignment history RLS')

  const communication = await readRepoFile('supabase/migrations/202606030007_lead_communication_events.sql')
  assertIncludesAll(communication, [
    'create table if not exists public.lead_communication_events',
    'lead_id uuid not null references public.leads',
    'contact_id uuid references public.contacts',
    'communication_type text not null',
    'direction text not null',
    'message text',
    'summary text',
  ], 'Lead communication schema')
  assertMembershipPolicies(communication, 'lead_communication_events', [
    'lead_communication_events_select_member',
    'lead_communication_events_insert_member',
    'lead_communication_events_update_member',
  ], 'Lead communication RLS')
  assertPolicy(communication, 'lead_communication_events', 'lead_communication_events_insert_member', [
    'from public.leads l',
    'from public.contacts c',
    'lead_communication_events.organisation_id',
  ], 'Lead communication insert scope')
  assertPolicy(communication, 'lead_communication_events', 'lead_communication_events_update_member', [
    'from public.leads l',
    'from public.contacts c',
    'lead_communication_events.organisation_id',
  ], 'Lead communication update scope')

  const requirements = await readRepoFile('supabase/migrations/202606030003_lead_requirements.sql')
  assertIncludesAll(requirements, [
    'create table if not exists public.lead_requirements',
    'budget_min numeric',
    'budget_max numeric',
    'areas text[]',
    'finance_status text',
    'timeline text',
    'notes text',
    "status in ('active', 'paused', 'fulfilled', 'archived')",
    'create or replace function public.bridge_lead_requirement_scope_ok',
  ], 'Lead requirements schema')
  assertMembershipPolicies(requirements, 'lead_requirements', [
    'lead_requirements_select_member',
    'lead_requirements_insert_member',
    'lead_requirements_update_member',
    'lead_requirements_delete_member',
  ], 'Lead requirements RLS', ['bridge_lead_requirement_scope_ok(organisation_id, lead_id, contact_id)'])

  const interests = await readRepoFile('supabase/migrations/202606030002_lead_listing_interests.sql')
  assertIncludesAll(interests, [
    'create table if not exists public.lead_listing_interests',
    'listing_id uuid not null references public.private_listings',
    "status in (",
    "'shortlisted'",
    "'viewing_scheduled'",
    "'offer_submitted'",
    "'converted'",
    'create or replace function public.bridge_lead_listing_interest_scope_ok',
  ], 'Lead listing interest schema')
  assertMembershipPolicies(interests, 'lead_listing_interests', [
    'lead_listing_interests_select_member',
    'lead_listing_interests_insert_member',
    'lead_listing_interests_update_member',
    'lead_listing_interests_delete_member',
  ], 'Lead listing interest RLS', ['bridge_lead_listing_interest_scope_ok(organisation_id, lead_id, listing_id, contact_id)'])

  const savedSearches = await readRepoFile('supabase/migrations/202606030010_lead_saved_searches.sql')
  assertIncludesAll(savedSearches, [
    'create table if not exists public.lead_saved_searches',
    'requirement_id uuid references public.lead_requirements',
    'consent_given boolean not null default false',
    "frequency in ('daily', 'weekly', 'manual_only')",
  ], 'Lead saved search schema')
  assertMembershipPolicies(savedSearches, 'lead_saved_searches', [
    'lead_saved_searches_select_member',
    'lead_saved_searches_insert_member',
    'lead_saved_searches_update_member',
  ], 'Lead saved search RLS')
  assertPolicy(savedSearches, 'lead_saved_searches', 'lead_saved_searches_insert_member', [
    'from public.leads l',
    'from public.lead_requirements lr',
    'lead_saved_searches.organisation_id',
  ], 'Lead saved search insert scope')
}

async function auditListingRlsMigrations() {
  const distribution = await readRepoFile('supabase/migrations/202606030001_listing_distribution_workspace.sql')
  assertIncludesAll(distribution, [
    'create table if not exists public.listing_publication_data',
    'create table if not exists public.listing_media',
    'create table if not exists public.listing_external_links',
    'description text',
    'features jsonb not null',
    'file_url text not null',
    'platform text not null',
    'visible_to_seller boolean not null default false',
  ], 'Listing distribution schema')

  for (const table of ['listing_publication_data', 'listing_media', 'listing_external_links']) {
    assertTableRls(distribution, table, 'Listing distribution RLS')
    assertPolicy(distribution, table, `${table}_member_access`, [
      'from public.private_listings listing',
      'join public.organisation_users member',
      'member.user_id = auth.uid()',
      /with\s+check/i,
    ], `Listing distribution ${table} access`)
  }

  const listingAccess = await readRepoFile('supabase/migrations/202606170001_private_listing_document_member_access.sql')
  assertIncludesAll(listingAccess, [
    'create or replace function public.bridge_can_access_private_listing',
    'public.bridge_is_active_member(listing.organisation_id)',
    'public.bridge_is_org_admin(listing.organisation_id)',
    'listing.assigned_agent_id = auth.uid()',
    'public.bridge_support_can_access_record',
  ], 'Private listing access helper')

  const privateListingBaseRls = await readRepoFile('supabase/migrations/202606090009_support_role_asset_rls.sql')
  assertTableRls(privateListingBaseRls, 'private_listings', 'Private listing base RLS')

  const privateListingPolicies = await readRepoFile('supabase/migrations/202606090010_created_by_access_remediation.sql')
  assertPolicy(privateListingPolicies, 'private_listings', 'private_listings_support_role_select', [
    'bridge_can_access_private_listing(id)',
  ], 'Private listing select access')
  assertPolicy(privateListingPolicies, 'private_listings', 'private_listings_support_role_update', [
    'bridge_can_access_private_listing(id)',
    /with\s+check/i,
  ], 'Private listing update access')
  assertPolicy(privateListingPolicies, 'private_listings', 'private_listings_delete_member_owner', [
    'bridge_is_active_member(organisation_id)',
    'bridge_is_org_admin(organisation_id)',
    'assigned_agent_id = auth.uid()',
  ], 'Private listing delete access')

  const externalIsolation = await readRepoFile('supabase/migrations/202607090006_private_listing_external_isolation.sql')
  assertIncludesAll(externalIsolation, [
    'from pg_policies',
    "tablename = 'private_listings'",
    "drop policy if exists %I on public.private_listings",
    'private_listings_select_scoped',
    'using (public.bridge_can_access_private_listing(id))',
    'private_listings_insert_member',
    'with check (public.bridge_is_active_member(organisation_id))',
    'private_listings_update_scoped',
    'private_listings_delete_owner_or_admin',
    'or created_by = auth.uid()',
  ], 'Private listing external isolation hardening')

  const mandateAlignment = await readRepoFile('supabase/migrations/202607090007_private_listing_mandate_status_alignment.sql')
  assertIncludesAll(mandateAlignment, [
    'private_listings_mandate_status_check',
    "'signed_uploaded'",
    "'signed_external_pending_upload'",
    "'expired'",
  ], 'Private listing mandate status alignment')
}

async function auditAgencyTaskRlsMigration() {
  const tasks = await readRepoFile('supabase/migrations/202607090001_agency_tasks_foundation.sql')
  assertIncludesAll(tasks, [
    'create table if not exists public.tasks',
    'lead_id uuid references public.leads',
    'transaction_id uuid references public.transactions',
    'assigned_agent_id uuid references auth.users',
    'due_date date',
    'metadata jsonb not null',
    'create or replace function public.bridge_delete_agency_lead',
    'if not public.bridge_is_active_member(p_organisation_id)',
  ], 'Agency task/delete foundation schema')
  assertMembershipPolicies(tasks, 'tasks', [
    'tasks_org_members_select',
    'tasks_org_members_insert',
    'tasks_org_members_update',
    'tasks_org_members_delete',
  ], 'Agency task RLS')
}

async function auditManualLeadInterventionUi() {
  const leadsPage = await readAppFile('src/pages/AgentLeadsPage.jsx')
  assertIncludesAll(leadsPage, [
    'Buyer Leads',
    'Seller Leads',
    'Import Leads',
    'Lead Type',
    'Buyer Lead',
    'Seller Lead',
    'Budget',
    'Area interest',
    'Mark Reached Out',
    'markBuyerReachedOut',
    'Review Requirements',
    'LeadRequirementsPanel',
    'Add Saved Search',
    'Add to Shortlist',
    'Shortlist / Interested Listings',
    'Capture Manual Offer',
    'Manage Assignment',
    'Archive lead',
    'Save overrides',
    'Edit submitted details',
    'Complete onboarding',
    'Generate Mandate',
    'seller_onboarding_overrides_saved',
    'updatePrivateListingOnboardingFormData',
    'updateAgencyCrmLeadRecord',
    'Create or link a seller listing before sending onboarding.',
    'Create or link a seller listing before completing seller onboarding.',
  ], 'Lead page manual intervention coverage')
}

async function auditManualListingInterventionUi() {
  const listingsPage = await readAppFile('src/pages/AgentListings.jsx')
  assertIncludesAll(listingsPage, [
    'Quick Add Listing',
    'Quick Add is for manual or external listings.',
    'manual_admin_capture',
    'manualMandateStatus',
    'Signed manually, upload later',
    'Generate Mandate',
    'Property24 / external listing link',
    'Add seller contact',
    'Add seller ID / registration number',
    'Add seller FICA',
    'Upload signed mandate',
    'Confirm commission',
    'Add photos',
    'Add external listing link',
    'Listing follow-ups',
    'Create Listing',
    'Save Seller Lead & Send Onboarding',
    'updatePrivateListing',
    'uploadPrivateListingDocument',
  ], 'Listing page manual intervention coverage')

  const listingDetail = await readAppFile('src/pages/AgentListingDetail.jsx')
  assertIncludesAll(listingDetail, [
    'Add seller contact',
    'Add seller ID / registration number',
    'Add seller FICA',
    'Open Mandate',
    'Generate Mandate',
    'Upload signed mandate',
    'Signed manually',
    'Confirm commission',
    'Add photos',
    'Add external listing link',
    'updatePrivateListing',
    'Seller onboarding link copied. Add seller contact details before sending it directly.',
  ], 'Listing detail manual intervention coverage')

  const sellerReadiness = await readAppFile('src/services/sellerReadinessService.js')
  assertIncludesAll(sellerReadiness, [
    'generate_mandate',
    'Mandate Not Generated',
    'Required Documents Missing',
  ], 'Seller readiness manual action coverage')
}

async function auditManualServiceInterventionPlumbing() {
  const assignment = await readAppFile('src/services/leadAssignmentService.js')
  assertIncludesAll(assignment, [
    'recordAssignmentHistory',
    ".from('lead_assignment_history')",
    "assignmentSource: 'manual_agent'",
    "assignmentSource: 'manual_queue'",
    'markLeadFirstContacted',
    'listLeadAssignmentHistory',
  ], 'Lead assignment manual service plumbing')

  const communication = await readAppFile('src/services/leadCommunicationService.js')
  assertIncludesAll(communication, [
    'createCommunicationEvent',
    'listLeadCommunications',
    ".from('lead_communication_events')",
    'mirrorActivity',
  ], 'Lead communication service plumbing')

  const requirements = await readAppFile('src/services/leadRequirementService.js')
  assertIncludesAll(requirements, [
    'createLeadRequirement',
    'updateLeadRequirement',
    'archiveLeadRequirement',
    'pauseLeadRequirement',
    ".from('lead_requirements')",
  ], 'Lead requirement service plumbing')

  const interests = await readAppFile('src/services/leadListingInterestService.js')
  assertIncludesAll(interests, [
    'createLeadListingInterest',
    'updateLeadListingInterestStatus',
    'updateLeadListingInterestNotes',
    ".from('lead_listing_interests')",
    "status: 'viewing_scheduled'",
  ], 'Lead listing interest service plumbing')

  const propertySharing = await readAppFile('src/services/leadPropertySharingService.js')
  assertIncludesAll(propertySharing, [
    'createLeadSavedSearch',
    'updateLeadSavedSearch',
    ".from('lead_saved_searches')",
  ], 'Lead property sharing service plumbing')
}

async function main() {
  const audits = [
    ['package scripts', auditPackageScripts],
    ['lead RLS migrations', auditLeadRlsMigrations],
    ['listing RLS migrations', auditListingRlsMigrations],
    ['agency task/delete RLS migration', auditAgencyTaskRlsMigration],
    ['lead manual intervention UI', auditManualLeadInterventionUi],
    ['listing manual intervention UI', auditManualListingInterventionUi],
    ['manual service intervention plumbing', auditManualServiceInterventionPlumbing],
  ]

  for (const [label, run] of audits) {
    await run()
    console.log(`ok - ${label}`)
  }

  console.log(`agency RLS/manual intervention audit passed (${audits.length} groups)`)
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error)
  process.exitCode = 1
})
