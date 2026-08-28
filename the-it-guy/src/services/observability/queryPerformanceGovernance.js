import { buildQueryDatabaseDelta } from './queryPerformanceBudget.js'

export const QUERY_GOVERNANCE_CONTRACT = 'arch9-query-performance-governance-v1'

export const QUERY_REGRESSION_BUDGET = Object.freeze({
  metrics: Object.freeze({
    requestsPerMinuteP95: { maximumIncrease: 0.25, minimumDelta: 5, severity: 'warn' },
    routeLoadRequestsP95: { maximumIncrease: 0.25, minimumDelta: 3, severity: 'fail' },
    idleRequestsP95: { maximumIncrease: 0.25, minimumDelta: 1, severity: 'fail' },
    requestLatencyP95Ms: { maximumIncrease: 0.25, minimumDelta: 100, severity: 'fail' },
    errorRate: { maximumIncrease: 0.5, minimumDelta: 0.01, severity: 'warn' },
    peakRealtimeChannels: { maximumIncrease: 0.25, minimumDelta: 1, severity: 'fail' },
  }),
  database: Object.freeze({
    maxStatementCallsPerHour: { maximumIncrease: 0.25, minimumDelta: 100, severity: 'fail' },
    maxStatementExecutionMsPerHour: { maximumIncrease: 0.25, minimumDelta: 5000, severity: 'fail' },
    totalExecutionMsPerHour: { maximumIncrease: 0.25, minimumDelta: 10000, severity: 'fail' },
  }),
})

function finiteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function statusFromFindings(findings) {
  if (findings.some((item) => item.severity === 'fail')) return 'FAIL'
  if (findings.length) return 'WARN'
  return 'PASS'
}

function regression(scope, metric, baseline, current, rule) {
  const baselineValue = finiteNumber(baseline)
  const currentValue = finiteNumber(current)
  const delta = currentValue - baselineValue
  const increase = baselineValue > 0 ? delta / baselineValue : currentValue > 0 ? Infinity : 0
  if (delta < rule.minimumDelta || increase < rule.maximumIncrease) return null

  return {
    scope,
    metric,
    baseline: Math.round(baselineValue * 1000) / 1000,
    current: Math.round(currentValue * 1000) / 1000,
    delta: Math.round(delta * 1000) / 1000,
    increasePercent: Number.isFinite(increase) ? Math.round(increase * 1000) / 10 : null,
    severity: rule.severity === 'fail' ? 'fail' : 'warn',
  }
}

function snapshotAtOrBefore(snapshots, timestamp) {
  return [...snapshots]
    .filter((row) => Number.isFinite(Date.parse(row?.captured_at || '')))
    .sort((left, right) => Date.parse(right.captured_at) - Date.parse(left.captured_at))
    .find((row) => Date.parse(row.captured_at) <= timestamp)
}

export function partitionQueryGovernanceEvidence({
  windows = [],
  snapshots = [],
  now = Date.now(),
  periodHours = 24,
} = {}) {
  const periodMs = Math.max(1, finiteNumber(periodHours)) * 3_600_000
  const currentStartedAt = now - periodMs
  const baselineStartedAt = now - periodMs * 2
  const timestampOf = (row) => Date.parse(row?.created_at || row?.createdAt || '')
  const currentSnapshot = snapshotAtOrBefore(snapshots, now)
  const middleSnapshot = snapshotAtOrBefore(snapshots, currentStartedAt)
  const baselineSnapshot = snapshotAtOrBefore(snapshots, baselineStartedAt)

  return {
    current: {
      startedAt: new Date(currentStartedAt).toISOString(),
      endedAt: new Date(now).toISOString(),
      windows: windows.filter((row) => timestampOf(row) >= currentStartedAt && timestampOf(row) <= now),
      databaseDelta: buildQueryDatabaseDelta(middleSnapshot, currentSnapshot),
    },
    baseline: {
      startedAt: new Date(baselineStartedAt).toISOString(),
      endedAt: new Date(currentStartedAt).toISOString(),
      windows: windows.filter((row) => timestampOf(row) >= baselineStartedAt && timestampOf(row) < currentStartedAt),
      databaseDelta: buildQueryDatabaseDelta(baselineSnapshot, middleSnapshot),
    },
  }
}

export function evaluateQueryPerformanceGovernance({
  current,
  baseline,
  budget = QUERY_REGRESSION_BUDGET,
} = {}) {
  const ready = current?.ready === true && baseline?.ready === true
  const regressions = [
    ...Object.entries(budget.metrics).map(([metric, rule]) => (
      regression('telemetry', metric, baseline?.metrics?.[metric], current?.metrics?.[metric], rule)
    )),
    ...Object.entries(budget.database).map(([metric, rule]) => (
      regression('database', metric, baseline?.database?.[metric], current?.database?.[metric], rule)
    )),
  ].filter(Boolean)

  const currentBudgetStatus = current?.status || 'INSUFFICIENT_DATA'
  const regressionStatus = statusFromFindings(regressions)
  let status = 'INSUFFICIENT_DATA'
  if (ready) {
    status = currentBudgetStatus === 'FAIL' || regressionStatus === 'FAIL'
      ? 'FAIL'
      : currentBudgetStatus === 'WARN' || regressionStatus === 'WARN'
        ? 'WARN'
        : 'PASS'
  }

  const incidentRequired = status === 'FAIL'
  return {
    contract: QUERY_GOVERNANCE_CONTRACT,
    status,
    ready,
    currentBudgetStatus,
    baselineBudgetStatus: baseline?.status || 'INSUFFICIENT_DATA',
    regressionStatus,
    regressions,
    incident: {
      required: incidentRequired,
      title: incidentRequired
        ? 'Query performance regression requires investigation'
        : status === 'WARN'
          ? 'Query performance regression requires review'
          : status === 'PASS'
            ? 'Query performance is within steady-state limits'
            : 'Query performance governance needs more evidence',
      actions: incidentRequired || status === 'WARN'
        ? [
            'Review the regressed telemetry and query-ID counter metrics in this evidence artifact.',
            'Compare application and database releases from the current period with the baseline period.',
            'Open a remediation issue before accepting another release if a failing regression persists.',
          ]
        : [],
    },
  }
}

export function renderQueryPerformanceGovernanceSummary(report = {}) {
  const regressions = report.regressions || []
  const lines = [
    '# Query performance governance',
    '',
    `**Status:** ${report.status || 'ERROR'}`,
    `**Evidence ready:** ${report.ready === true ? 'yes' : 'no'}`,
    `**Current budget:** ${report.currentBudgetStatus || 'unavailable'}`,
    `**Regression status:** ${report.regressionStatus || 'unavailable'}`,
    '',
    `## ${report.incident?.title || 'Monitor execution error'}`,
    '',
  ]

  if (report.error) lines.push(`Monitor error: ${report.error}`, '')
  if (regressions.length) {
    lines.push('| Scope | Metric | Baseline | Current | Increase | Severity |', '| --- | --- | ---: | ---: | ---: | --- |')
    for (const item of regressions) {
      const increase = item.increasePercent == null ? 'new' : `${item.increasePercent}%`
      lines.push(`| ${item.scope} | ${item.metric} | ${item.baseline} | ${item.current} | ${increase} | ${item.severity} |`)
    }
    lines.push('')
  }
  for (const action of report.incident?.actions || []) lines.push(`- ${action}`)
  return `${lines.join('\n')}\n`
}
