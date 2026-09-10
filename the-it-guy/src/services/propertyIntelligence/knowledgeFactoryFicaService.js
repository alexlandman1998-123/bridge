import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const ITEMS = ['identity', 'proof_of_address', 'source_of_funds']

function text(value) { return String(value || '').trim() }
function organisationId(value) { if (!UUID.test(text(value))) throw new Error('Select a valid organisation workspace.'); return text(value) }
function checklist(value = {}) { return Object.fromEntries(ITEMS.map((key) => [key, ['not_requested', 'requested', 'received', 'verified', 'rejected'].includes(text(value[key])) ? text(value[key]) : 'not_requested'])) }
function map(row = {}) { return { ...row, documentChecklist: checklist(row.document_checklist), consentCapturedAt: row.consent_captured_at, verificationProviderStatus: row.verification_provider_status } }

export async function listKnowledgeFactoryFicaCases({ organisationId: value } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('FICA case storage is not configured.')
  const { data, error } = await supabase.from('knowledge_factory_fica_cases').select('*').eq('organisation_id', organisationId(value)).order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'FICA cases could not be loaded.')
  return (data || []).map(map)
}

export async function createKnowledgeFactoryFicaCase({ organisationId: value, prospectId = '', subjectName, entityType = 'individual', consentVersion = 'arch9_fica_kyc_v1' } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('FICA case storage is not configured.')
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth?.user?.id
  if (!userId) throw new Error('Sign in before creating a FICA case.')
  const name = text(subjectName)
  if (name.length < 2) throw new Error('Enter the subject’s name.')
  const { data, error } = await supabase.from('knowledge_factory_fica_cases').insert({ organisation_id: organisationId(value), prospect_id: UUID.test(text(prospectId)) ? text(prospectId) : null, created_by: userId, subject_name: name, entity_type: ['individual', 'company', 'trust'].includes(text(entityType)) ? text(entityType) : 'individual', status: 'consent_captured', consent_captured_at: new Date().toISOString(), consent_captured_by: userId, consent_version: text(consentVersion), document_checklist: checklist() }).select('*').single()
  if (error || !data) throw new Error(error?.message || 'FICA case could not be created.')
  return map(data)
}

export async function updateKnowledgeFactoryFicaChecklist({ id, documentChecklist, status = 'documents_requested' } = {}) {
  if (!isSupabaseConfigured || !supabase || !UUID.test(text(id))) throw new Error('A valid FICA case is required.')
  const { data, error } = await supabase.from('knowledge_factory_fica_cases').update({ document_checklist: checklist(documentChecklist), status, updated_at: new Date().toISOString() }).eq('id', text(id)).select('*').single()
  if (error || !data) throw new Error(error?.message || 'FICA checklist could not be updated.')
  return map(data)
}
