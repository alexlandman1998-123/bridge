import { supabase } from '../lib/supabaseClient'

// Context lives in existing JSON fields; it is never rendered into a message.
export function developmentCampaignContext(development) {
  return { development_id: development.id, development_name: development.name }
}

const metric = value => value == null || !Number.isFinite(Number(value)) ? null : Math.max(0, Number(value))
export function normalizeDevelopmentCampaign(row, channel, performance = null) {
  const stats = performance || (channel === 'whatsapp' ? row : {})
  return {
    id: row.id, channel, name: row.name || 'Untitled campaign',
    status: channel === 'whatsapp' ? row.display_status || row.status : row.status,
    date: row.sent_at || row.scheduled_for || row.updated_at || row.created_at,
    createdBy: row.created_by,
    recipients: metric(stats.recipients), delivered: metric(stats.delivered),
    engaged: metric(channel === 'email' ? stats.clicked : stats.read),
    // Delivery and engagement are recorded. CRM lead attribution is not yet stored.
    leadsGenerated: null,
  }
}

async function emailCampaigns(organisationId, developmentId) {
  const { data, error } = await supabase.from('email_campaigns')
    .select('id, name, status, sent_at, scheduled_for, updated_at, created_at, created_by')
    .eq('organisation_id', organisationId).eq('content_json->arch9_context->>development_id', developmentId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  if (!data?.length) return []
  const results = await supabase.from('email_campaign_performance').select('campaign_id, recipients, delivered, clicked')
    .eq('organisation_id', organisationId).in('campaign_id', data.map(row => row.id))
  // A campaign remains visible when its performance view is temporarily unavailable.
  const byId = new Map((results.error ? [] : results.data || []).map(row => [row.campaign_id, row]))
  return data.map(row => normalizeDevelopmentCampaign(row, 'email', byId.get(row.id)))
}

async function whatsappCampaigns(organisationId, developmentId) {
  const { data, error } = await supabase.from('whatsapp_campaign_performance')
    .select('id, name, status, display_status, sent_at, updated_at, created_at, created_by, recipients, delivered, read')
    .eq('organisation_id', organisationId).eq('parameter_values->__arch9_context->>development_id', developmentId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return (data || []).map(row => normalizeDevelopmentCampaign(row, 'whatsapp'))
}

export async function fetchDevelopmentCampaigns({ organisationId, developmentId }) {
  if (!organisationId || !developmentId || !supabase) throw new Error('Choose an organisation workspace to view campaigns.')
  const results = await Promise.allSettled([emailCampaigns(organisationId, developmentId), whatsappCampaigns(organisationId, developmentId)])
  const errors = results.flatMap((result, index) => result.status === 'rejected' ? [`${index ? 'WhatsApp' : 'Email'} campaign history could not be loaded.`] : [])
  return { campaigns: results.flatMap(result => result.status === 'fulfilled' ? result.value : []), errors }
}
