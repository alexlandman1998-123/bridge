export const isRentalCreationId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))

// The existing primary key arbitrates simultaneous retries. Never upsert: an
// ambiguous request must not replace a record that already exists.
export async function insertRentalListingOnce(client, payload, creationId, actorId) {
  if (!isRentalCreationId(creationId) || payload.listing_category !== 'rental') throw new Error('A saved rental creation identity is required.')
  const read = async () => {
    const response = await client.from('private_listings').select('*').eq('id', creationId).maybeSingle()
    if (response.error) throw response.error
    if (response.data) {
      const row = response.data
      if (row.organisation_id !== payload.organisation_id || row.assigned_agent_id !== payload.assigned_agent_id
        || (row.branch_id || '') !== (payload.branch_id || '') || row.created_by !== actorId
        || row.listing_category !== 'rental' || row.listing_visibility === 'archived' || row.listing_status === 'withdrawn') {
        throw new Error('The saved rental creation identity is unavailable in this workspace. Open the existing rental instead of creating a replacement.')
      }
    }
    return response.data
  }
  const existing = await read()
  if (existing) return { data: existing, existing: true }
  if (payload.originating_crm_lead_id) {
    const leadMatch = await client.from('private_listings').select('*')
      .eq('organisation_id', payload.organisation_id).eq('originating_crm_lead_id', payload.originating_crm_lead_id)
      .neq('listing_status', 'withdrawn').neq('listing_visibility', 'archived')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (leadMatch.error) throw leadMatch.error
    if (leadMatch.data) {
      const row = leadMatch.data
      if (row.listing_category !== 'rental' || row.assigned_agent_id !== payload.assigned_agent_id
        || (row.branch_id || '') !== (payload.branch_id || '')) throw new Error('This landlord lead already has a listing. Open that rental instead of creating another.')
      return { data: row, existing: true }
    }
  }
  let result
  try { result = await client.from('private_listings').insert({ ...payload, id: creationId }).select('*').single() }
  catch (error) { result = { error } }
  if (result.error || !result.data) {
    const reconciled = await read()
    if (reconciled) return { data: reconciled, existing: true }
    return { error: result.error || new Error('Rental creation was not confirmed. Retry with the same saved draft.') }
  }
  return { ...result, existing: false }
}

export function serializeRentalCreationDraft(form, { activeStep, creationId = '', pendingListingId = '' } = {}) {
  const photos = Array.isArray(form.galleryImages) ? form.galleryImages : []
  const galleryImages = photos.filter(photo => /^https:\/\//i.test(photo.url || photo.signedUrl || '') || (photo.bucket && photo.path))
    .map(photo => ({ id: photo.id, name: photo.name, label: photo.label, url: /^https:\/\//i.test(photo.url || photo.signedUrl || '') ? photo.url || photo.signedUrl : '',
      bucket: photo.bucket || '', path: photo.path || '', contentType: photo.contentType || '', size: photo.size || 0 }))
  return { activeStep, creationId, pendingListingId,
    missingPhotoCount: photos.length - galleryImages.length,
    form: { ...form, galleryImages, coverImageId: galleryImages.some(photo => photo.id === form.coverImageId) ? form.coverImageId : galleryImages[0]?.id || '' } }
}
