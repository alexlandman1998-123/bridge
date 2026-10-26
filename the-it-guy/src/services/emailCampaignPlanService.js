import { supabase } from '../lib/supabaseClient'

const canonical = (value) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item)
const intent = (row) => {
  const document = { ...row.content_json }
  delete document.arch9_campaign
  return canonical([row.organisation_id, row.created_by, row.status, row.name, row.subject, row.preview_text,
    row.sender_identity_id, row.reply_to_email, row.subscription_type_id, row.audience_filter, document, row.html])
}

// The database links the saved email and its plan in one transaction. Never
// invent a client-only relationship or overwrite unsaved document blocks.
export async function ensureEmailCampaignPlan(organisationId, userId, saved) {
  if (!saved?.content_json?.ai_campaign || saved.content_json.arch9_campaign) return saved
  if (!organisationId || !userId || !saved.id || !saved.updated_at || saved.organisation_id !== organisationId)
    throw new Error('Save this email in your current agency before linking its campaign.')
  const auth = await supabase.auth.getUser()
  if (auth.error || auth.data?.user?.id !== userId) throw new Error('Your account changed. Reopen this campaign.')
  const { data, error } = await supabase.rpc('marketing_campaign_ensure_email_plan', {
    p_email: saved.id, p_expected_updated_at: saved.updated_at,
  })
  if (error) {
    const unavailable = ['PGRST202', '42883'].includes(error.code)
    // A lost response may follow a committed transaction. Recover only an exact
    // same saved document plus a real activity link; preserve concurrent edits.
    if (!unavailable) {
      try {
        const recovered = await supabase.from('email_campaigns').select('*').eq('organisation_id', organisationId).eq('id', saved.id).maybeSingle()
        const reference = recovered.data?.content_json?.arch9_campaign
        if (!recovered.error && reference?.id && intent(saved) === intent(recovered.data)) {
          const linked = await supabase.from('marketing_campaign_activities').select('campaign_id').eq('organisation_id', organisationId).eq('email_campaign_id', saved.id).maybeSingle()
          const actor = await supabase.auth.getUser()
          if (!linked.error && linked.data?.campaign_id === reference.id && !actor.error && actor.data?.user?.id === userId) return recovered.data
        }
      } catch { /* Keep the original save/link failure visible. */ }
    }
    throw Object.assign(new Error(unavailable
      ? 'The email is saved. Campaign linking needs its database update; reopen it after activation to finish linking.'
      : `The email is saved, but its campaign link needs attention. ${error.message || 'Retry linking this saved draft.'}`), { code: unavailable ? 'EMAIL_CAMPAIGN_LINK_SETUP' : 'EMAIL_CAMPAIGN_LINK_UNCONFIRMED' })
  }
  if (!data?.campaign_id || data.reference?.id !== data.campaign_id || !data.email_updated_at)
    throw new Error('The email is saved, but the campaign link could not be confirmed. Retry this saved draft.')
  return { ...saved, updated_at: data.email_updated_at, content_json: { ...saved.content_json, arch9_campaign: data.reference } }
}
