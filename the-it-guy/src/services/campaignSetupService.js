import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { loadAgencyPublicIntakeLink, loadAgencyAgentCardLink, buildAgencyPublicIntakeUrls } from './agencyPublicIntakeLinkService'
import { CAMPAIGN_SETUP_VERSION, cleanSetupPreferences, validateCampaignSetup } from './campaignSetupModel'

function clientFor(organisationId) {
  if (!organisationId || !isSupabaseConfigured || !supabase) throw new Error('Campaign setup requires a connected agency workspace.')
  return supabase
}
function failure(error) {
  if (['42P01', 'PGRST205', 'PGRST204'].includes(error?.code)) return new Error('Campaign setup is not enabled in this environment yet. Ask an administrator to enable it.')
  if (['23505', '40001'].includes(error?.code)) return new Error('Setup changed in another session. Keep your edits and reload the saved setup before trying again.')
  if (error?.code === '42501') return new Error('You do not have permission to change these campaign preferences.')
  return new Error(error?.message || 'Unable to save campaign preferences. Your edits are still here.')
}
async function signedIn(client, expectedUserId) {
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user?.id || (expectedUserId && data.user.id !== expectedUserId)) throw new Error('Your account changed. Reopen campaigns before continuing setup.')
  return data.user.id
}
function checkVersion(record) {
  if (record && record.schema_version !== CAMPAIGN_SETUP_VERSION) throw new Error('This campaign setup needs a newer app version. Refresh before making changes.')
  return record
}

export async function loadCampaignSetup(organisationId, { userId } = {}) {
  const client = clientFor(organisationId)
  const actor = await signedIn(client, userId)
  const [agency, agent] = await Promise.all([
    client.from('marketing_campaign_setup').select('*').eq('organisation_id', organisationId).maybeSingle(),
    client.from('marketing_campaign_agent_setup').select('*').eq('organisation_id', organisationId).eq('user_id', actor).maybeSingle(),
  ])
  if (agency.error || agent.error) throw failure(agency.error || agent.error)
  const optional = await Promise.allSettled([
    client.from('profiles').select('full_name,first_name,last_name,title,email,phone_number,avatar_url,bio,language').eq('id', actor).maybeSingle(),
    client.from('organisations').select('id,active_areas,specialties').eq('id', organisationId).maybeSingle(),
    loadAgencyPublicIntakeLink({ organisationId, client }),
    loadAgencyAgentCardLink({ organisationId, agentUserId: actor, client }),
  ])
  const warnings = []
  const value = (index) => {
    const result = optional[index]
    if (result.status === 'rejected' || result.value?.error) {
      warnings.push(['Account details', 'Agency service areas', 'Agency enquiry link', 'Agent digital card'][index])
      return null
    }
    return result.value
  }
  const profile = value(0)?.data || null
  const organisation = value(1)?.data || null
  const intake = value(2)?.link || null
  const card = value(3)?.link || null
  const urls = intake?.status === 'active' ? buildAgencyPublicIntakeUrls({ slug: intake.slug }) : {}
  return {
    agency: checkVersion(agency.data), agent: checkVersion(agent.data), userId: actor, warnings,
    sources: { profile, organisation, intake, card,
      buyerUrl: intake?.enabledIntents?.includes('buy') ? urls.buyerUrl || '' : '',
      sellerUrl: intake?.enabledIntents?.includes('sell') ? urls.sellerUrl || '' : '' },
  }
}

export async function saveCampaignSetup(organisationId, { kind = 'agency', preferences, source, record, complete = false, step = 1, userId } = {}) {
  if (!['agency', 'agent'].includes(kind)) throw new Error('Choose agency or agent preferences.')
  const errors = validateCampaignSetup(preferences, { kind, complete })
  if (errors.length) throw new Error(errors.join(' '))
  if (!Number.isInteger(step) || step < 1 || step > 3) throw new Error('Choose a valid setup step.')
  if (record && record.organisation_id !== organisationId) throw new Error('Reopen setup in the current agency.')
  const client = clientFor(organisationId)
  const actor = await signedIn(client, userId)
  if (kind === 'agent' && record && record.user_id !== actor) throw new Error('You can confirm only your own public details.')
  const payload = {
    preferences: cleanSetupPreferences(preferences, kind),
    source_snapshot: cleanSetupPreferences(source, kind),
    schema_version: CAMPAIGN_SETUP_VERSION,
    status: complete ? 'complete' : 'draft',
    last_step: step,
  }
  const table = kind === 'agency' ? 'marketing_campaign_setup' : 'marketing_campaign_agent_setup'
  let query
  if (record) {
    query = client.from(table).update({ ...payload, revision: record.revision + 1 })
      .eq('organisation_id', organisationId).eq('revision', record.revision)
    if (kind === 'agent') query = query.eq('user_id', actor)
  } else {
    query = client.from(table).insert({ ...payload, organisation_id: organisationId, ...(kind === 'agent' ? { user_id: actor } : {}) })
  }
  const { data, error } = await query.select('*').maybeSingle()
  if (error) throw failure(error)
  if (!data) throw failure({ code: '40001' })
  return checkVersion(data)
}
