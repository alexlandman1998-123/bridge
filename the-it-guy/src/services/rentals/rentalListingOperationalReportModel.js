import {
  RENTAL_LISTING_DEFERRED_CAPABILITIES,
  RENTAL_LISTING_ROUTES,
} from './rentalListingArchitecture.js'
import {
  buildRentalListingReleaseGate,
} from './rentalListingReleaseGateModel.js'

export const RENTAL_LISTING_OPERATIONAL_REPORT_VERSION = 'arch9_rental_listing_operational_report_v1'

export const RENTAL_LISTING_OPERATIONAL_VERIFICATION_COMMANDS = Object.freeze([
  'npm run test:rental-listing-release-gate',
  'npm run test:rental-property24-publish-request',
  'npm run test:rental-property24-readiness',
  'npm run test:rental-listing-architecture',
  'npm run test:rental-listing-index-model',
  'npm run test:rental-listing-create-flow',
  'npm run test:rental-listing-detail-model',
  'npm run test:rental-listing-edit-model',
  'npm run test:rental-module-availability',
  'npm run test:rental-workspace-scope',
  'npm --prefix the-it-guy run build',
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function statusLabel(passed) {
  return passed ? 'passed' : 'blocked'
}

function decisionForGate(gate = {}) {
  if (!gate.passed) return 'blocked'
  return 'ready_for_controlled_staging_smoke'
}

function summarizeChecks(checks = []) {
  const passed = checks.filter((check) => check.passed)
  const failed = checks.filter((check) => !check.passed)
  return {
    total: checks.length,
    passed: passed.length,
    failed: failed.length,
    failedChecks: failed.map((check) => ({
      key: check.key,
      label: check.label,
      detail: check.detail,
    })),
  }
}

export function buildRentalListingOperationalReport(options = {}) {
  const gate = options.gate || buildRentalListingReleaseGate(options.gateOptions)
  const generatedAt = normalizeText(options.generatedAt) || new Date().toISOString()
  const commit = normalizeText(options.commit)
  return {
    version: RENTAL_LISTING_OPERATIONAL_REPORT_VERSION,
    generatedAt,
    environment: normalizeText(options.environment) || 'staging_candidate',
    commit,
    status: statusLabel(gate.passed),
    decision: decisionForGate(gate),
    scope: {
      module: 'rentals',
      surface: 'rental_listings',
      included: [
        'rental listing index',
        'rental listing create flow',
        'rental listing detail tabs',
        'Property24 rental readiness',
        'Property24 rental publish request handoff',
      ],
      excluded: RENTAL_LISTING_DEFERRED_CAPABILITIES,
    },
    gate: {
      version: gate.version,
      status: gate.status,
      checks: {
        ...summarizeChecks(gate.checks),
        all: gate.checks.map((check) => ({
          key: check.key,
          label: check.label,
          passed: check.passed,
          detail: check.detail,
        })),
      },
    },
    routes: {
      index: RENTAL_LISTING_ROUTES.index,
      create: RENTAL_LISTING_ROUTES.create,
      detail: RENTAL_LISTING_ROUTES.detail,
      syndication: RENTAL_LISTING_ROUTES.syndication,
      applications: RENTAL_LISTING_ROUTES.applications,
    },
    property24: {
      listingType: gate.readiness?.payloadPreview?.listingType || 'Rental',
      readinessPercent: gate.readiness?.readinessPercent ?? 0,
      readyToPublish: gate.readiness?.readyToPublish === true,
      liveWriteEnabled: gate.publishRequest?.liveWriteEnabled === true,
      requiresBackendPublisher: gate.publishRequest?.requiresBackendPublisher !== false,
      publishRequestStatus: gate.publishRequest?.status || 'unknown',
      featureFlagBoundary: 'property24RentalsEnabled',
    },
    verificationCommands: [...RENTAL_LISTING_OPERATIONAL_VERIFICATION_COMMANDS],
    nextActions: gate.passed
      ? [
          'Run controlled staging smoke with a Produktive rental listing fixture.',
          'Verify principal and dual-line agent access to Sales/Rentals workspace switching.',
          'Map live Property24 rental agency, agent, suburb, and property type ids before enabling backend publishing.',
        ]
      : gate.failedChecks.map((check) => `Resolve ${check.label}: ${check.detail}`),
  }
}

function markdownTable(rows = []) {
  return [
    '| Item | Value |',
    '| --- | --- |',
    ...rows.map(([item, value]) => `| ${item} | ${value} |`),
  ].join('\n')
}

function formatCheckRows(checks = []) {
  return checks.map((check) => `| ${check.passed ? 'Passed' : 'Blocked'} | \`${check.key}\` | ${check.label} | ${check.detail || ''} |`).join('\n')
}

export function formatRentalListingOperationalReportMarkdown(report = {}) {
  const failedChecks = report.gate?.checks?.failedChecks || []
  const checks = report.gate?.checks || {}
  return `# Rental Listing Operational Release Report

${markdownTable([
  ['Status', `\`${report.status || 'unknown'}\``],
  ['Decision', `\`${report.decision || 'unknown'}\``],
  ['Environment', report.environment || ''],
  ['Commit', report.commit ? `\`${report.commit}\`` : 'Not captured'],
  ['Generated at', report.generatedAt || ''],
])}

## Scope

Included:
${(report.scope?.included || []).map((item) => `- ${item}`).join('\n')}

Excluded:
${(report.scope?.excluded || []).map((item) => `- ${item}`).join('\n')}

## Gate Summary

${markdownTable([
  ['Gate version', `\`${report.gate?.version || ''}\``],
  ['Gate status', `\`${report.gate?.status || ''}\``],
  ['Checks passed', `${checks.passed || 0}/${checks.total || 0}`],
  ['Checks failed', String(checks.failed || 0)],
])}

| Status | Key | Check | Detail |
| --- | --- | --- | --- |
${formatCheckRows(report.gate?.checks?.all || []) || '| Passed | `release_report` | Report generated | See JSON report for full gate checks |'}

## Property24 Rental Boundary

${markdownTable([
  ['Listing type', report.property24?.listingType || 'Rental'],
  ['Readiness', `${report.property24?.readinessPercent ?? 0}%`],
  ['Ready to publish', report.property24?.readyToPublish ? 'Yes' : 'No'],
  ['Live write enabled', report.property24?.liveWriteEnabled ? 'Yes' : 'No'],
  ['Backend publisher required', report.property24?.requiresBackendPublisher ? 'Yes' : 'No'],
  ['Publish request status', `\`${report.property24?.publishRequestStatus || 'unknown'}\``],
  ['Feature flag boundary', `\`${report.property24?.featureFlagBoundary || ''}\``],
])}

## Routes

${Object.entries(report.routes || {}).map(([key, route]) => `- ${key}: \`${route}\``).join('\n')}

## Verification Commands

${(report.verificationCommands || []).map((command) => `- \`${command}\``).join('\n')}

## Next Actions

${(report.nextActions || []).map((action) => `- ${action}`).join('\n')}

${failedChecks.length ? `\n## Blockers\n\n${failedChecks.map((check) => `- \`${check.key}\`: ${check.label} - ${check.detail}`).join('\n')}\n` : ''}
`
}
