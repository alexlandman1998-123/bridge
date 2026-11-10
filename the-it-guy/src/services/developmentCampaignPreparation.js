import { supabase } from '../lib/supabaseClient'
import { normalizeMarketingContent } from '../domains/developments/profileNormalization.js'
import { developmentCampaignPublicUrl as publicCampaignUrl, developmentCampaignWebsite } from '../../../supabase/functions/_shared/developmentCampaignSource.js'
export { developmentCampaignPublicUrl as publicCampaignUrl } from '../../../supabase/functions/_shared/developmentCampaignSource.js'
import { createEmailDocument, newBlock } from '../../../supabase/functions/_shared/emailDocument.js'

const text = value => String(value || '').trim()
const plain = value => text(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
export async function loadDevelopmentCampaignPreparation({ organisationId, developmentId }) {
  if (!supabase || !organisationId || !developmentId) throw new Error('Open a development in its organisation workspace first.')
  const { data, error } = await supabase.rpc('bridge_prepare_development_campaign', { p_organisation_id: organisationId, p_development_id: developmentId })
  if (error) throw new Error('Campaign preparation could not be loaded. Check your workspace access and database update, then retry.', { cause: error })
  if (data?.development?.id !== developmentId || data.development.organisation_id !== organisationId || !Array.isArray(data.events) || !Array.isArray(data.whatsappContactIds)) throw new Error('The development campaign source could not be confirmed.')
  return data
}
export function prepareDevelopmentCampaign(source, eventId = null, now = Date.now()) {
  const development = source.development, content = normalizeMarketingContent(source.profile?.marketing_content || {})
  const overview = content.listingOverview || {}, media = content.mediaLibrary || {}
  const event = eventId ? source.events.find(item => item.id === eventId) : null
  if (eventId && (!event || !['planning','upcoming'].includes(event.status) || Date.parse(event.starts_at) <= now || !Number.isFinite(Date.parse(event.starts_at)))) throw new Error('This event is unavailable or has already started. Refresh events before preparing an invitation.')
  const website = developmentCampaignWebsite(content)
  const image = publicCampaignUrl(event?.image_url) || publicCampaignUrl(media.coverImageUrl) || publicCampaignUrl(media.heroImageUrl) || publicCampaignUrl(media.galleryImageUrls?.[0]) || publicCampaignUrl(source.profile?.image_links?.[0]?.url || source.profile?.image_links?.[0])
  const eventTime = event ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(event.starts_at)) : ''
  const title = event?.title || overview.listingTitle || development.name
  const copy = event ? [eventTime && `${eventTime} SAST`, event.location || event.address, plain(event.description)].filter(Boolean).join('\n')
    : plain(overview.shortDescription || overview.listingDescription || source.profile?.description)
  const context = { source: 'development_workspace', version: 1, development_id: development.id, development_name: development.name,
    organisation_id: development.organisation_id, website_url: website,
    ...(event ? { event_id: event.id, event_snapshot: { title: event.title, starts_at: event.starts_at, location: event.location || event.address || '', description: event.description || '' } } : {}) }
  const document = createEmailDocument()
  document.blocks = [
    { ...newBlock('text'), style: 'heading', text: title },
    ...(image ? [{ ...newBlock('image'), src: image, alt: development.name, url: website }] : []),
    { ...newBlock('text'), text: copy || `Discover ${development.name}. Contact our team for current availability.` },
    ...(website ? [{ ...newBlock('button'), text: event ? 'Explore the development' : 'View development', url: website }] : []),
    newBlock('footer'),
  ]
  const name = `${development.name}${event ? ` · ${event.title}` : ' campaign'}`.slice(0,100)
  return { name, context, label: event ? `Invitation: ${event.title}` : `Development update: ${development.name}`,
    email: { name, subject: title, previewText: copy.replace(/\n/g,' ').slice(0,150), audienceFilter: { development_id: development.id }, contentJson: document },
    whatsapp: { contactIds: source.whatsappContactIds, suggestions: { 'Development name': development.name, ...(event ? { 'Event details': `${event.title} ${copy}`.replace(/\s+/g,' ').slice(0,1024) } : {}), ...(website ? { 'Website link': website } : {}) } },
    warnings: [!website && 'No published development website link is available. Review the call to action before sending.', !image && 'No public campaign photograph is available. Choose or upload a campaign image.', source.whatsappTotal > 500 && 'The first 500 matched WhatsApp contacts are selected. Review the audience.'].filter(Boolean),
  }
}
