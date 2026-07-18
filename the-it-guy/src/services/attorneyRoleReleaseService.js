import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getAttorneyRoleIntegrityReport } from './attorneyRoleIntegrityService'

export function buildAttorneyRoleReleaseDecision(integrityReport = null) {
  const gatePassed = integrityReport?.gate?.status === 'pass'
  const hasEvidence = Number(integrityReport?.summary?.rowCount || 0) > 0
  const ready = Boolean(gatePassed && hasEvidence)
  return {
    ready,
    status: ready ? 'ready_for_certification' : 'blocked',
    reason: ready
      ? 'The live Phase 8 integrity gate passed and the firm can be certified.'
      : integrityReport?.gate?.reason || 'A passing Phase 8 integrity report is required.',
    integrityReport,
    compatibilityColumnsRemoved: false,
  }
}

export async function getAttorneyRoleReleaseCertification({ firmId, client = supabase } = {}) {
  if (!isSupabaseConfigured || !client || !firmId) return null
  const result = await client
    .from('attorney_role_release_certifications')
    .select('id, firm_id, certification_version, status, integrity_row_count, integrity_snapshot, certified_by, certified_at, created_at, updated_at')
    .eq('firm_id', firmId)
    .eq('certification_version', 'phase9-v1')
    .maybeSingle()
  if (result.error) {
    const code = String(result.error.code || '').toUpperCase()
    if (['42P01', 'PGRST205'].includes(code)) return null
    throw result.error
  }
  return result.data || null
}

export async function certifyAttorneyRoleRelease({ firmId, confirm = false, client = supabase } = {}) {
  if (!firmId) throw new Error('Firm id is required.')
  const integrityReport = await getAttorneyRoleIntegrityReport({ firmId, client })
  const decision = buildAttorneyRoleReleaseDecision(integrityReport)
  if (!decision.ready || !confirm) {
    return { ...decision, certified: false, dryRun: true }
  }
  if (!isSupabaseConfigured || !client) throw new Error('Supabase is not configured.')

  const result = await client.rpc('certify_attorney_role_release_phase9', { target_firm_id: firmId })
  if (result.error) throw result.error
  return {
    ...decision,
    certified: true,
    dryRun: false,
    certification: result.data,
  }
}
