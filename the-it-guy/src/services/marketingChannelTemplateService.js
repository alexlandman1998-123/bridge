import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const CHANNEL_TEMPLATE_CHANNELS = { email: 'Email', whatsapp: 'WhatsApp', meta: 'Meta ads', chatgpt: 'ChatGPT Ads', social: 'Organic social' }
const limits = { name: 120, description: 600, title: 240, body: 9000, cta_label: 80, destination_url: 2048, image_url: 2048 }

export function channelTemplatePayload(input) {
  if (!Object.hasOwn(CHANNEL_TEMPLATE_CHANNELS, input.channel)) throw new Error('Choose a template channel.')
  if (!['personal', 'agency'].includes(input.visibility)) throw new Error('Choose who can use this template.')
  const payload = { channel: input.channel, visibility: input.visibility }
  for (const [key, limit] of Object.entries(limits)) {
    if (input[key] != null && typeof input[key] !== 'string') throw new Error('Template content must be text.')
    payload[key] = (input[key] || '').trim()
    if (payload[key].length > limit) throw new Error(`Shorten the ${key.replaceAll('_', ' ')} to ${limit} characters.`)
  }
  if (!payload.name || !payload.body) throw new Error('Add a template name and message content.')
  if (payload.channel === 'email' && !payload.title) throw new Error('Add an email subject.')
  for (const key of ['destination_url', 'image_url']) {
    if (!payload[key]) continue
    let url
    try { url = new URL(payload[key]) } catch { throw new Error('Use a valid HTTPS link.') }
    if (url.protocol !== 'https:' || url.username || url.password || /\s/.test(payload[key])) throw new Error('Use a valid HTTPS link without sign-in details.')
  }
  return payload
}

function scope(organisationId) {
  if (!organisationId || !isSupabaseConfigured || !supabase) throw new Error('Choose a connected agency workspace first.')
}
function failure(error) {
  if (error?.code === '23514' && /marketing_channel_templates_channel_check/.test(error.message || '')) return new Error('ChatGPT Ads template storage needs its database update. Your draft is still here.')
  if (['42P01', 'PGRST204', 'PGRST205'].includes(error?.code)) return new Error('Channel template storage is not enabled in this environment yet. An administrator needs to apply the channel template library database update.')
  return new Error(error?.message || 'Unable to save this template. Try again.')
}
export async function loadChannelTemplates(organisationId) {
  scope(organisationId)
  const templates = []
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await supabase.from('marketing_channel_templates').select('*').eq('organisation_id', organisationId).order('updated_at', { ascending: false }).order('id').range(offset, offset + 199)
    if (error) throw failure(error)
    templates.push(...(data || []))
    if ((data || []).length < 200) return templates
  }
}
export async function saveChannelTemplate(organisationId, input, existing = null) {
  scope(organisationId)
  if (existing && existing.organisation_id !== organisationId) throw new Error('This template belongs to a different agency workspace.')
  const payload = channelTemplatePayload(input)
  const query = existing
    ? supabase.from('marketing_channel_templates').update({ ...payload, revision: existing.revision + 1 }).eq('organisation_id', organisationId).eq('id', existing.id).eq('revision', existing.revision)
    : supabase.from('marketing_channel_templates').insert({ ...payload, organisation_id: organisationId })
  const { data, error } = await query.select('*').maybeSingle()
  if (error) throw failure(error)
  if (!data) throw new Error('This template changed or is no longer editable. Reload before saving again.')
  return data
}

export function campaignFromChannelTemplate(template) {
  const source = channelTemplatePayload(template)
  const body = [source.body, source.cta_label, source.destination_url].filter(Boolean).join('\n\n')
  return {
    name: source.name,
    goal: 'custom',
    campaign_setup: { customGoal: (source.description || source.name).slice(0, 120) },
    objective: source.description.slice(0, 240),
    channels: [source.channel],
    mode: 'bounded',
    duration_days: 30,
    cover_url: source.image_url,
    channel_content: { [source.channel]: { title: source.title, body, timing: '' } },
  }
}
