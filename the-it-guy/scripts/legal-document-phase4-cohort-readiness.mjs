import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const STAGING_PROJECT_REF = 'isdowlnollckzvltkasn'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function envFile(file) {
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && line.includes('=')).map((line) => {
    const index = line.indexOf('=')
    return [line.slice(0, index), line.slice(index + 1).replace(/^["']|["']$/g, '')]
  }))
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function isActiveMembership(row) {
  return Boolean(row.user_id) && ['active', 'accepted'].includes(normalize(row.membership_status || row.status))
}

function isAgentMembership(row) {
  return ['agent', 'sales_agent', 'principal', 'owner', 'admin', 'agency_admin'].includes(normalize(row.app_role || row.workspace_role || row.organisation_role || row.role))
}

function hasUsableTemplate(templates, organisationId, packetType) {
  return templates.some((row) => (
    (row.organisation_id === organisationId || row.organisation_id === null) &&
    normalize(row.packet_type) === packetType &&
    normalize(row.status) === 'published' &&
    row.is_active !== false &&
    Boolean(row.template_storage_path || normalize(row.template_format) === 'html')
  ))
}

const config = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
const preparation = config.cohortPreparation || {}
const candidateIds = [...new Set(preparation.candidateOrganisationIds || [])]
const requiredPacketTypes = [...new Set(preparation.requiredPacketTypes || ['mandate', 'otp'])].map(normalize)
const maximum = Number(config.limits?.maxOrganisations || 5)

assert.ok(candidateIds.length, 'At least one A1 candidate organisation is required.')
assert.ok(candidateIds.every((id) => UUID_PATTERN.test(id)), 'Every A1 candidate must be a valid organisation UUID.')
assert.ok(candidateIds.length <= maximum, `A1 candidates exceed the ${maximum}-organisation safety limit.`)
assert.equal(config.enabled, false, 'A1 must not enable production document generation.')

const env = { ...envFile('.env'), ...envFile('.env.staging.local'), ...process.env }
const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
assert.ok(url.includes(STAGING_PROJECT_REF), 'Refusing cohort verification outside canonical staging.')
assert.ok(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY is required for the read-only A1 check.')

const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
const client = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

const [organisationsResult, membershipsResult, templatesResult, preferredResult, connectionsResult, legacyPartnersResult] = await Promise.all([
  client.from('organisations').select('id, name, type, status').in('id', candidateIds),
  client.from('organisation_users').select('organisation_id, user_id, role, workspace_role, organisation_role, app_role, status, membership_status').in('organisation_id', candidateIds),
  client.from('document_packet_templates').select('id, organisation_id, packet_type, template_format, template_storage_path, status, is_active').or(`organisation_id.is.null,organisation_id.in.(${candidateIds.join(',')})`).in('packet_type', requiredPacketTypes),
  client.from('organisation_preferred_partners').select('id, organisation_id, partner_type, company_name, email_address, is_active, is_preferred_default, is_demo_data, partner_organisation_id').in('organisation_id', candidateIds).eq('partner_type', 'transfer_attorney'),
  client.from('partner_connections').select('id, source_organization_id, target_organization_id, relationship_type, status, source_preferred, target_preferred').eq('relationship_type', 'agency_attorney').or(`source_organization_id.in.(${candidateIds.join(',')}),target_organization_id.in.(${candidateIds.join(',')})`),
  client.from('organisation_partners').select('id, organisation_id, partner_organisation_id, relationship_status, relationship_type').or(`organisation_id.in.(${candidateIds.join(',')}),partner_organisation_id.in.(${candidateIds.join(',')})`),
])

for (const [name, result] of Object.entries({
  organisations: organisationsResult,
  memberships: membershipsResult,
  templates: templatesResult,
  preferredPartners: preferredResult,
  partnerConnections: connectionsResult,
  legacyPartners: legacyPartnersResult,
})) assert.ifError(result.error, `${name}: ${result.error?.message || 'query failed'}`)

const linkedOrganisationIds = [...new Set([
  ...(preferredResult.data || []).map((row) => row.partner_organisation_id),
  ...(connectionsResult.data || []).flatMap((row) => [row.source_organization_id, row.target_organization_id]),
  ...(legacyPartnersResult.data || []).flatMap((row) => [row.organisation_id, row.partner_organisation_id]),
].filter((id) => id && !candidateIds.includes(id)))]
const linkedOrganisationsResult = linkedOrganisationIds.length
  ? await client.from('organisations').select('id, type, status').in('id', linkedOrganisationIds)
  : { data: [], error: null }
assert.ifError(linkedOrganisationsResult.error)
const organisationTypeById = new Map((linkedOrganisationsResult.data || []).map((row) => [row.id, normalize(row.type)]))

function hasPreferredTransferAttorney(organisationId) {
  const direct = (preferredResult.data || []).some((row) => (
    row.organisation_id === organisationId &&
    row.is_active !== false &&
    row.is_preferred_default === true &&
    row.is_demo_data !== true &&
    Boolean(row.partner_organisation_id || (row.company_name && row.email_address))
  ))
  const connected = (connectionsResult.data || []).some((row) => {
    if (normalize(row.status) !== 'connected') return false
    if (row.source_organization_id === organisationId) return row.source_preferred === true && organisationTypeById.get(row.target_organization_id) === 'attorney_firm'
    if (row.target_organization_id === organisationId) return row.target_preferred === true && organisationTypeById.get(row.source_organization_id) === 'attorney_firm'
    return false
  })
  const legacy = (legacyPartnersResult.data || []).some((row) => {
    if (normalize(row.relationship_status) !== 'accepted' || normalize(row.relationship_type) !== 'preferred') return false
    if (row.organisation_id === organisationId) return organisationTypeById.get(row.partner_organisation_id) === 'attorney_firm'
    if (row.partner_organisation_id === organisationId) return organisationTypeById.get(row.organisation_id) === 'attorney_firm'
    return false
  })
  return direct || connected || legacy
}

const organisationsById = new Map((organisationsResult.data || []).map((row) => [row.id, row]))
const assessments = candidateIds.map((organisationId) => {
  const organisation = organisationsById.get(organisationId)
  const memberships = (membershipsResult.data || []).filter((row) => row.organisation_id === organisationId)
  const activeAgents = memberships.filter((row) => isActiveMembership(row) && isAgentMembership(row)).length
  const templates = Object.fromEntries(requiredPacketTypes.map((packetType) => [packetType, hasUsableTemplate(templatesResult.data || [], organisationId, packetType)]))
  const preferredTransferAttorney = hasPreferredTransferAttorney(organisationId)
  const blockers = []
  if (!organisation) blockers.push('ORGANISATION_NOT_FOUND')
  if (organisation && (normalize(organisation.type) !== 'agency' || normalize(organisation.status) !== 'active')) blockers.push('AGENCY_NOT_ACTIVE')
  if (activeAgents < Number(preparation.minimumActiveAgents || 1)) blockers.push('ACTIVE_AGENT_MISSING')
  for (const [packetType, ready] of Object.entries(templates)) if (!ready) blockers.push(`${packetType.toUpperCase()}_TEMPLATE_MISSING`)
  if (preparation.requirePreferredTransferAttorney !== false && !preferredTransferAttorney) blockers.push('PREFERRED_TRANSFER_ATTORNEY_MISSING')
  return {
    organisationId,
    organisationName: organisation?.name || null,
    activeAgentCount: activeAgents,
    templates,
    preferredTransferAttorney,
    status: blockers.length ? 'NOT_READY' : 'READY',
    blockers,
  }
})

const readyOrganisationIds = assessments.filter((item) => item.status === 'READY').map((item) => item.organisationId)
const configuredOrganisationIds = [...new Set(config.organisationIds || [])]
const blockers = assessments.flatMap((item) => item.blockers.map((code) => ({ code, organisationId: item.organisationId })))
if (configuredOrganisationIds.some((id) => !readyOrganisationIds.includes(id))) blockers.push({ code: 'UNREADY_ORGANISATION_ALLOWLISTED' })
if (configuredOrganisationIds.some((id) => !candidateIds.includes(id))) blockers.push({ code: 'ALLOWLIST_ORGANISATION_NOT_IN_A1_COHORT' })

const report = {
  phase: 'A1',
  environment: 'staging',
  status: blockers.length ? 'NOT_READY' : 'READY',
  candidateCount: candidateIds.length,
  readyCount: readyOrganisationIds.length,
  candidateOrganisationIds: candidateIds,
  readyOrganisationIds,
  configuredOrganisationIds,
  assessments,
  blockers,
  nextAction: blockers.some((item) => item.code === 'PREFERRED_TRANSFER_ATTORNEY_MISSING')
    ? 'Designate an accepted attorney-firm relationship as preferred, then rerun this check.'
    : 'Copy readyOrganisationIds to organisationIds during Phase A2 approval; do not enable the pilot in A1.',
  checkedAt: new Date().toISOString(),
  mutatedData: false,
}

console.log(JSON.stringify(report, null, 2))
if (blockers.length) process.exitCode = 1
