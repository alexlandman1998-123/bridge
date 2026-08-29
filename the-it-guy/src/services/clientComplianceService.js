import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getComplianceProvider } from './complianceProviderRegistry'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CHECK_ORDER = ['identity', 'address', 'sanctions', 'pep', 'risk']

function text(value) { return String(value ?? '').trim() }
function uuid(value, label) {
  const normalized = text(value)
  if (!UUID_PATTERN.test(normalized)) throw new Error(`A persisted ${label} is required for FICA verification.`)
  return normalized
}
function client() {
  if (!isSupabaseConfigured || !supabase) throw new Error('Secure compliance storage is unavailable.')
  return supabase
}

function normalizeCheck(row = {}) {
  return {
    id: text(row.id),
    type: text(row.check_type || row.type),
    status: text(row.status) || 'pending',
    result: text(row.result),
    providerCode: text(row.provider_code),
    reviewedAt: row.reviewed_at || null,
  }
}

function normalizeRun(row = {}, checks = []) {
  return {
    id: text(row.id),
    status: text(row.status) || 'not_started',
    riskRating: text(row.risk_rating) || 'unknown',
    provider: text(row.provider),
    providerReference: text(row.provider_reference),
    reportReference: text(row.report_reference),
    initiatedAt: row.initiated_at || null,
    completedAt: row.completed_at || null,
    checks: [...checks].map(normalizeCheck).sort((a, b) => CHECK_ORDER.indexOf(a.type) - CHECK_ORDER.indexOf(b.type)),
  }
}

export async function getClientComplianceVerification({ organisationId = '', clientContactId = '' } = {}) {
  const db = client()
  const orgId = uuid(organisationId, 'organisation')
  const contactId = uuid(clientContactId, 'client contact')
  const profileResult = await db.from('compliance_profiles').select('*').eq('organisation_id', orgId).eq('client_contact_id', contactId).maybeSingle()
  if (profileResult.error) throw profileResult.error
  const runResult = await db.from('compliance_verification_runs').select('*').eq('organisation_id', orgId).eq('client_contact_id', contactId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (runResult.error) throw runResult.error
  if (!runResult.data) return { profile: profileResult.data || null, run: null }
  const checksResult = await db.from('compliance_verification_checks').select('*').eq('verification_run_id', runResult.data.id)
  if (checksResult.error) throw checksResult.error
  return { profile: profileResult.data || null, run: normalizeRun(runResult.data, checksResult.data || []) }
}

export async function recordComplianceAuditEvent({ organisationId, clientContactId, runId = '', action, providerReference = '', metadata = {} } = {}) {
  const db = client()
  const result = await db.from('compliance_verification_audit_events').insert({
    organisation_id: uuid(organisationId, 'organisation'),
    client_contact_id: uuid(clientContactId, 'client contact'),
    verification_run_id: runId && UUID_PATTERN.test(runId) ? runId : null,
    action: text(action),
    provider_reference: text(providerReference) || null,
    metadata_json: metadata && typeof metadata === 'object' ? metadata : {},
  })
  if (result.error) throw result.error
}

export async function startClientComplianceVerification({ organisationId = '', clientContactId = '', entityType = 'individual', subject = {}, providerKey = 'mock', rerun = false } = {}) {
  const db = client()
  const orgId = uuid(organisationId, 'organisation')
  const contactId = uuid(clientContactId, 'client contact')
  const provider = getComplianceProvider(providerKey)
  const active = await db.from('compliance_verification_runs').select('id').eq('organisation_id', orgId).eq('client_contact_id', contactId).eq('status', 'in_progress').limit(1).maybeSingle()
  if (active.error) throw active.error
  if (active.data) throw new Error('A verification is already in progress for this client.')

  const profileResult = await db.from('compliance_profiles').upsert({
    organisation_id: orgId,
    client_contact_id: contactId,
    entity_type: text(entityType) || 'individual',
    current_status: 'in_progress',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'organisation_id,client_contact_id' }).select('*').single()
  if (profileResult.error) throw profileResult.error
  const runResult = await db.from('compliance_verification_runs').insert({
    organisation_id: orgId,
    client_contact_id: contactId,
    compliance_profile_id: profileResult.data.id,
    provider: provider.label,
    status: 'in_progress',
  }).select('*').single()
  if (runResult.error) throw runResult.error
  await recordComplianceAuditEvent({ organisationId: orgId, clientContactId: contactId, runId: runResult.data.id, action: rerun ? 'fica_verification_rerun' : 'fica_verification_initiated' })

  try {
    const result = await provider.startVerification({ subject: { ...subject, clientContactId: contactId } })
    const completedAt = result.verifiedAt || new Date().toISOString()
    const updateRun = await db.from('compliance_verification_runs').update({
      status: result.status,
      risk_rating: result.riskRating || 'unknown',
      provider_reference: result.providerReference || null,
      report_reference: result.reportReference || null,
      completed_at: completedAt,
    }).eq('id', runResult.data.id)
    if (updateRun.error) throw updateRun.error
    const checkRows = (result.checks || []).map((check) => ({ verification_run_id: runResult.data.id, check_type: check.type, status: check.status, result: check.result || null, provider_code: check.providerCode || null }))
    if (checkRows.length) {
      const checkResult = await db.from('compliance_verification_checks').insert(checkRows)
      if (checkResult.error) throw checkResult.error
    }
    const profileUpdate = await db.from('compliance_profiles').update({ current_status: result.status, current_risk_rating: result.riskRating || 'unknown', last_verified_at: completedAt, updated_at: completedAt }).eq('id', profileResult.data.id)
    if (profileUpdate.error) throw profileUpdate.error
    await recordComplianceAuditEvent({ organisationId: orgId, clientContactId: contactId, runId: runResult.data.id, action: result.status === 'verified' ? 'fica_verification_completed' : result.status === 'review_required' ? 'fica_verification_flagged_for_review' : 'fica_verification_failed', providerReference: result.providerReference })
    return normalizeRun({ ...runResult.data, ...result, provider: result.provider || provider.label, provider_reference: result.providerReference, report_reference: result.reportReference, completed_at: completedAt, risk_rating: result.riskRating }, result.checks)
  } catch (error) {
    await db.from('compliance_verification_runs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', runResult.data.id)
    await db.from('compliance_profiles').update({ current_status: 'failed', updated_at: new Date().toISOString() }).eq('id', profileResult.data.id)
    await recordComplianceAuditEvent({ organisationId: orgId, clientContactId: contactId, runId: runResult.data.id, action: 'fica_verification_failed', metadata: { message: error?.message || 'Verification failed' } }).catch(() => null)
    throw error
  }
}
