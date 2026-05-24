import { getDeploymentEnvironment, isDemoLikeEnvironment } from '../../config/productionValidation'
import { getUnsafeEnvironmentFlags } from '../../lib/envValidation'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { trackTelemetryEvent } from '../observability/telemetry'
import { DEMO_ACCOUNTS, DEMO_ENVIRONMENT_DOMAINS, DEMO_FLOWS, DEMO_SEED_MANIFEST } from './demoManifest'

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

function isDemoToolingEnabledByFlag() {
  const unsafeFlags = getUnsafeEnvironmentFlags()
  return Boolean(unsafeFlags.enableDemoMode || unsafeFlags.enableMockData)
}

export function canUseDemoTooling() {
  return isDemoLikeEnvironment() && isDemoToolingEnabledByFlag()
}

export function getDemoEnvironmentPlan() {
  const environment = getDeploymentEnvironment()
  return {
    environment,
    domains: DEMO_ENVIRONMENT_DOMAINS,
    demoToolsAllowed: canUseDemoTooling(),
    demoToolsReason: canUseDemoTooling()
      ? 'Demo tooling is enabled for this isolated environment.'
      : 'Demo tooling requires a demo/staging/local environment and an explicit demo/mock flag.',
    accounts: DEMO_ACCOUNTS,
    manifests: DEMO_SEED_MANIFEST,
    flows: DEMO_FLOWS,
  }
}

export async function getDemoEnvironmentSummary() {
  const plan = getDemoEnvironmentPlan()
  if (!isSupabaseConfigured || !supabase) {
    return {
      ...plan,
      backendConfigured: false,
      environmentSettings: null,
      storedManifests: [],
      recentResets: [],
    }
  }

  const [settingsResult, manifestsResult, resetsResult] = await Promise.all([
    supabase.from('platform_environment_settings').select('*').eq('id', true).maybeSingle(),
    supabase.from('demo_seed_manifests').select('*').order('created_at', { ascending: false }).limit(25),
    supabase.from('demo_reset_runs').select('*').order('started_at', { ascending: false }).limit(10),
  ])

  const missingSchema = [settingsResult, manifestsResult, resetsResult].some((result) => result?.error && isMissingSchemaError(result.error))
  if (missingSchema) {
    return {
      ...plan,
      backendConfigured: true,
      environmentSettings: null,
      storedManifests: [],
      recentResets: [],
      schemaMissing: true,
    }
  }

  for (const result of [settingsResult, manifestsResult, resetsResult]) {
    if (result?.error) throw result.error
  }

  return {
    ...plan,
    backendConfigured: true,
    environmentSettings: settingsResult.data || null,
    storedManifests: manifestsResult.data || [],
    recentResets: resetsResult.data || [],
    schemaMissing: false,
  }
}

export async function resetDemoEnvironment({ scope = 'all', dryRun = true, userId = '' } = {}) {
  if (!canUseDemoTooling()) {
    return {
      ok: false,
      status: 'blocked',
      message: 'Demo reset is disabled unless this is an explicitly configured demo or staging environment.',
      plan: getDemoEnvironmentPlan(),
    }
  }

  if (!isSupabaseConfigured || !supabase) {
    return {
      ok: false,
      status: 'blocked',
      message: 'Demo reset requires Supabase so the reset request can be audited.',
      plan: getDemoEnvironmentPlan(),
    }
  }

  const result = await supabase.rpc('request_demo_environment_reset', {
    p_reset_scope: scope,
    p_dry_run: Boolean(dryRun),
  })

  if (result.error) {
    if (isMissingSchemaError(result.error, 'request_demo_environment_reset')) {
      return {
        ok: false,
        status: 'schema_missing',
        message: 'Demo reset tables/functions are not installed in this environment.',
      }
    }
    throw result.error
  }

  await trackTelemetryEvent({
    category: 'demo',
    eventName: dryRun ? 'demo_reset_dry_run' : 'demo_reset_requested',
    userId,
    severity: dryRun ? 'info' : 'warning',
    metadata: { scope, result: result.data },
  })

  return result.data
}
