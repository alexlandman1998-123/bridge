// Older databases do not yet have the applicant gate. The local listing preview
// can retain the existing workspace access only for an active membership verified
// by the database. Production and all other RPC errors remain fail-closed.
export async function checkRecruitmentApplicantGate(client, userId, { development = false, listingPreview = false } = {}) {
  const result = await client.rpc('recruitment_applicant_portal_required')
  if (!result.error) return { required: result.data === true, error: false }
  if (!development || !listingPreview || result.error.code !== 'PGRST202') return { required: false, error: true }
  const membership = await client.from('organisation_users').select('user_id').eq('user_id', userId).eq('status', 'active').limit(1)
  return { required: false, error: Boolean(membership.error) || !membership.data?.length }
}
