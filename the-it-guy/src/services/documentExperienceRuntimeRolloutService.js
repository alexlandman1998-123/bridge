import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'
import { resolveDocumentExperienceRuntimeRolloutAccess } from '../core/documents/documentExperienceRuntimeRolloutGate.js'

function missingRuntimeSchema(error = {}) {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return ['42883', '42p01', 'pgrst202', 'pgrst205'].includes(code) || message.includes('bridge_document_experience_runtime_access_n6')
}

export function documentExperienceRolloutEnforcementMode() {
  return String(import.meta.env?.VITE_DOCUMENT_EXPERIENCE_ROLLOUT_MODE || 'shadow').trim().toLowerCase() === 'enforced' ? 'enforced' : 'shadow'
}

export function documentExperienceRolloutEnvironment() {
  return String(import.meta.env?.VITE_DOCUMENT_EXPERIENCE_ROLLOUT_ENVIRONMENT || 'production').trim().toLowerCase() || 'production'
}

export async function fetchDocumentExperienceRuntimeRolloutAccess({ organisationId = '', environment = documentExperienceRolloutEnvironment(), enforcementMode = documentExperienceRolloutEnforcementMode(), client = supabase } = {}) {
  if (!client || (!isSupabaseConfigured && client === supabase)) return resolveDocumentExperienceRuntimeRolloutAccess({ organisationId, enforcementMode, schemaAvailable: false })
  const result = await client.rpc('bridge_document_experience_runtime_access_n6', { p_organisation_id: organisationId || null, p_environment: environment }).catch((error) => ({ error }))
  if (result.error) {
    if (missingRuntimeSchema(result.error)) return resolveDocumentExperienceRuntimeRolloutAccess({ organisationId, enforcementMode, schemaAvailable: false })
    return resolveDocumentExperienceRuntimeRolloutAccess({ organisationId, enforcementMode, schemaAvailable: true, rpcResult: { configured: true, allowed: false, reason: 'invalid_control' } })
  }
  return resolveDocumentExperienceRuntimeRolloutAccess({ organisationId, enforcementMode, schemaAvailable: true, rpcResult: result.data || {} })
}
