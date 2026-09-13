import { supabase } from '../lib/supabaseClient'

function text(value = '') { return String(value || '').trim() }
function count(value = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }

export function normalizeProperty24StatisticsSyncRun(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    id: text(source.id),
    status: text(source.status).toLowerCase() || 'unknown',
    environment: text(source.environment),
    startedAt: text(source.started_at || source.startedAt),
    completedAt: text(source.completed_at || source.completedAt),
    receivedCount: count(source.received_count || source.receivedCount),
    storedCount: count(source.stored_count || source.storedCount),
    errorSummary: source.error_summary && typeof source.error_summary === 'object' ? source.error_summary : {},
  }
}

export async function getProperty24StatisticsSyncRuns({ organisationId = '', limit = 8 } = {}) {
  const orgId = text(organisationId)
  if (!orgId || !supabase) return []
  const result = await supabase
    .from('property24_statistics_sync_runs')
    .select('id,status,environment,started_at,completed_at,received_count,stored_count,error_summary')
    .eq('organisation_id', orgId)
    .order('started_at', { ascending: false })
    .limit(Math.max(1, Math.min(20, count(limit) || 8)))
  if (result.error) throw result.error
  return (result.data || []).map(normalizeProperty24StatisticsSyncRun)
}

export async function runProperty24StatisticsSync({ organisationId = '' } = {}) {
  const orgId = text(organisationId)
  if (!orgId) throw new Error('Choose an organisation before syncing Property24 statistics.')
  if (!supabase) throw new Error('Property24 statistics are unavailable until Supabase is configured.')
  const sessionResult = await supabase.auth.getSession()
  const accessToken = text(sessionResult.data?.session?.access_token)
  if (!accessToken) throw new Error('Sign in again before syncing Property24 statistics.')
  const response = await fetch('/api/property24/settings/statistics-sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ organisationId: orgId }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(text(payload.message) || 'Property24 statistics sync failed.')
  return payload.report || {}
}
