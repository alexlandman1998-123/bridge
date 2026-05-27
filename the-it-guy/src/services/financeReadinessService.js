import {
  buildFinanceReadinessPayload,
  calculateAffordabilityEstimate,
  calculateFinanceReadinessScore,
  FINANCE_READINESS_DISCLAIMER,
  getFinanceReadinessAnalytics,
  getFinanceReadinessSummary,
  shouldShowBondReadinessCta,
  shouldShowFinanceReadinessSection,
} from '../core/finance/financeReadinessSelectors'
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function text(value) {
  return String(value || '').trim()
}

function normalizePurchaserType(value = 'individual') {
  const normalized = text(value).toLowerCase()
  if (normalized === 'company' || normalized === 'trust' || normalized === 'joint') return normalized
  return 'individual'
}

export {
  buildFinanceReadinessPayload,
  calculateAffordabilityEstimate,
  calculateFinanceReadinessScore,
  FINANCE_READINESS_DISCLAIMER,
  getFinanceReadinessAnalytics,
  getFinanceReadinessSummary,
  shouldShowBondReadinessCta,
  shouldShowFinanceReadinessSection,
}

export async function saveFinanceReadinessDraft({
  transactionId = '',
  purchaserType = 'individual',
  input = {},
  existingFormData = {},
} = {}) {
  const scopedTransactionId = text(transactionId)
  if (!scopedTransactionId) {
    throw new Error('A linked transaction is required before saving finance readiness.')
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required before saving finance readiness.')
  }

  const normalizedType = normalizePurchaserType(purchaserType)
  const formData = buildFinanceReadinessPayload(input, existingFormData || {})
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('onboarding_form_data')
    .upsert({
      transaction_id: scopedTransactionId,
      purchaser_type: normalizedType,
      form_data: formData,
      updated_at: now,
    }, { onConflict: 'transaction_id' })
    .select('id, transaction_id, purchaser_type, form_data, updated_at')
    .maybeSingle()

  if (error) {
    throw error
  }

  const financeReadiness = formData.finance_readiness || {}
  await supabase
    .from('transaction_finance_details')
    .upsert({
      transaction_id: scopedTransactionId,
      affordability_estimate: financeReadiness.affordability_estimate || null,
      repayment_estimate: financeReadiness.repayment_estimate || null,
      readiness_score: financeReadiness.readiness_score || null,
      risk_flags: financeReadiness.risk_flags || [],
      updated_at: now,
    }, { onConflict: 'transaction_id' })
    .then(({ error: financeError }) => {
      if (financeError && !/schema cache|does not exist|not found/i.test(String(financeError.message || financeError.details || ''))) {
        throw financeError
      }
      return null
    })

  return data || {
    transaction_id: scopedTransactionId,
    purchaser_type: normalizedType,
    form_data: formData,
    updated_at: now,
  }
}

