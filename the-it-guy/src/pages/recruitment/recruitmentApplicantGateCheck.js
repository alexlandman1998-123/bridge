// Older databases do not yet have the applicant gate. The local listing preview
// can retain the existing workspace access only for an active membership verified
// by the database. Production and all other RPC errors remain fail-closed.
export async function checkRecruitmentApplicantGate(client, userId, { development = false, listingPreview = false, signal } = {}) {
  const request = client.rpc('recruitment_applicant_portal_required')
  const result = await (signal && typeof request.abortSignal === 'function' ? request.abortSignal(signal) : request)
  if (!result.error) return typeof result.data === 'boolean'
    ? { required: result.data, error: false }
    : { required: false, error: true, retryable: false }
  if (!development || !listingPreview || result.error.code !== 'PGRST202') {
    const status = result.status || result.error.status || 0
    const code = result.error.code || ''
    const permanent = status === 401 || status === 403 || code.startsWith('42')
      || ['PGRST202', 'PGRST301', 'PGRST302'].includes(code)
    const retryable = !permanent && (status === 408 || status >= 500 || (!status && !code)
      || ['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '57014', '53300', '57P01'].includes(code))
    return { required: false, error: true, retryable }
  }
  const membership = await client.from('organisation_users').select('user_id').eq('user_id', userId).eq('status', 'active').limit(1)
  return { required: false, error: Boolean(membership.error) || !membership.data?.length, ...(membership.error || !membership.data?.length ? { retryable: false } : {}) }
}
