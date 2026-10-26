import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { metaIntegrationRequest } from './metaIntegrationService'
import { buildMarketingCalendar, validCalendarDate, shiftCalendarDate } from './marketingCalendarModel'

const PAGE_SIZE = 500
const SOURCES = [
  ['campaigns', 'Campaign plans', 'marketing_campaigns', 'id,name,status,start_date,end_date'],
  ['activities', 'Campaign links', 'marketing_campaign_activities', 'id,campaign_id,channel,email_campaign_id,whatsapp_campaign_id'],
  ['email', 'Email', 'email_campaigns', 'id,name,status,scheduled_for,sent_at'],
  ['whatsapp', 'WhatsApp', 'whatsapp_campaign_performance', 'id,name,status,display_status,scheduled_at,sent_at'],
]

// Calendar metadata only: no campaign content, audiences or analytics. Each read
// stays under the signed-in user's RLS and is scoped to the selected agency.
export async function loadWorkspaceMarketingCalendar(organisationId, { from, to, signal } = {}) {
  if (!organisationId || !isSupabaseConfigured || !supabase) throw new Error('Choose a connected workspace to load marketing.')
  if (!validCalendarDate(from) || !validCalendarDate(to) || from > to) throw new Error('Choose a valid calendar period.')
  const after = `${shiftCalendarDate(to, 1)}T00:00:00+02:00`, before = `${from}T00:00:00+02:00`
  async function readSource([key, , table, columns]) {
    const rows = []
    for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
      signal?.throwIfAborted()
      let query = supabase.from(table).select(columns).eq('organisation_id', organisationId).order('id')
      if (key === 'campaigns') query = query.or(`start_date.lte.${to},end_date.lte.${to}`).or(`end_date.gte.${from},end_date.is.null`)
      if (key === 'email' || key === 'whatsapp') {
        const scheduled = key === 'email' ? 'scheduled_for' : 'scheduled_at'
        query = query.or(`and(sent_at.gte.${before},sent_at.lt.${after}),and(${scheduled}.gte.${before},${scheduled}.lt.${after})`)
      }
      const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1).abortSignal(signal)
      if (error) throw new Error('Calendar source unavailable.')
      rows.push(...(data || []))
      if ((data || []).length < PAGE_SIZE) return rows
    }
    throw new Error('Calendar source exceeds the safe read limit.')
  }
  const results = await Promise.allSettled(SOURCES.map(readSource))
  signal?.throwIfAborted()
  const workspace = { campaigns: [], activities: [], channels: {} }, warnings = []
  results.forEach((result, index) => {
    const [key, label] = SOURCES[index]
    if (result.status === 'rejected') warnings.push(`${label} could not be loaded.`)
    const data = result.status === 'fulfilled' ? result.value : []
    if (key === 'campaigns' || key === 'activities') workspace[key] = data
    else workspace.channels[key] = { data }
  })
  // The established Meta endpoint enforces its own workspace/provider access.
  // It is bounded independently so a post-source failure never holds up bookings.
  let timer
  try {
    const result = await Promise.race([
      metaIntegrationRequest(organisationId, 'calendar_posts'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Posts timed out.')), 10000) }),
    ])
    if (!Array.isArray(result.posts)) throw new Error('Posts unavailable.')
    workspace.channels.posts = { data: result.posts }
  } catch { warnings.push('Facebook posts could not be loaded.') }
  finally { clearTimeout(timer) }
  signal?.throwIfAborted()
  const calendar = buildMarketingCalendar(workspace)
  return { items: calendar.items, warnings }
}
