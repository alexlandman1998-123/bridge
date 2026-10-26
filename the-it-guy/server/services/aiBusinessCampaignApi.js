import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { generateCampaignCopy, campaignProviderConfiguration, campaignRefinement } from './aiCampaignProvider.js'
import { applyBusinessCampaignCopy, businessCampaignPlan, businessOpening, businessOpeningIsProtected, BUSINESS_AI_FAMILIES } from '../../src/services/businessCampaignAiModel.js'
import { assertCampaignContacts, GENERAL_CONTACT_FIELDS } from '../../src/services/campaignContactProvenance.js'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FIELDS = 'id,organisation_id,created_by,status,revision,campaign_builder,channel_content'
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const fail = (status, message, code) => Object.assign(new Error(message), { status, code })
async function read(query) { const { data, error } = await query; if (error) throw fail(503, 'Business campaign information is unavailable. Check campaign setup before retrying.'); return data }
function response(result) {
  return result?.applicability === 'current' ? { status: 200, body: result } : { status: 409, body: { error: 'The saved campaign or confirmed public details changed. Review your current work before generating again.', code: 'BUSINESS_CAMPAIGN_CHANGED', usageId: result?.usageId } }
}
export async function handleBusinessCampaignAi({ method, headers = {}, body = {}, env = process.env, clientFactory = createClient, generate = generateCampaignCopy } = {}) {
  if (method !== 'POST') return { status: 405, body: { error: 'Use POST.' } }
  try {
    if (!body || Array.isArray(body) || typeof body !== 'object' || Buffer.byteLength(JSON.stringify(body)) > 18000) throw fail(400, 'Invalid business campaign request.')
    const token = String(headers.authorization || headers.Authorization || '').match(/^Bearer (.+)$/i)?.[1]
    if (!token) throw fail(401, 'Sign in to use campaign AI.')
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL, key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) throw fail(503, 'Campaign AI is not configured.')
    const scoped = clientFactory(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
    const auth = await scoped.auth.getUser(token), actor = auth.data?.user?.id
    if (auth.error || !actor) throw fail(401, 'Sign in to use campaign AI.')
    const org = body.organisationId
    if (!UUID.test(org || '') || !UUID.test(body.campaignId || '') || !UUID.test(body.requestId || '') || !Number.isInteger(body.expectedRevision) || body.expectedRevision < 1) throw fail(400, 'Save the business campaign draft before using AI.')
    if (!await read(scoped.rpc('bridge_has_organisation_membership', { target_organisation_id: org }))) throw fail(403, 'Agency access is unavailable.')
    const campaign = await read(scoped.from('marketing_campaigns').select(FIELDS).eq('organisation_id', org).eq('id', body.campaignId).maybeSingle())
    if (!campaign || campaign.status !== 'draft') throw fail(404, 'An editable business campaign draft is required.')
    if (campaign.created_by !== actor && !await read(scoped.rpc('email_campaign_can_send', { p_organisation_id: org }))) throw fail(403, 'This campaign is outside your edit permissions.')
    if (campaign.revision !== body.expectedRevision) throw fail(409, 'This campaign changed. Reload it before generating.', 'BUSINESS_CAMPAIGN_CHANGED')
    const builder = campaign.campaign_builder, channel = body.channel, target = body.target || 'both'
    if (!BUSINESS_AI_FAMILIES.includes(builder?.template) || builder.reviewed !== true || !['email', 'whatsapp', 'social'].includes(channel) || !campaign.channel_content?.[channel] || !['both', 'title', 'opening'].includes(target)) throw fail(400, 'Review the campaign facts and choose an available channel first.')
    try { assertCampaignContacts(builder, undefined, GENERAL_CONTACT_FIELDS) } catch (error) { throw fail(400, error.message) }
    if (['buyer-demand', 'client-success', 'key-handover'].includes(builder.template) && builder.permission !== true) throw fail(400, 'Confirm public sharing permission before generating.')
    if (!['en-ZA', 'af-ZA'].includes(builder.source?.language) || typeof builder.details?.area !== 'string' || builder.details.area.length > 120) throw fail(400, 'Confirm language and campaign area first.')
    const setup = await read(scoped.from('marketing_campaign_setup').select('revision,confirmed_preferences').eq('organisation_id', org).maybeSingle())
    if (!setup?.confirmed_preferences || setup.confirmed_preferences.agencyName !== builder.source?.agencyName) throw fail(409, 'Confirmed agency details changed. Refresh campaign details before using AI.', 'BUSINESS_CAMPAIGN_CHANGED')
    const selected = campaign.channel_content[channel]
    if (typeof selected.title !== 'string' || typeof selected.body !== 'string' || !selected.title.trim() || !selected.body.trim()) throw fail(400, 'Complete this channel’s title and body before refining it.')
    const opening = businessOpening(selected.body)
    const protectedText = Object.entries(builder.details).filter(([key]) => key !== 'area').map(([, value]) => value)
    const modelTitle = target === 'opening' || businessOpeningIsProtected(selected.title, protectedText) ? 'A helpful property conversation' : selected.title.slice(0, 180)
    const modelOpening = target === 'title' || businessOpeningIsProtected(opening.text, protectedText) ? 'An invitation to discuss property questions with your agent.' : opening.text.slice(0, 1600)
    const previous = { subject: modelTitle, previewText: 'Use a helpful invitation with a clear next step.', heading: modelTitle, intro: modelOpening, cta: 'Contact your agent' }
    try { campaignRefinement(previous) } catch { throw fail(400, 'Use plain text in the selected title and opening before refining it with AI.') }
    const input = { campaignKind: 'business', facts: { family: builder.template, area: builder.details.area, agencyName: setup.confirmed_preferences.agencyName, tone: String(builder.source.tone || '').slice(0, 120), channel }, objective: builder.template, language: builder.source.language === 'af-ZA' ? 'af' : 'en', previous, targetField: target === 'title' ? 'heading' : target === 'opening' ? 'intro' : 'all', brief: typeof body.brief === 'string' ? body.brief.trim().slice(0, 1500) : '' }
    if ((!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY) || !env.SUPABASE_SERVICE_ROLE_KEY) throw fail(503, 'Managed campaign AI is not configured. Manual editing remains available.')
    const admin = clientFactory(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const reservation = await admin.rpc('ai_business_campaign_reserve', { p_id: body.requestId, p_org: org, p_actor: actor, p_campaign: campaign.id, p_fingerprint: hash({ input, campaign, setup }) })
    if (reservation.error) throw fail(429, /spending limit/.test(reservation.error.message || '') ? 'Agency AI spending limit reached.' : 'Business campaign AI is not enabled, or this request is already in use. Check setup before retrying.')
    const allowance = reservation.data
    if (allowance?.status === 'succeeded') return response(allowance.result)
    if (!allowance?.claimed) throw fail(409, 'This AI request is already processing or failed. Check usage before creating another request.')
    let generated
    try {
      if (typeof allowance.model !== 'string' || !allowance.model.trim() || !Number.isFinite(Number(allowance.input_rate)) || !Number.isFinite(Number(allowance.output_rate)) || Number(allowance.input_rate) < 0 || Number(allowance.output_rate) < 0) throw Object.assign(new Error('Invalid AI configuration'), { accounting: { inputTokens: 0, outputTokens: 0, costKnown: true } })
      generated = await generate({ ...input, model: allowance.model, ...campaignProviderConfiguration(allowance, env), writingPreferences: allowance.writing_preferences })
      const content = applyBusinessCampaignCopy(campaign.channel_content, { channel, target, copy: generated.copy, protectedText })
      const fresh = await Promise.all([scoped.from('marketing_campaigns').select(FIELDS).eq('organisation_id', org).eq('id', campaign.id).maybeSingle(), scoped.from('marketing_campaign_setup').select('revision,confirmed_preferences').eq('organisation_id', org).maybeSingle()])
      const applicability = fresh.some((value) => value.error) || hash(fresh[0].data) !== hash(campaign) || hash(fresh[1].data) !== hash(setup) ? 'stale' : 'current'
      const result = { campaignId: campaign.id, revision: campaign.revision, requestId: body.requestId, usageId: body.requestId, channel, target, content, applicability, plan: { ...businessCampaignPlan(builder), approach: generated.copy.previewText }, source: { campaignRevision: campaign.revision, setupRevision: setup.revision, family: builder.template, area: builder.details.area } }
      const cost = generated.costKnown ? (generated.inputTokens * Number(allowance.input_rate) + generated.outputTokens * Number(allowance.output_rate)) / 1000000 : null
      const settled = await admin.rpc('ai_campaign_settle', { p_id: body.requestId, p_input: generated.inputTokens, p_output: generated.outputTokens, p_cost: cost, p_success: true, p_result: result })
      if (settled.error) throw fail(503, 'Generation finished but accounting could not be confirmed. Check usage before retrying.')
      return response(result)
    } catch (error) {
      if (error.status && !error.accounting) throw error
      const usage = error.accounting || generated || {}
      const cost = usage.costKnown ? ((usage.inputTokens || 0) * Number(allowance.input_rate) + (usage.outputTokens || 0) * Number(allowance.output_rate)) / 1000000 : null
      await admin.rpc('ai_campaign_settle', { p_id: body.requestId, p_input: usage.inputTokens || 0, p_output: usage.outputTokens || 0, p_cost: cost, p_success: false, p_result: null })
      throw fail(error.status || 502, error.status ? error.message : 'AI could not complete this proposal. Your saved campaign and manual edits are unchanged.')
    }
  } catch (error) { return { status: error.status || 503, body: { error: error.status ? error.message : 'Business campaign AI is temporarily unavailable.', ...(error.code ? { code: error.code } : {}) } } }
}
