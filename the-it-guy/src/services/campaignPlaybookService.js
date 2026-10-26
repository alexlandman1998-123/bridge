import { supabase } from '../lib/supabaseClient'
import { cleanCampaignPlaybook } from './campaignPlaybookModel'

export async function saveCampaignPlaybook(organisationId, campaign, definition, { client = supabase } = {}) {
  if (!client || !organisationId || campaign.organisation_id !== organisationId || !campaign.id || !Number.isInteger(campaign.revision)) throw new Error('Choose a saved campaign in the current agency workspace.')
  const playbook = { ...cleanCampaignPlaybook(definition, campaign.planned_channels), sourceRevision: campaign.revision + 1 }
  const { data, error } = await client.from('marketing_campaigns').update({ playbook, revision: campaign.revision + 1 }).eq('organisation_id', organisationId).eq('id', campaign.id).eq('revision', campaign.revision).select('*').maybeSingle()
  if (error) {
    if (['PGRST204', '42703'].includes(error.code)) throw new Error('Playbook storage is not enabled in this workspace yet. Your edits are still here.')
    throw new Error(error.message || 'The playbook could not be saved.')
  }
  if (!data || data.id !== campaign.id || data.organisation_id !== organisationId || data.revision !== campaign.revision + 1) throw new Error('This campaign changed or is no longer editable. Refresh before saving the playbook.')
  return data
}
