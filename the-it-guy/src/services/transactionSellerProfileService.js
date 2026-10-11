import { supabase } from '../lib/supabaseClient.js'
import { buildListingSellerInformationModel } from './listings/listingSellerInformationModel.js'
import { transactionSellerProfileFormData } from '../core/transactions/transactionPartyProfile.js'

export function transactionSellerProfileModel(result) {
  if (result?.status === 'current' && result.listing) return buildListingSellerInformationModel(result.listing)
  if (result?.status === 'transaction_capture' && result.partyProfile?.people?.length) {
    return buildListingSellerInformationModel({ sellerOnboarding: { formData: transactionSellerProfileFormData(result.partyProfile) } })
  }
  return null
}

export async function loadTransactionSellerProfile({ transactionId, client = supabase }) {
  const { data, error } = await client.rpc('bridge_get_transaction_seller_profile', { p_transaction_id: transactionId })
  if (error) throw new Error(error.message || 'The current seller profile could not be loaded.')
  if (!data?.status) throw new Error('The current seller profile service is unavailable.')
  return { ...data, model: transactionSellerProfileModel(data) }
}
