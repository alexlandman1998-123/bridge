import { getDeploymentEnvironment, isProductionEnvironment, validateProductionConfiguration } from '../../config/productionValidation'
import { getRuntimeEnvValidation } from '../../lib/envValidation'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { runIntegrityChecks } from '../validation/validationEngine'
import { getAuditMetrics } from './auditMetrics'

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

function buildCheck(name, ok, message, severity = ok ? 'info' : 'critical', metadata = {}) {
  return { name, ok: Boolean(ok), message, severity, metadata }
}

export async function deploymentHealthCheck({ persist = false, createdBy = null } = {}) {
  const production = validateProductionConfiguration({ strict: isProductionEnvironment() })
  const runtimeEnv = getRuntimeEnvValidation()
  const checks = [
    buildCheck('production_flags', production.ok, production.ok ? 'Unsafe production flags are disabled.' : production.message, 'critical', production),
    buildCheck('runtime_env', runtimeEnv.ok, runtimeEnv.ok ? 'Required runtime environment variables exist.' : runtimeEnv.message, 'critical', runtimeEnv),
    buildCheck('supabase_configured', Boolean(isSupabaseConfigured && supabase), 'Supabase client configuration is available.'),
  ]

  if (isSupabaseConfigured && supabase) {
    const tables = ['profiles', 'organisation_users', 'organisations', 'onboarding_states', 'security_audit_events']
    for (const table of tables) {
      const result = await supabase.from(table).select('id', { head: true, count: 'exact' }).limit(1)
      checks.push(buildCheck(
        `table_${table}`,
        !result.error,
        result.error ? `${table} is not queryable.` : `${table} is queryable.`,
        result.error ? 'critical' : 'info',
        result.error ? { code: result.error.code, message: result.error.message } : {},
      ))
    }
  }

  const failed = checks.filter((check) => !check.ok)
  const status = failed.some((check) => check.severity === 'critical') ? 'failed' : failed.length ? 'warning' : 'passed'
  const summary = {
    status,
    failedCount: failed.length,
    checkCount: checks.length,
    environment: getDeploymentEnvironment(),
  }

  if (persist && isSupabaseConfigured && supabase) {
    const write = await supabase
      .from('deployment_check_runs')
      .insert({
        status,
        environment: summary.environment,
        checks,
        summary,
        created_by: createdBy || null,
      })
    if (write.error && !isMissingSchemaError(write.error, 'deployment_check_runs')) throw write.error
  }

  return { status, checks, summary }
}

export async function getOperationalHealthSummary({ createdBy = null } = {}) {
  const [deployment, auditMetrics, integrity] = await Promise.all([
    deploymentHealthCheck({ persist: false, createdBy }),
    getAuditMetrics(),
    runIntegrityChecks({ persistSnapshot: false, createdBy }),
  ])

  return {
    status: deployment.status === 'failed' || integrity.status === 'invalid' ? 'critical' : 'healthy',
    deployment,
    auditMetrics,
    integrity,
  }
}
