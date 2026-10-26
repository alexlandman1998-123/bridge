import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  loadJustListedChoices,
  loadJustListedSource,
} from './justListedCampaignService'

// The RPC exposes only references, public areas and listing IDs under existing RLS.
// Client identities, addresses, financial values and transaction documents stay out.
export async function loadHandoverContext(
  organisationId,
  userId,
  details = {},
) {
  if (!organisationId || !isSupabaseConfigured || !supabase)
    throw new Error('Choose a connected agency workspace.')
  const auth = await supabase.auth.getUser()
  if (auth.error || auth.data?.user?.id !== userId)
    throw new Error('Your account changed. Reopen campaigns.')
  const rows = []
  for (let offset = 0; ; offset += 200) {
    const result = await supabase.rpc('marketing_handover_choices', {
      p_organisation_id: organisationId,
      p_offset: offset,
    })
    if (result.error)
      throw new Error(
        'Unable to load permitted completed transactions. Try again.',
      )
    rows.push(...(result.data || []))
    if ((result.data || []).length < 200) break
    if (offset >= 10000)
      throw new Error(
        'Too many completed transactions to load. Ask your agency administrator to review access.',
      )
  }
  const transactions = rows.map((row) => ({
    id: row.id,
    reference: row.reference || 'Completed transaction',
    area: row.area || '',
    listingId: row.listing_id || '',
  }))
  const transaction =
    transactions.find((row) => row.id === details.transactionId) || null
  let images = [],
    notice =
      details.transactionId && !transaction
        ? 'This completed transaction is no longer available to you. Choose another transaction.'
        : ''
  if (transaction?.listingId) {
    try {
      const choices = await loadJustListedChoices(
        organisationId,
        userId,
        'just-sold',
      )
      const listing = await loadJustListedSource(
        organisationId,
        userId,
        transaction.listingId,
        choices,
        'just-sold',
      )
      images = listing.images || []
    } catch {
      notice = details.imageId
        ? 'The selected handover photo is no longer available. Choose agency branding or an approved photo.'
        : 'Listing photos are unavailable. You can use agency branding.'
    }
  }
  return { transactions, transaction, images, notice }
}
