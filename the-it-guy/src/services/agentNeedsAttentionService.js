import { supabase } from '../lib/supabaseClient'
import { assertResolvedWorkspaceContext } from './workspaceResolutionService'

const PAGE_SIZE = 500

async function readAll(organisationId, table, fields, idColumn, configure = (query) => query) {
  const rows = []
  for (let page = 0; page < 100; page += 1) {
    const query = supabase.from(table).select(fields).eq('organisation_id', organisationId).order(idColumn)
    const { data, error } = await configure(query).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if ((data || []).length < PAGE_SIZE) return rows
  }
  throw new Error('The attention queue could not be loaded completely. Please try again.')
}

// Read persisted CRM records only. Never turn a denied or failed read into an
// empty queue, or use browser-local records as evidence of outstanding work.
export async function loadAgentNeedsAttentionRecords(organisationId) {
  assertResolvedWorkspaceContext({ organisationId, appRole: 'agent' }, { service: 'agentNeedsAttention' })
  if (!supabase) throw new Error('The lead service is unavailable.')
  const [leads, tasks, contacts, activities] = await Promise.all([
    readAll(organisationId, 'leads', '*', 'lead_id'),
    readAll(organisationId, 'tasks', 'task_id, organisation_id, lead_id, assigned_agent_id, title, due_date, status, priority', 'task_id', (query) => query.not('due_date', 'is', null)),
    readAll(organisationId, 'contacts', 'contact_id, organisation_id, first_name, last_name', 'contact_id'),
    readAll(organisationId, 'lead_activities', 'activity_id, organisation_id, lead_id, activity_type', 'activity_id', (query) => query.eq('activity_type', 'Lead contacted')),
  ])
  return { leads, tasks, contacts, activities }
}
