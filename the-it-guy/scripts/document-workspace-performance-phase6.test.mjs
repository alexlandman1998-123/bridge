import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const performancePath = path.join(root, 'src', 'services', 'observability', 'performanceMetrics.js')
const packagePath = path.join(root, 'package.json')

const source = fs.readFileSync(performancePath, 'utf8')
const pkg = fs.readFileSync(packagePath, 'utf8')

function assertIncludes(needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`${label} is missing: ${needle}`)
  }
}

function assertMatches(pattern, label) {
  if (!pattern.test(source)) {
    throw new Error(`${label} did not match ${pattern}`)
  }
}

assertIncludes('export const PERFORMANCE_BUDGETS_MS = Object.freeze({', 'Phase 6 budget table')
assertIncludes("'legal_document.generation.status_lookup': 2500", 'Phase 6 status lookup budget')
assertIncludes("'legal_document.generation.seller_onboarding': 3000", 'Phase 6 seller onboarding budget')
assertIncludes("'legal_document.generation.template_lookup': 3000", 'Phase 6 template lookup budget')
assertIncludes("'legal_document.generation.packet_prepare': 5000", 'Phase 6 packet preparation budget')
assertIncludes("'legal_document.generation.render_save': 45000", 'Phase 6 render/save budget')
assertIncludes("'legal_document.generation.total': 65000", 'Phase 6 total generation budget')
assertIncludes("'legal_document.signing.signer_readiness': 8000", 'Phase 6 signer readiness budget')
assertIncludes("'legal_document.signing.email_delivery': 10000", 'Phase 6 email delivery budget')
assertIncludes("'legal_document.signing.total': 15000", 'Phase 6 total signing budget')
assertIncludes('export function getPerformanceBudgetMs', 'Phase 6 budget resolver')
assertIncludes('export function isPerformanceBudgetBreached', 'Phase 6 budget breach helper')
assertIncludes('performanceBudgetMs = null', 'Phase 6 explicit budget override')
assertIncludes('performanceBudgetMs: budgetMs', 'Phase 6 metric metadata budget')
assertIncludes("eventName: 'performance_budget_breached'", 'Phase 6 budget warning telemetry')
assertIncludes("severity: 'warning'", 'Phase 6 warning severity')
assertIncludes('overBudgetMs: Math.round(numericDurationMs - budgetMs)', 'Phase 6 over-budget delta')
assertMatches(
  /if \(isPerformanceBudgetBreached\(\{ metricName: name, durationMs: numericDurationMs, budgetMs \}\)\) \{[\s\S]*void trackTelemetryEvent\(/,
  'Phase 6 non-blocking budget telemetry',
)

if (!pkg.includes('"test:document-workspace-performance-phase6": "node scripts/document-workspace-performance-phase6.test.mjs"')) {
  throw new Error('Phase 6 package script is missing.')
}

console.log('document workspace performance phase 6 checks passed')
