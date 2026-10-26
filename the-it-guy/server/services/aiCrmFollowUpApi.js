import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { generateCampaignCopy, campaignProviderConfiguration, validateCampaignCopy } from './aiCampaignProvider.js'
import { crmFollowUpBrief } from '../../src/services/crmFollowUpAiModel.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LEAD_FIELDS = 'lead_id,organisation_id,assigned_agent_id,branch_id,lead_domain,lead_category,stage,status,area_interest,updated_at'
const TASK_FIELDS = 'task_id,due_date,status,updated_at'
const fail = (status, message, code) => Object.assign(new Error(message), { status, code })
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const changed = () => fail(409, 'This lead or its follow-up facts changed. Refresh the saved brief before using a proposal.', 'CRM_FOLLOW_UP_CHANGED')
async function read(query) {
  const result = await query
  if (result.error) throw fail(503, 'The saved CRM brief could not be checked. Your manual work is available; refresh before using this proposal.')
  return result
}
async function source(scoped, org, leadId, now) {
  const { data: lead } = await read(scoped.from('leads').select(LEAD_FIELDS).eq('organisation_id', org).eq('lead_id', leadId).maybeSingle())
  if (!lead || (lead.lead_domain && lead.lead_domain !== 'agency')) throw fail(404, 'An authorised agency CRM lead is required.')
  if (/^(archived|deleted|lost|won|converted|closed)$/i.test(String(lead.status || '').trim()) || !Number.isFinite(Date.parse(lead.updated_at))) throw fail(409, 'Use an active, saved lead for follow-up assistance.')
  const access = await read(scoped.rpc('bridge_can_access_assignment', { target_org: org, assigned_user: lead.assigned_agent_id, target_branch: lead.branch_id || null }))
  if (access.data !== true) throw fail(403, 'Follow-up assistance is outside your lead action permissions.')
  const [{ data: tasks }, activity] = await Promise.all([
    read(scoped.from('tasks').select(TASK_FIELDS).eq('organisation_id', org).eq('lead_id', leadId).order('task_id').limit(501)),
    read(scoped.from('lead_activities').select('activity_id,activity_date,created_at', { count: 'exact' }).eq('organisation_id', org).eq('lead_id', leadId).order('activity_date', { ascending: false }).limit(1)),
  ])
  if (!Array.isArray(tasks) || tasks.length > 500 || !Array.isArray(activity.data) || !Number.isSafeInteger(activity.count) || activity.count < 0) throw fail(503, 'This lead’s complete follow-up facts are unavailable. Use the activity workspace manually.')
  const brief = crmFollowUpBrief(lead, tasks, activity.data[0], activity.count, now)
  return { brief: { ...brief, fingerprint: hash({ lead, tasks, activity: activity.data, count: activity.count, facts: brief.facts }) } }
}
function assertCurrent(body, brief) {
  if (body.expectedUpdatedAt !== brief.updatedAt || body.sourceFingerprint !== brief.fingerprint) throw changed()
}
function reply(result) {
  return result?.applicability === 'current' ? { status: 200, body: result } : { status: 409, body: { error: changed().message, code: 'CRM_FOLLOW_UP_CHANGED', usageId: result?.usageId } }
}
export async function handleCrmFollowUpAi({ method, headers = {}, body = {}, env = process.env, clientFactory = createClient, generate = generateCampaignCopy, now = new Date() } = {}) {
  if (method !== 'POST') return { status: 405, body: { error: 'Use POST.' } }
  try {
    if (!body || Array.isArray(body) || typeof body !== 'object' || Buffer.byteLength(JSON.stringify(body)) > 3000) throw fail(400, 'Invalid CRM follow-up request.')
    if (!['crm_follow_up_brief', 'crm_follow_up_check', 'crm_follow_up_generate'].includes(body.action)) throw fail(400, 'Unknown CRM follow-up action.')
    const token = String(headers.authorization || headers.Authorization || '').match(/^Bearer (.+)$/i)?.[1]
    if (!token) throw fail(401, 'Sign in to use lead follow-up assistance.')
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL, key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
    if (!url || !key) throw fail(503, 'CRM follow-up assistance is not configured.')
    const scoped = clientFactory(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } })
    const auth = await scoped.auth.getUser(token), actor = auth.data?.user?.id
    if (auth.error || !actor) throw fail(401, 'Sign in to use lead follow-up assistance.')
    const org = body.organisationId
    if (!UUID.test(org || '') || !UUID.test(body.leadId || '')) throw fail(400, 'Open a saved CRM lead first.')
    if ((await read(scoped.rpc('bridge_has_organisation_membership', { target_organisation_id: org }))).data !== true) throw fail(403, 'Agency access is unavailable.')
    const { brief } = await source(scoped, org, body.leadId, now)
    if (body.action === 'crm_follow_up_brief') return { status: 200, body: { brief } }
    assertCurrent(body, brief)
    if (body.action === 'crm_follow_up_check') return { status: 200, body: { brief } }
    if (!UUID.test(body.requestId || '') || !['en', 'af'].includes(body.language) || !['warm', 'professional', 'concise'].includes(body.tone)) throw fail(400, 'Choose a supported language and tone.')
    if (!env.SUPABASE_SERVICE_ROLE_KEY || (!env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY)) throw fail(503, 'Managed AI is not configured. Edit the manual outreach draft below.')
    const input = { campaignKind: 'crm', facts: brief.facts, objective: 'permission_aware_lead_follow_up', language: body.language, brief: body.tone }
    const admin = clientFactory(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const reservation = await admin.rpc('ai_crm_follow_up_reserve', { p_id: body.requestId, p_org: org, p_actor: actor, p_lead: body.leadId, p_fingerprint: hash({ input, source: brief.fingerprint }) })
    if (reservation.error) throw fail(429, /spending limit/.test(reservation.error.message || '') ? 'Agency AI spending limit reached.' : 'CRM follow-up AI is not enabled, or this request is already in use. Check agency setup.')
    const allowance = reservation.data
    if (allowance?.status === 'succeeded') return reply(allowance.result)
    if (!allowance?.claimed) throw fail(409, 'This AI request is already processing or failed. Check usage before requesting another proposal.')
    let generated
    try {
      if (typeof allowance.model !== 'string' || !allowance.model.trim() || !Number.isFinite(Number(allowance.input_rate)) || !Number.isFinite(Number(allowance.output_rate)) || Number(allowance.input_rate) < 0 || Number(allowance.output_rate) < 0) throw Object.assign(new Error('Invalid AI configuration'), { accounting: { inputTokens: 0, outputTokens: 0, costKnown: true } })
      // Agency free-form writing preferences are deliberately excluded here.
      generated = await generate({ ...input, model: allowance.model, ...campaignProviderConfiguration(allowance, env) })
      const copy = validateCampaignCopy(generated.copy)
      let applicability = 'stale'
      try { const fresh = await source(scoped, org, body.leadId, now); applicability = fresh.brief.fingerprint === brief.fingerprint ? 'current' : 'stale' } catch { /* fail closed after a paid response */ }
      const result = { leadId: body.leadId, updatedAt: brief.updatedAt, sourceFingerprint: brief.fingerprint, usageId: body.requestId, requestId: body.requestId, applicability, proposal: { title: copy.heading, outreach: copy.intro }, nextAction: brief.nextAction }
      const cost = generated.costKnown ? (generated.inputTokens * Number(allowance.input_rate) + generated.outputTokens * Number(allowance.output_rate)) / 1000000 : null
      const settled = await admin.rpc('ai_campaign_settle', { p_id: body.requestId, p_input: generated.inputTokens, p_output: generated.outputTokens, p_cost: cost, p_success: true, p_result: result })
      if (settled.error) throw fail(503, 'Generation finished but accounting could not be confirmed. Check usage before retrying.')
      return reply(result)
    } catch (error) {
      if (error.status && !error.accounting) throw error
      const usage = error.accounting || generated || {}
      const cost = usage.costKnown ? ((usage.inputTokens || 0) * Number(allowance.input_rate) + (usage.outputTokens || 0) * Number(allowance.output_rate)) / 1000000 : null
      await admin.rpc('ai_campaign_settle', { p_id: body.requestId, p_input: usage.inputTokens || 0, p_output: usage.outputTokens || 0, p_cost: cost, p_success: false, p_result: null })
      throw fail(error.status || 502, error.status ? error.message : 'AI could not complete this proposal. Your lead and manual draft are unchanged.')
    }
  } catch (error) { return { status: error.status || 503, body: { error: error.status ? error.message : 'CRM follow-up assistance is temporarily unavailable.', ...(error.code ? { code: error.code } : {}) } } }
}
