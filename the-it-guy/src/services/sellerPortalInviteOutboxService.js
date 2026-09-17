import { supabase } from '../lib/supabaseClient'

let outboxUnavailable = false

function text(value = '') {
  return String(value || '').trim()
}

export async function queueSellerPortalInviteDelivery({ listingId = '', organisationId = '', payload = {} } = {}) {
  const privateListingId = text(listingId)
  const orgId = text(organisationId)
  if (!supabase || outboxUnavailable || !privateListingId || !orgId) return null

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user?.id) throw userError || new Error('A signed-in user is required to queue seller portal delivery.')

  const idempotencyKey = `seller-portal-invite:${privateListingId}`
  const { data, error } = await supabase
    .from('private_listing_seller_portal_invite_outbox')
    .insert({
      private_listing_id: privateListingId,
      organisation_id: orgId,
      idempotency_key: idempotencyKey,
      delivery_payload: payload,
      created_by: userData.user.id,
    })
    .select('id, status, next_attempt_at')
    .single()

  if (error?.code === '23505') {
    const existing = await supabase
      .from('private_listing_seller_portal_invite_outbox')
      .select('id, status, next_attempt_at')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existing.error) throw existing.error
    return { ...(existing.data || {}), duplicate: true }
  }
  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    outboxUnavailable = true
    return null
  }
  if (error) throw error

  return data || null
}

export async function retrySellerPortalInviteDelivery(listingId = '') {
  const privateListingId = text(listingId)
  if (!supabase || !privateListingId) throw new Error('A listing is required to retry seller portal delivery.')
  const { data, error } = await supabase.rpc('bridge_retry_private_listing_seller_portal_invite', {
    p_private_listing_id: privateListingId,
  })
  if (error) throw error
  return data || { ok: true, status: 'queued' }
}
