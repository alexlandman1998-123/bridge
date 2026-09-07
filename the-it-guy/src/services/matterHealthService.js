import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const HEALTH_COLUMNS = 'transaction_id, overall_status, estimated_lodgement_date, estimated_registration_date, financial_summary_amount, financial_summary_label, updated_at, updated_by'

function normalizeOptionalDate(value) {
  const normalized = String(value || '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

function normalizeOptionalAmount(value) {
  if (value === '' || value === null || value === undefined) return null
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : null
}

function normalizeHealthPayload(transactionId, draft = {}) {
  return {
    transaction_id: transactionId,
    overall_status: ['healthy', 'in_progress', 'attention_required', 'at_risk', 'on_hold'].includes(draft.overallStatus)
      ? draft.overallStatus
      : 'in_progress',
    estimated_lodgement_date: normalizeOptionalDate(draft.estimatedLodgementDate),
    estimated_registration_date: normalizeOptionalDate(draft.estimatedRegistrationDate),
    financial_summary_amount: normalizeOptionalAmount(draft.financialSummaryAmount),
    financial_summary_label: String(draft.financialSummaryLabel || '').trim() || null,
  }
}

function changedFields(previous = {}, next = {}) {
  return Object.fromEntries(
    Object.entries(next)
      .filter(([key, value]) => key !== 'transaction_id' && previous[key] !== value)
      .map(([key, value]) => [key, { from: previous[key] ?? null, to: value ?? null }]),
  )
}

export async function fetchMatterHealth(transactionId) {
  if (!isSupabaseConfigured || !transactionId) return null
  const result = await supabase
    .from('transaction_matter_health')
    .select(HEALTH_COLUMNS)
    .eq('transaction_id', transactionId)
    .maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}

export async function saveMatterHealth(transactionId, draft = {}) {
  if (!isSupabaseConfigured) throw new Error('Matter Health is unavailable until Supabase is configured.')
  if (!transactionId) throw new Error('A matter is required to save Matter Health.')

  const payload = normalizeHealthPayload(transactionId, draft)
  const previous = await fetchMatterHealth(transactionId)
  const result = await supabase
    .from('transaction_matter_health')
    .upsert(payload, { onConflict: 'transaction_id' })
    .select(HEALTH_COLUMNS)
    .single()
  if (result.error) throw result.error

  const changes = changedFields(previous || {}, payload)
  if (Object.keys(changes).length) {
    const audit = await supabase.from('transaction_matter_health_audit').insert({
      transaction_id: transactionId,
      changed_fields: changes,
    })
    if (audit.error) throw audit.error
  }
  return result.data
}
