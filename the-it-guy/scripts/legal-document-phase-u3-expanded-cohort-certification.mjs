import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { assessLegalDocumentNextExpandedCohortCertification, buildLegalDocumentNextExpandedCohortCertification } from '../src/core/documents/legalDocumentNextExpandedCohortCertification.js'
import { canonicalLegalDocumentReleaseValue } from '../src/core/documents/legalDocumentReleaseReceipt.js'

function runJson(script, timeout) {
  const run = spawnSync(process.execPath, [script], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout, maxBuffer: 30 * 1024 * 1024 })
  try { return JSON.parse(run.stdout) } catch { return { status: 'UNAVAILABLE', ready: false, blockers: [{ code: 'U3_VERIFIER_UNAVAILABLE', detail: script, solution: `Restore ${script} and rerun U3.` }], checkedAt: null, mutatedData: false } }
}

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

async function readCohortReadiness(organisationIds, pilot) {
  const checkedAt = new Date().toISOString()
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for U3.')
    if (!organisationIds.length) throw new Error('The proposed U3 cohort is empty.')
    const require = createRequire(path.resolve('package.json'))
    const { createClient } = require('@supabase/supabase-js')
    const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const [organisations, memberships, templates, preferred] = await Promise.all([
      client.from('organisations').select('id, name, type, status').in('id', organisationIds),
      client.from('organisation_users').select('organisation_id, user_id, role, workspace_role, organisation_role, app_role, status, membership_status').in('organisation_id', organisationIds),
      client.from('document_packet_templates').select('id, organisation_id, packet_type, template_format, template_storage_path, status, is_active').or(`organisation_id.is.null,organisation_id.in.(${organisationIds.join(',')})`).in('packet_type', ['otp', 'mandate']),
      client.from('organisation_preferred_partners').select('organisation_id, partner_type, company_name, email_address, is_active, is_preferred_default, is_demo_data, partner_organisation_id').in('organisation_id', organisationIds).eq('partner_type', 'transfer_attorney'),
    ])
    const failed = [organisations, memberships, templates, preferred].find((result) => result.error)
    if (failed?.error) throw failed.error
    const minimumAgents = Number(pilot.cohortPreparation?.minimumActiveAgents || 1)
    const assessments = organisationIds.map((organisationId) => {
      const organisation = (organisations.data || []).find((row) => row.id === organisationId)
      const activeAgentCount = (memberships.data || []).filter((row) => row.organisation_id === organisationId && row.user_id && ['active', 'accepted'].includes(normalize(row.membership_status || row.status)) && ['agent', 'sales_agent', 'principal', 'owner', 'admin', 'agency_admin'].includes(normalize(row.app_role || row.workspace_role || row.organisation_role || row.role))).length
      const hasTemplate = (packetType) => (templates.data || []).some((row) => (row.organisation_id === organisationId || row.organisation_id === null) && normalize(row.packet_type) === packetType && normalize(row.status) === 'published' && row.is_active !== false && (row.template_storage_path || normalize(row.template_format) === 'html'))
      const preferredTransferAttorney = (preferred.data || []).some((row) => row.organisation_id === organisationId && row.is_active !== false && row.is_preferred_default === true && row.is_demo_data !== true && (row.partner_organisation_id || (row.company_name && row.email_address)))
      const templateReadiness = { otp: hasTemplate('otp'), mandate: hasTemplate('mandate') }
      const blockers = []
      if (!organisation || normalize(organisation.type) !== 'agency' || normalize(organisation.status) !== 'active') blockers.push('AGENCY_NOT_ACTIVE')
      if (activeAgentCount < minimumAgents) blockers.push('ACTIVE_AGENT_MISSING')
      if (!templateReadiness.otp) blockers.push('OTP_TEMPLATE_MISSING')
      if (!templateReadiness.mandate) blockers.push('MANDATE_TEMPLATE_MISSING')
      if (pilot.cohortPreparation?.requirePreferredTransferAttorney !== false && !preferredTransferAttorney) blockers.push('PREFERRED_TRANSFER_ATTORNEY_MISSING')
      return { organisationId, organisationName: organisation?.name || null, activeAgentCount, templates: templateReadiness, preferredTransferAttorney, status: blockers.length ? 'NOT_READY' : 'READY', blockers }
    })
    const readyOrganisationIds = assessments.filter((row) => row.status === 'READY').map((row) => row.organisationId)
    return { status: readyOrganisationIds.length === organisationIds.length ? 'READY' : 'NOT_READY', readyOrganisationIds, assessments, checkedAt, mutatedData: false }
  } catch (error) {
    return { status: 'UNAVAILABLE', readyOrganisationIds: [], assessments: [], error: error.message, checkedAt, mutatedData: false }
  }
}

const digest = (value) => `sha256:${createHash('sha256').update(JSON.stringify(canonicalLegalDocumentReleaseValue(value))).digest('hex')}`
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const pilot = read('config/legal-document-pilot.json', {})
const pendingState = read('config/legal-document-next-pending-expansion.json', { status: 'unavailable', pending: null })
const continuationState = read('config/legal-document-expanded-cohort-continuation.json', { status: 'unavailable', record: null })
const activationState = read('config/legal-document-expansion-activation.json', { status: 'unavailable', activation: null })
const u2 = runJson('scripts/legal-document-phase-u2-verify-expansion.mjs', 120_000)
const canCertify = u2.status === 'READY_FOR_U3' && u2.ready === true && pendingState.pending?.status === 'staged'
const proposedOrganisationIds = [...new Set(pendingState.pending?.proposedOrganisationIds || [])].sort()
const cohort = canCertify ? await readCohortReadiness(proposedOrganisationIds, pilot) : { status: 'NOT_RUN', readyOrganisationIds: [], assessments: [], checkedAt: null, mutatedData: false }
const l1 = canCertify ? runJson('scripts/legal-document-phase-l1-launch-certification.mjs', 800_000) : { status: 'NOT_RUN', coverage: { otp: false, mandate: false }, checkedAt: null, mutatedData: false }
const checkedAt = new Date().toISOString()
const configuredAge = process.env.LEGAL_DOCUMENT_PHASE_U3_MAX_EVIDENCE_AGE_MINUTES
const evidenceAgeLimitMinutes = configuredAge === undefined ? 15 : Number(configuredAge)
const assessment = assessLegalDocumentNextExpandedCohortCertification({ u2, pending: pendingState.pending, continuation: continuationState.record, activation: activationState.activation, pilot, cohort, l1, now: Date.parse(checkedAt), maxEvidenceAgeMinutes: evidenceAgeLimitMinutes, digest })
const payload = assessment.ready ? buildLegalDocumentNextExpandedCohortCertification({ pending: pendingState.pending, cohort, l1, checkedAt }) : null
const certification = payload ? { ...payload, certificationDigest: digest(payload) } : null
console.log(JSON.stringify({
  phase: 'U3', status: assessment.ready ? 'READY_FOR_V1' : 'NO_GO', ready: assessment.ready,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers, certification,
  evidence: {
    u2Status: u2.status || 'UNAVAILABLE', pendingState: pendingState.status || 'UNAVAILABLE', continuationState: continuationState.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE',
    cohortStatus: cohort.status || 'UNAVAILABLE', cohortError: cohort.error || null, l1Status: l1.status || 'UNAVAILABLE',
    currentOrganisationIds: assessment.currentOrganisationIds, addedOrganisationId: assessment.addedOrganisationId, proposedOrganisationIds: assessment.proposedOrganisationIds,
    effectiveAllowlistChanged: false, runtimeActivationChanged: false,
  },
  evidenceAgeLimitMinutes: assessment.evidenceAgeLimitMinutes, checkedAt, mutatedData: false,
}, null, 2))
if (!assessment.ready) process.exitCode = 1
