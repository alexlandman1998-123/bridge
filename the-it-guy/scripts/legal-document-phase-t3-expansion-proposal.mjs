import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { assessLegalDocumentNextExpansionProposal } from '../src/core/documents/legalDocumentNextExpansionProposal.js'

const run = spawnSync(process.execPath, ['scripts/legal-document-phase-t2-soak-gate.mjs'], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 500_000, maxBuffer: 20 * 1024 * 1024 })
let t2
try { t2 = JSON.parse(run.stdout) } catch { t2 = { status: 'UNAVAILABLE', ready: false, mutatedData: false } }
const pilot = JSON.parse(fs.readFileSync('config/legal-document-pilot.json', 'utf8'))
let continuationState
let activationState
try { continuationState = JSON.parse(fs.readFileSync('config/legal-document-expanded-cohort-continuation.json', 'utf8')) } catch { continuationState = { status: 'unavailable', record: null } }
try { activationState = JSON.parse(fs.readFileSync('config/legal-document-expansion-activation.json', 'utf8')) } catch { activationState = { status: 'unavailable', activation: null } }
const record = continuationState.record
const activation = activationState.activation
let candidates = []
let storeAvailable = true
let storeError = null

if (t2.status === 'READY_FOR_T3' && record?.status === 'continued' && activation?.status === 'activated') {
  try {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
    if (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase URL and service role key are required for T3.')
    const candidateIds = [...new Set(pilot.cohortPreparation?.candidateOrganisationIds || [])].filter((id) => !(record.releaseTarget?.organisationIds || []).includes(id))
    if (candidateIds.length) {
      const require = createRequire(path.resolve('package.json'))
      const { createClient } = require('@supabase/supabase-js')
      const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      const [organisations, memberships, templates, preferred] = await Promise.all([
        client.from('organisations').select('id, name, type, status').in('id', candidateIds),
        client.from('organisation_users').select('organisation_id, user_id, role, workspace_role, organisation_role, app_role, status, membership_status').in('organisation_id', candidateIds),
        client.from('document_packet_templates').select('id, organisation_id, packet_type, template_format, template_storage_path, status, is_active').or(`organisation_id.is.null,organisation_id.in.(${candidateIds.join(',')})`).in('packet_type', ['otp', 'mandate']),
        client.from('organisation_preferred_partners').select('organisation_id, partner_type, company_name, email_address, is_active, is_preferred_default, is_demo_data, partner_organisation_id').in('organisation_id', candidateIds).eq('partner_type', 'transfer_attorney'),
      ])
      const error = [organisations, memberships, templates, preferred].find((result) => result.error)?.error
      if (error) throw error
      const normalize = (value) => String(value || '').trim().toLowerCase()
      candidates = candidateIds.map((organisationId) => {
        const organisation = (organisations.data || []).find((row) => row.id === organisationId)
        const activeAgents = (memberships.data || []).filter((row) => row.organisation_id === organisationId && row.user_id && ['active', 'accepted'].includes(normalize(row.membership_status || row.status)) && ['agent', 'sales_agent', 'principal', 'owner', 'admin', 'agency_admin'].includes(normalize(row.app_role || row.workspace_role || row.organisation_role || row.role))).length
        const hasTemplate = (type) => (templates.data || []).some((row) => (row.organisation_id === organisationId || row.organisation_id === null) && normalize(row.packet_type) === type && normalize(row.status) === 'published' && row.is_active !== false && (row.template_storage_path || normalize(row.template_format) === 'html'))
        const hasAttorney = (preferred.data || []).some((row) => row.organisation_id === organisationId && row.is_active !== false && row.is_preferred_default === true && row.is_demo_data !== true && (row.partner_organisation_id || (row.company_name && row.email_address)))
        const blockers = []
        if (!organisation || normalize(organisation.type) !== 'agency' || normalize(organisation.status) !== 'active') blockers.push('AGENCY_NOT_ACTIVE')
        if (activeAgents < Number(pilot.cohortPreparation?.minimumActiveAgents || 1)) blockers.push('ACTIVE_AGENT_MISSING')
        if (!hasTemplate('otp')) blockers.push('OTP_TEMPLATE_MISSING')
        if (!hasTemplate('mandate')) blockers.push('MANDATE_TEMPLATE_MISSING')
        if (pilot.cohortPreparation?.requirePreferredTransferAttorney !== false && !hasAttorney) blockers.push('PREFERRED_TRANSFER_ATTORNEY_MISSING')
        return { organisationId, organisationName: organisation?.name || null, activeAgentCount: activeAgents, status: blockers.length ? 'NOT_READY' : 'READY', blockers }
      })
    }
  } catch (error) {
    storeAvailable = false
    storeError = error.message
  }
}

const assessment = assessLegalDocumentNextExpansionProposal({ t2, record, activation, pilot, candidates, storeAvailable })
console.log(JSON.stringify({
  phase: 'T3', status: assessment.status, ready: assessment.ready,
  blockerCount: assessment.blockers.length, blockers: assessment.blockers, proposal: assessment.proposal,
  candidateAssessments: candidates,
  evidence: { t2Status: t2.status || 'UNAVAILABLE', continuationState: continuationState.status || 'UNAVAILABLE', activationState: activationState.status || 'UNAVAILABLE', storeAvailable, storeError },
  checkedAt: new Date().toISOString(), mutatedData: false,
}, null, 2))
if (!assessment.ready && assessment.status !== 'ROLLOUT_LIMIT_REACHED') process.exitCode = 1
