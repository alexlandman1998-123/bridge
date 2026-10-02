import { DEAL_REVIEW_SECTIONS } from '../core/transactions/transactionDetailReview.js'
import { supabase } from '../lib/supabaseClient.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export async function loadImportedDealReviewStatuses({ transactionIds = [], client = supabase } = {}) {
  const ids = [...new Set(transactionIds.filter((id) => uuid.test(String(id || ''))))]
  if (!ids.length) return {}
  if (!client?.rpc) throw new Error('Import review status is unavailable. Sign in and retry.')
  const summaries = {}
  // Bound each privileged read; sequential batches avoid overwhelming the DB.
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = ids.slice(offset, offset + 200)
    const result = await client.rpc('bridge_get_imported_transaction_review_status', { p_transaction_ids: batch })
    if (result.error) throw new Error(['PGRST202', '42883'].includes(result.error.code)
      ? 'Import review status needs its database update. No deals have been marked reviewed.'
      : 'Import review status could not be checked. Reload to retry.')
    if (!Array.isArray(result.data)) throw new Error('Import review status could not be checked. Reload to retry.')
    if (result.data.some((summary) => summary.totalSections !== DEAL_REVIEW_SECTIONS.length)) throw new Error('Funding review status needs its database update. Reload after the update.')
    for (const summary of result.data) {
      if (batch.includes(summary.transactionId)) summaries[summary.transactionId] = summary
    }
  }
  return summaries
}
