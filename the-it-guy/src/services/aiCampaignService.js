import { supabase } from '../lib/supabaseClient'
import { checkCampaignSourceFreshness } from '../../../supabase/functions/_shared/emailCampaignSourceFreshness.js'
import { createEmailDocument, newBlock, safeUrl } from '../../../supabase/functions/_shared/emailDocument.js'
export async function aiCampaignAction(organisationId, action, input = {}, options = {}) {
  if (options.signal?.aborted) throw new DOMException('Generation cancelled.', 'AbortError')
  const { data } = await supabase.auth.getSession()
  if (!data?.session?.access_token) throw new Error('Sign in to use the campaign assistant.')
  const response = await fetch('/api/marketing/ai-campaign', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ ...input, organisationId, action }), signal: options.signal,
  })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error || 'Campaign assistant is unavailable.'), { status: response.status, code: result.code, usageId: result.usageId, requestId: result.requestId })
  return result
}
export function aiCampaignDocument(result, image = '') {
  const { listing, copy, brand, event, previousPrice, objective, language } = result
  const af = language === 'af'
  const money = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value)
  const doc = createEmailDocument(brand)
  const textBlock = (text, style = 'body') => ({ ...newBlock('text'), text, style })
  const features = [listing.bedrooms != null && `${listing.bedrooms} ${af ? 'slaapkamers' : 'bedrooms'}`, listing.bathrooms != null && `${listing.bathrooms} ${af ? 'badkamers' : 'bathrooms'}`].filter(Boolean).join(' · ')
  // Factual fields and links come from server-authorised records, never model output.
  const property = { ...newBlock('property'), layout: 'list', text: copy.cta, listings: [{ id: listing.id, address: listing.address_line_1 || listing.title || '', suburb: listing.suburb || '', price: listing.asking_price ? money(listing.asking_price) : af ? 'Prys op aanvraag' : 'Price on request', features, image: '', url: listing.bridge_listing_public_url || '' }] }
  const photo = typeof image === 'string' ? image.trim() : ''
  // Reuse the standard image block and renderer. The existing content check still
  // rejects private, signed and expiring links before review or delivery.
  const hero = /^https?:\/\//i.test(photo) && safeUrl(photo) ? [{ ...newBlock('image'), src: photo, alt: listing.title || listing.address_line_1 || 'Property photograph', url: listing.bridge_listing_public_url || '' }] : []
  doc.blocks = [doc.blocks[0], ...hero, textBlock(copy.heading, 'heading'), textBlock(copy.intro), property]
  if (previousPrice) doc.blocks.push(textBlock(`${af ? 'Vorige prys' : 'Previous price'}: ${money(previousPrice)} · ${af ? 'Huidige prys' : 'Current price'}: ${money(listing.asking_price)}`))
  if (event) {
    const date = (value) => new Intl.DateTimeFormat(af ? 'af-ZA' : 'en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'full', timeStyle: 'short' }).format(new Date(value))
    doc.blocks.push(textBlock(`${af ? 'Skoudag' : 'Show day'}: ${date(event.start)} – ${date(event.end)} (SAST)`))
  }
  doc.blocks.push(newBlock('divider'), newBlock('footer'))
  doc.ai_campaign = { listing_id: listing.id, objective, language, usage_id: result.usageId, copy, event, previous_price: previousPrice, source_snapshot: { version: 1, listing_id: listing.id, organisation_id: listing.organisation_id, asking_price: listing.asking_price ?? null, listing_status: listing.listing_status ?? null, is_active: listing.is_active === true, updated_at: listing.updated_at || null } }
  return doc
}
async function requireCurrentCampaignSource(campaignId) {
  const { data: campaign, error } = await supabase.from('email_campaigns').select('id,organisation_id,content_json').eq('id', campaignId).maybeSingle()
  if (error || !campaign) throw new Error('The saved campaign is unavailable. Reload your draft before reviewing.')
  const source = await checkCampaignSourceFreshness({ db: supabase, campaign })
  if (!source.ready) throw Object.assign(new Error(source.reason || 'Review the current listing before sending.'), { code: source.code })
}
export async function reviewAiCampaign(campaignId, sendAt) {
  await requireCurrentCampaignSource(campaignId)
  const { data, error } = await supabase.rpc('ai_campaign_review', { p_campaign: campaignId, p_send_at: sendAt })
  if (error) throw new Error(error.message || 'Campaign review is unavailable.')
  return data
}
export async function approveAiCampaign(campaignId, review) {
  await requireCurrentCampaignSource(campaignId)
  const { data, error } = await supabase.rpc('ai_campaign_approve_send', { p_campaign: campaignId, p_send_at: review.send_at, p_token: review.token })
  if (error) throw new Error(error.message || 'Review this campaign again before approving.')
  return data
}
