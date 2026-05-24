import { getDeploymentEnvironment } from '../../config/productionValidation'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'
import { getDemoEnvironmentSummary } from '../demo/demoEnvironmentService'
import { deploymentHealthCheck, getOperationalHealthSummary } from '../observability/systemHealth'
import { QA_REGRESSION_MATRIX } from './qaRegressionMatrix'

const READINESS_CATEGORIES = Object.freeze([
  'auth',
  'onboarding',
  'workspace',
  'permissions',
  'transactions',
  'client_portal',
  'performance',
  'support',
  'observability',
  'security',
])

function isMissingSchemaError(error, token = '') {
  const code = String(error?.code || '').toLowerCase()
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === '42703' || code === 'pgrst204' || code === 'pgrst205' || message.includes(token.toLowerCase())
}

function readinessRow(category, status, riskLevel, blockers = [], recommendations = [], evidence = {}) {
  return { category, status, riskLevel, blockers, recommendations, evidence }
}

function buildRows({ deployment, health, demo }) {
  const deploymentFailed = deployment.status === 'failed'
  const integrityInvalid = health.status === 'critical'
  const demoReady = Boolean(demo.backendConfigured && !demo.schemaMissing && demo.environmentSettings?.demo_tools_enabled)

  return READINESS_CATEGORIES.map((category) => {
    if (category === 'auth') {
      return readinessRow(
        category,
        deploymentFailed ? 'fail' : 'pass',
        deploymentFailed ? 'critical' : 'low',
        deploymentFailed ? ['Deployment health failed; auth boot cannot be trusted.'] : [],
        deploymentFailed ? ['Fix production configuration and rerun deployment health checks.'] : [],
        { deploymentStatus: deployment.status },
      )
    }
    if (category === 'observability') {
      const metrics = health.auditMetrics || {}
      const hasSignals = Number(metrics.telemetryEvents || 0) + Number(metrics.errorEvents || 0) + Number(metrics.securityEvents || 0) > 0
      return readinessRow(
        category,
        hasSignals ? 'pass' : 'warning',
        hasSignals ? 'low' : 'medium',
        [],
        hasSignals ? [] : ['Run staging smoke tests to generate telemetry, error, and audit evidence.'],
        { metrics },
      )
    }
    if (category === 'security') {
      return readinessRow(
        category,
        deploymentFailed ? 'fail' : 'pass',
        deploymentFailed ? 'critical' : 'low',
        deploymentFailed ? ['Unsafe environment configuration detected.'] : [],
        ['Confirm production RLS policies and route guards before go-live.'],
        { checks: deployment.checks?.map((check) => ({ name: check.name, ok: check.ok })) || [] },
      )
    }
    if (category === 'support') {
      return readinessRow(
        category,
        'warning',
        'medium',
        [],
        ['Run a support tabletop exercise using the diagnostics page and support playbook.'],
        { operationsCenter: true },
      )
    }
    if (category === 'performance') {
      return readinessRow(
        category,
        'warning',
        'medium',
        [],
        ['Run staged load tests for large workspaces, reports, and document-heavy transactions.'],
        { loadTestingPrepared: true },
      )
    }
    if (category === 'onboarding' || category === 'workspace') {
      return readinessRow(
        category,
        integrityInvalid ? 'fail' : 'warning',
        integrityInvalid ? 'high' : 'medium',
        integrityInvalid ? ['Integrity checks report invalid onboarding/workspace state.'] : [],
        ['Run the full onboarding regression matrix in staging.'],
        { integrityStatus: health.integrity?.status || 'unknown' },
      )
    }
    if (category === 'permissions') {
      return readinessRow(
        category,
        deploymentFailed ? 'fail' : 'warning',
        deploymentFailed ? 'critical' : 'medium',
        deploymentFailed ? ['Deployment safety check failed.'] : [],
        ['Run wrong-module, pending, suspended, branch-only, and assigned-only tests in staging.'],
        { routeGuards: true },
      )
    }
    if (category === 'transactions' || category === 'client_portal') {
      return readinessRow(
        category,
        demoReady ? 'warning' : 'fail',
        demoReady ? 'medium' : 'high',
        demoReady ? [] : ['Seeded demo environment is not marked ready.'],
        ['Validate seeded transaction and client portal flows after each staging reset.'],
        { demoReady },
      )
    }
    return readinessRow(category, 'not_checked', 'medium', [], ['Run the Phase 8 regression matrix.'])
  })
}

function summarize(rows) {
  const blockers = rows.flatMap((row) => row.blockers.map((blocker) => ({ category: row.category, blocker })))
  const failed = rows.filter((row) => row.status === 'fail')
  const warnings = rows.filter((row) => row.status === 'warning')
  const score = Math.max(0, Math.round(((rows.length - failed.length - warnings.length * 0.5) / rows.length) * 100))
  return {
    status: failed.length ? 'blocked' : warnings.length ? 'needs_review' : 'ready',
    score,
    failedCount: failed.length,
    warningCount: warnings.length,
    blockerCount: blockers.length,
    blockers,
  }
}

export async function calculateLaunchReadiness({ persist = false, checkedBy = null, releaseVersion = '' } = {}) {
  const [deployment, health, demo] = await Promise.all([
    deploymentHealthCheck({ persist: false, createdBy: checkedBy }),
    getOperationalHealthSummary({ createdBy: checkedBy }),
    getDemoEnvironmentSummary(),
  ])
  const rows = buildRows({ deployment, health, demo })
  const summary = summarize(rows)

  if (persist && isSupabaseConfigured && supabase) {
    const payload = rows.map((row) => ({
      environment: getDeploymentEnvironment(),
      release_version: releaseVersion || null,
      category: row.category,
      status: row.status,
      risk_level: row.riskLevel,
      blockers: row.blockers,
      recommendations: row.recommendations,
      evidence: row.evidence,
      checked_by: checkedBy || null,
    }))
    const result = await supabase.from('launch_readiness_checks').insert(payload)
    if (result.error && !isMissingSchemaError(result.error, 'launch_readiness_checks')) throw result.error
  }

  return {
    environment: getDeploymentEnvironment(),
    summary,
    rows,
    regressionMatrix: QA_REGRESSION_MATRIX,
  }
}
