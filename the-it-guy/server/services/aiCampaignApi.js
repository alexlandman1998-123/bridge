import { handleBusinessCampaignAi } from './aiBusinessCampaignApi.js'
import { handleCrmFollowUpAi } from './aiCrmFollowUpApi.js'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import * as listingSourceModule from '../../../supabase/functions/_shared/emailCampaignSourceFreshness.js'
import { generateCampaignCopy, campaignProviderConfiguration, campaignRefinement, COPY_FIELDS } from './aiCampaignProvider.js'

// Shared files outside the app root may be emitted as CommonJS by Vercel.
const { CAMPAIGN_MARKET_READY_STATUSES, isCampaignListingMarketReady, isCampaignShowDayMarketReady } = listingSourceModule.default ?? listingSourceModule

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FIELDS = 'id,organisation_id,title,listing_status,is_active,asking_price,address_line_1,suburb,city,province,bedrooms,bathrooms,property_type,bridge_listing_public_url,updated_at'
const text = (value, max = 1500) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const fail = (status, message, code) => Object.assign(new Error(message), { status, code })
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const EVENT_FIELDS = 'id,organisation_id,event_type,subject_type,subject_id,status,metadata,starts_at,ends_at'
const campaignFields = 'id,organisation_id,status,created_by,updated_at'
const sourceFor = (listing) => ({ listingId: listing.id, updatedAt: listing.updated_at || null, fingerprint: fingerprint(listing) })
const currentResult = (result) => result?.applicability === 'stale'
  ? { status: 409, body: { error: 'The saved campaign or listing changed during generation. Review your current draft before generating again.', code: 'CAMPAIGN_CHANGED', usageId: result.usageId, requestId: result.requestId } }
  : result?.applicability === 'unverified'
    ? { status: 503, body: { error: 'Generation finished, but the current draft could not be checked. Your saved draft is unchanged. Check usage before retrying.', code: 'CAMPAIGN_UNVERIFIED', usageId: result.usageId, requestId: result.requestId } }
    : { status: 200, body: result }
function validDateTime(value) {
  const parts = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.\d{1,3})?(?:[+-]\d\d:\d\d|Z)$/.exec(value || '')
  if (!parts || !Number.isFinite(Date.parse(value))) return false
  const [, year, month, day, hour, minute, second] = parts.map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && hour < 24 && minute < 60 && second < 60
}
async function read(query) { const { data, error } = await query; if (error) throw fail(503, 'Campaign information is unavailable. Ask your administrator to check campaign setup.'); return data }
export async function handleAiCampaign({ method, headers = {}, body = {}, env = process.env, clientFactory = createClient, generate = generateCampaignCopy } = {}) {
  if (typeof body?.action === 'string' && body.action.startsWith('crm_follow_up_')) return handleCrmFollowUpAi({ method, headers, body, env, clientFactory, generate })
  if (body?.action === 'business_generate') return handleBusinessCampaignAi({ method, headers, body, env, clientFactory, generate })
  if (method !== 'POST') return { status: 405, body: { error: 'Use POST.' } }
  try {
    if (!body || Array.isArray(body) || typeof body !== 'object') throw fail(400, 'Invalid campaign request.')
    if (Buffer.byteLength(JSON.stringify(body)) > 18000) throw fail(400, 'Campaign request is too long.')
    const token = String(headers.authorization || headers.Authorization || '').match(/^Bearer (.+)$/i)?.[1]
    if (!token) throw fail(401, 'Sign in to use the campaign assistant.')
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) throw fail(503, 'Campaign assistant is not configured.')
    const scoped = clientFactory(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
    const auth = await scoped.auth.getUser(token)
    if (auth.error || !auth.data?.user) throw fail(401, 'Sign in to use the campaign assistant.')
    const actor = auth.data.user.id
    const org = body.organisationId
    if (!UUID.test(org || '')) throw fail(400, 'Choose an agency workspace.')
    if (!await read(scoped.rpc('bridge_has_organisation_membership', { target_organisation_id: org }))) throw fail(403, 'Agency access is unavailable.')
    if (body.action === 'usage') {
      const usage = await read(scoped.from('ai_campaign_usage').select('id,campaign_id,provider,model,input_tokens,output_tokens,cost_usd,status,funding_mode,created_at').eq('organisation_id', org).order('created_at', { ascending: false }).limit(20))
      return { status: 200, body: { usage } }
    }
    if (body.action === 'listings') {
      let query = scoped.from('private_listings').select(FIELDS).eq('organisation_id', org).eq('is_active', true).in('listing_status', CAMPAIGN_MARKET_READY_STATUSES).order('updated_at', { ascending: false }).limit(100)
      if (body.listingId) { if (!UUID.test(body.listingId)) throw fail(400, 'Choose a listing.'); query = query.eq('id', body.listingId) }
      const listings = await read(query)
      return { status: 200, body: { listings } }
    }
    if (!UUID.test(body.listingId || '')) throw fail(400, 'Choose a listing.')
    const listing = await read(scoped.from('private_listings').select(FIELDS).eq('organisation_id', org).eq('id', body.listingId).maybeSingle())
    if (!isCampaignListingMarketReady(listing)) throw fail(404, 'An active listing is required in your permitted scope.')
    if (body.action === 'audience') {
      if (!UUID.test(body.subscriptionTypeId || '')) throw fail(400, 'Choose the email permission category first.')
      const category = await read(scoped.from('email_subscription_types').select('id').eq('organisation_id', org).eq('id', body.subscriptionTypeId).eq('is_active', true).maybeSingle())
      if (!category) throw fail(403, 'Email permission category is unavailable.')
      const matched = body.useCurrentAudience ? { contact_ids: [], explanation: 'Your selected campaign audience, checked against current category consent, address validity and suppressions.' } : await read(scoped.rpc('ai_campaign_match_buyers', { p_listing: listing.id }))
      if ((matched?.contact_ids?.length || 0) > 2000) throw fail(400, 'Narrow this audience in the campaign audience editor.')
      // The existing matcher interprets [] as everyone, so zero matches use a non-existent ID.
      let audienceFilter = { contact_ids: matched?.contact_ids?.length ? matched.contact_ids : ['00000000-0000-0000-0000-000000000000'] }
      if (body.useCurrentAudience) {
        const filter = body.audienceFilter
        const allowed = ['role_type', 'branch_id', 'assigned_user_id', 'lead_stage', 'area', 'tag', 'contact_ids', 'saved_audience_id']
        if (!filter || Array.isArray(filter) || typeof filter !== 'object' || Object.keys(filter).some((key) => !allowed.includes(key)) || Object.entries(filter).some(([key, value]) => key === 'contact_ids' ? !Array.isArray(value) || value.length > 2000 || value.some((id) => !UUID.test(id)) : typeof value !== 'string' || value.length > 120 || (['branch_id', 'assigned_user_id', 'saved_audience_id'].includes(key) && !UUID.test(value)))) throw fail(400, 'Choose a saved audience or valid campaign filters in the Audience step.')
        audienceFilter = filter
      }
      const count = await read(scoped.rpc('email_campaign_preview_audience', { p_organisation_id: org, p_subscription_type_id: body.subscriptionTypeId, p_filter: audienceFilter }))
      return { status: 200, body: { audienceFilter, count, explanation: matched.explanation } }
    }
    let savedEvent = null
    if (body.eventId != null && body.eventId !== '') {
      if (body.objective !== 'show_day' || !UUID.test(body.eventId)) throw fail(400, 'Choose a saved show day for this campaign.')
      savedEvent = await read(scoped.from('marketing_events').select(EVENT_FIELDS).eq('organisation_id', org).eq('id', body.eventId).maybeSingle())
      if (!isCampaignShowDayMarketReady(savedEvent, listing.id, org) || !validDateTime(savedEvent?.starts_at) || !validDateTime(savedEvent?.ends_at) || Date.parse(savedEvent.starts_at) <= Date.now() || Date.parse(savedEvent.ends_at) <= Date.parse(savedEvent.starts_at)) throw fail(409, 'This public show day is no longer available. Choose a current event or confirm manual show-day times.', 'EVENT_CHANGED')
      if ((body.showStart && (!validDateTime(body.showStart) || Date.parse(body.showStart) !== Date.parse(savedEvent.starts_at))) || (body.showEnd && (!validDateTime(body.showEnd) || Date.parse(body.showEnd) !== Date.parse(savedEvent.ends_at)))) throw fail(409, 'The saved show-day times changed. Reload the event before generating, or choose manual times.', 'EVENT_CHANGED')
    }
    const showStart = savedEvent?.starts_at || body.showStart
    const showEnd = savedEvent?.ends_at || body.showEnd
    if (body.action === 'plan') {
      const objective = body.objective || 'new_listing'
      const language = body.language || 'en'
      if (!['new_listing', 'price_reduction', 'show_day'].includes(objective) || !['en', 'af'].includes(language)) throw fail(400, 'Choose an objective and language.')
      const needs = []
      if (!listing.bridge_listing_public_url) needs.push({ field: 'destination', reason: 'A public property link is needed before sending.' })
      if (objective === 'price_reduction' && (!Number.isFinite(Number(body.previousPrice)) || Number(body.previousPrice) <= Number(listing.asking_price) || !listing.asking_price)) needs.push({ field: 'previousPrice', reason: 'Confirm the previous price above the saved current price.' })
      if (objective === 'show_day' && (!validDateTime(showStart) || !validDateTime(showEnd) || Date.parse(showStart) <= Date.now() || Date.parse(showEnd) <= Date.parse(showStart))) needs.push({ field: 'showDay', reason: 'Confirm a future show-day start and a later end time.' })
      return { status: 200, body: { plan: { objective, language, listingId: listing.id, channels: ['email'], audience: { strategy: 'saved_buyer_requirements', explanation: 'Match recorded buyer preferences, then check channel permission and suppression before choosing recipients.' }, nextAction: needs.some((item) => item.field !== 'destination') ? 'confirm_details' : 'preview_audience', needs, source: sourceFor(listing), event: savedEvent ? { id: savedEvent.id, start: showStart, end: showEnd } : null, facts: { title: listing.title, suburb: listing.suburb, city: listing.city, price: listing.asking_price, bedrooms: listing.bedrooms, bathrooms: listing.bathrooms }, explanation: 'Prepared from the selected saved listing. Planning uses supported rules and makes no model call. Nothing is sent or scheduled.' } } }
    }
    if (body.action !== 'generate') throw fail(400, 'Unknown campaign action.')
    if (!['new_listing', 'price_reduction', 'show_day'].includes(body.objective) || !['en', 'af'].includes(body.language)) throw fail(400, 'Choose an objective and language.')
    if (!UUID.test(body.campaignId || '') || !UUID.test(body.requestId || '')) throw fail(400, 'Save the campaign draft before generation.')
    const campaign = await read(scoped.from('email_campaigns').select(campaignFields).eq('organisation_id', org).eq('id', body.campaignId).maybeSingle())
    if (!campaign || campaign.status !== 'draft') throw fail(404, 'An editable campaign draft is required.')
    if (campaign.created_by !== actor && !await read(scoped.rpc('email_campaign_can_send', { p_organisation_id: org }))) throw fail(403, 'This draft is outside your edit permissions.')
    if (body.expectedCampaignUpdatedAt != null && (typeof body.expectedCampaignUpdatedAt !== 'string' || !body.expectedCampaignUpdatedAt || !Number.isFinite(Date.parse(body.expectedCampaignUpdatedAt)))) throw fail(400, 'Choose a valid saved campaign revision.')
    if (body.expectedCampaignUpdatedAt && body.expectedCampaignUpdatedAt !== campaign.updated_at) throw fail(409, 'This campaign has changed. Reload the saved draft before generating.', 'CAMPAIGN_CHANGED')
    const event = body.objective === 'show_day' ? { ...(savedEvent ? { id: savedEvent.id } : {}), start: text(showStart, 40), end: text(showEnd, 40) } : null
    if (event && (!validDateTime(event.start) || !validDateTime(event.end) || Date.parse(event.start) <= Date.now() || Date.parse(event.end) <= Date.parse(event.start))) throw fail(400, 'Choose a future show-day start and a later end time.')
    const previousPrice = body.objective === 'price_reduction' ? Number(body.previousPrice) : null
    if (body.objective === 'price_reduction' && (!Number.isFinite(previousPrice) || !listing.asking_price || previousPrice <= Number(listing.asking_price))) throw fail(400, 'Confirm a previous price above the saved current price.')
    const brand = await read(scoped.from('organisation_branding').select('organisation_display_name,logo_dark_url,logo_light_url,primary_brand_color').eq('organisation_id', org).maybeSingle())
    const organisation = await read(scoped.from('organisations').select('name,display_name,logo_url').eq('id', org).maybeSingle())
    const facts = { title: listing.title, suburb: listing.suburb, city: listing.city, propertyType: listing.property_type, bedrooms: listing.bedrooms, bathrooms: listing.bathrooms, price: listing.asking_price, event: event ? { start: event.start, end: event.end } : null, previousPrice }
    let refinement
    try { refinement = campaignRefinement(body.previous, body.targetField || 'all') } catch { throw fail(400, 'Choose a supported copy field and provide the current draft wording.') }
    const input = { facts, objective: body.objective, language: body.language, brief: text(body.brief), previous: refinement.previous, targetField: refinement.targetField }
    if ((!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY) || !env.SUPABASE_SERVICE_ROLE_KEY) throw fail(503, 'Managed AI is not configured. Ask your agency administrator.')
    const admin = clientFactory(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const reservation = await admin.rpc('ai_campaign_reserve', { p_id: body.requestId, p_org: org, p_actor: actor, p_campaign: campaign.id, p_fingerprint: fingerprint({ input, listing, brand, organisation, eventId: savedEvent?.id || null, campaignUpdatedAt: campaign.updated_at || null }) })
    if (reservation.error) {
      const message = reservation.error.message || ''
      throw fail(429, /spending limit/.test(message) ? 'Agency AI spending limit reached.' : 'AI is unavailable for this agency or this request was already used. Check setup before retrying.')
    }
    const allowance = reservation.data
    if (allowance.status === 'succeeded') return currentResult(allowance.result)
    if (!allowance.claimed) throw fail(409, 'This AI request is already processing or failed. Check recorded usage before creating another request.')
    let generated
    try {
      if (typeof allowance.model !== 'string' || !allowance.model.trim() || allowance.model.length > 200 || !Number.isFinite(Number(allowance.input_rate)) || Number(allowance.input_rate) < 0 || !Number.isFinite(Number(allowance.output_rate)) || Number(allowance.output_rate) < 0) throw Object.assign(new Error('Invalid configured AI model'), { accounting: { inputTokens: 0, outputTokens: 0, costKnown: true } })
      generated = await generate({ ...input, model: allowance.model, ...campaignProviderConfiguration(allowance, env), writingPreferences: allowance.writing_preferences })
      const changedFields = input.targetField === 'all' ? COPY_FIELDS : [input.targetField]
      // A provider adapter cannot replace unrelated manual edits even if its output is broad.
      const copy = input.targetField === 'all' ? generated.copy : { ...input.previous, [input.targetField]: generated.copy[input.targetField] }
      const checks = await Promise.all([
        scoped.from('email_campaigns').select(campaignFields).eq('organisation_id', org).eq('id', campaign.id).maybeSingle(),
        scoped.from('private_listings').select(FIELDS).eq('organisation_id', org).eq('id', listing.id).maybeSingle(),
        ...(savedEvent ? [scoped.from('marketing_events').select(EVENT_FIELDS).eq('organisation_id', org).eq('id', savedEvent.id).maybeSingle()] : []),
      ])
      const campaignChanged = !checks[0].data || checks[0].data.status !== 'draft' || checks[0].data.created_by !== campaign.created_by || checks[0].data.updated_at !== campaign.updated_at
      const listingChanged = !checks[1].data || fingerprint(checks[1].data) !== fingerprint(listing)
      const eventChanged = savedEvent && (!isCampaignShowDayMarketReady(checks[2].data, listing.id, org) || Date.parse(checks[2].data.starts_at) <= Date.now() || Date.parse(checks[2].data.starts_at) !== Date.parse(savedEvent.starts_at) || Date.parse(checks[2].data.ends_at) !== Date.parse(savedEvent.ends_at))
      const applicability = checks.some((check) => check.error) ? 'unverified' : campaignChanged || listingChanged || eventChanged ? 'stale' : 'current'
      const result = { copy, targetField: input.targetField, changedFields, campaignId: campaign.id, campaignUpdatedAt: campaign.updated_at || null, requestId: body.requestId, source: sourceFor(listing), applicability, listing, event, previousPrice, language: body.language, objective: body.objective, brand: { name: brand?.organisation_display_name || organisation?.display_name || organisation?.name || '', logoUrl: brand?.logo_dark_url || brand?.logo_light_url || organisation?.logo_url || '', primaryColour: brand?.primary_brand_color || '#18765b' }, usageId: body.requestId }
      const cost = generated.costKnown ? (generated.inputTokens * Number(allowance.input_rate) + generated.outputTokens * Number(allowance.output_rate)) / 1000000 : null
      const settled = await admin.rpc('ai_campaign_settle', { p_id: body.requestId, p_input: generated.inputTokens, p_output: generated.outputTokens, p_cost: cost, p_success: true, p_result: result })
      if (settled.error) throw fail(503, 'Generation completed but accounting could not be confirmed. Check recorded usage before creating another request.')
      return currentResult(result)
    } catch (error) {
      if (error.status && !error.accounting) throw error
      const usage = error.accounting || generated || {}
      const cost = usage.costKnown ? ((usage.inputTokens || 0) * Number(allowance.input_rate) + (usage.outputTokens || 0) * Number(allowance.output_rate)) / 1000000 : null
      await admin.rpc('ai_campaign_settle', { p_id: body.requestId, p_input: usage.inputTokens || 0, p_output: usage.outputTokens || 0, p_cost: cost, p_success: false, p_result: null })
      throw fail(error.status || 502, error.status ? error.message : 'AI could not complete this draft. Your saved draft is unchanged. Check usage and provider availability before retrying.')
    }
  } catch (error) { return { status: error.status || 503, body: { error: error.status ? error.message : 'Campaign assistant is temporarily unavailable.', ...(error.code ? { code: error.code } : {}) } } }
}
