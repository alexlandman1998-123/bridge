import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for invite diagnostics.')
  }
  return supabase
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

export async function getCanonicalInviteHealth() {
  const client = requireClient()
  const { data, error } = await client.rpc('bridge_canonical_invite_health')
  if (error) throw error
  const payload = normalizeObject(data)
  return {
    status: payload.status || 'unknown',
    generatedAt: payload.generatedAt || payload.generated_at || null,
    totals: normalizeObject(payload.totals),
    issues: normalizeArray(payload.issues),
  }
}

export async function reconcileCanonicalInvites({ dryRun = true } = {}) {
  const client = requireClient()
  const { data, error } = await client.rpc('bridge_reconcile_canonical_invites', {
    p_dry_run: Boolean(dryRun),
  })
  if (error) throw error
  const payload = normalizeObject(data)
  return {
    success: Boolean(payload.success),
    dryRun: payload.dryRun ?? payload.dry_run ?? Boolean(dryRun),
    generatedAt: payload.generatedAt || payload.generated_at || null,
    actions: normalizeArray(payload.actions),
    health: normalizeObject(payload.health),
  }
}

export async function applyCanonicalInviteReconciliation() {
  return reconcileCanonicalInvites({ dryRun: false })
}
