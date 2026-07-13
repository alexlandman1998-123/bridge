import {
  buildSellerDocumentRequirementReconciliationGate,
} from '../src/services/sellerDocumentRequirementsService.js'
import {
  runNodeSellerDocumentRequirementReconciliation,
} from './seller-document-reconciliation-node.mjs'

function parseCsv(value = '') {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseArgs(argv = []) {
  const options = {
    organisationId: '',
    listingIds: [],
    limit: 100,
    dryRun: true,
    markdown: false,
    gate: false,
    failOnSyncNeeded: true,
    failOnManualReview: true,
    failOnLoadFailed: true,
  }

  for (const arg of argv) {
    if (arg === '--apply') options.dryRun = false
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--markdown') options.markdown = true
    else if (arg === '--gate') options.gate = true
    else if (arg === '--fail-on-sync-needed') {
      options.gate = true
      options.failOnSyncNeeded = true
    } else if (arg === '--warn-on-sync-needed') {
      options.gate = true
      options.failOnSyncNeeded = false
    } else if (arg === '--warn-on-manual-review') {
      options.gate = true
      options.failOnManualReview = false
    } else if (arg === '--warn-on-load-failed') {
      options.gate = true
      options.failOnLoadFailed = false
    }
    else if (arg.startsWith('--organisation-id=')) options.organisationId = arg.slice('--organisation-id='.length).trim()
    else if (arg.startsWith('--org-id=')) options.organisationId = arg.slice('--org-id='.length).trim()
    else if (arg.startsWith('--listing-id=')) options.listingIds.push(...parseCsv(arg.slice('--listing-id='.length)))
    else if (arg.startsWith('--listing-ids=')) options.listingIds.push(...parseCsv(arg.slice('--listing-ids='.length)))
    else if (arg.startsWith('--limit=')) options.limit = Number(arg.slice('--limit='.length)) || options.limit
  }

  return options
}

function renderMarkdown(report = {}) {
  const summary = report.summary || {}
  const lines = [
    '# Seller Document Requirement Reconciliation',
    '',
    `Generated: ${report.generatedAt || '-'}`,
    `Mode: ${report.mode || (report.dryRun === false ? 'apply' : 'dry-run')}`,
    '',
    '## Summary',
    '',
    `- Listings checked: ${summary.total || 0}`,
    `- Ready: ${summary.ready || 0}`,
    `- Need sync: ${summary.needsSync || 0}`,
    `- Syncable: ${summary.syncable || 0}`,
    `- Missing requirement rows: ${summary.missingRequirementRows || 0}`,
    `- Stale active requirement rows: ${summary.staleRequirementRows || 0}`,
    '',
  ]

  if (report.gate) {
    lines.push(
      '## Gate',
      '',
      `- Status: ${report.gate.status}`,
      `- Exit code: ${report.gate.exitCode}`,
      `- Release ready: ${report.gate.releaseReady ? 'yes' : 'no'}`,
      `- Reason: ${report.gate.reason || '-'}`,
      '',
    )
    const blockers = Array.isArray(report.gate.blockers) ? report.gate.blockers : []
    const warnings = Array.isArray(report.gate.warnings) ? report.gate.warnings : []
    if (blockers.length) {
      lines.push('### Blockers', '')
      for (const blocker of blockers) lines.push(`- ${blocker}`)
      lines.push('')
    }
    if (warnings.length) {
      lines.push('### Warnings', '')
      for (const warning of warnings) lines.push(`- ${warning}`)
      lines.push('')
    }
  }

  lines.push('## Syncable', '')

  const syncable = report.actionQueues?.syncable || []
  if (!syncable.length) {
    lines.push('No syncable rows.', '')
  } else {
    lines.push('| Listing | Status | Missing | Stale |')
    lines.push('| --- | --- | --- | --- |')
    for (const row of syncable.slice(0, 25)) {
      lines.push(`| ${row.title || row.listingId} | ${row.listingStatus || '-'} | ${(row.missingRequirementKeys || []).join(', ') || '-'} | ${(row.staleRequirementKeys || []).join(', ') || '-'} |`)
    }
    lines.push('')
  }

  if (Array.isArray(report.applied)) {
    lines.push('## Applied')
    lines.push('')
    lines.push(`- Attempted: ${report.applySummary?.attempted || 0}`)
    lines.push(`- Synced: ${report.applySummary?.synced || 0}`)
    lines.push(`- Failed: ${report.applySummary?.failed || 0}`)
    lines.push('')
  }

  return lines.join('\n')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (!options.organisationId && !options.listingIds.length) {
    throw new Error('Usage: npm run reconcile:seller-documents -- --organisation-id=<uuid> [--limit=100] [--apply] [--gate] [--markdown]')
  }
  if (options.gate && options.dryRun === false) {
    throw new Error('Seller document reconciliation gate is dry-run only. Remove --apply before using --gate.')
  }

  const baseReport = options.dryRun === false
    ? await import('../src/services/privateListingService.js')
      .then(({ runSellerDocumentRequirementReconciliation }) => runSellerDocumentRequirementReconciliation(options))
    : await runNodeSellerDocumentRequirementReconciliation(options)
  const report = options.gate
    ? {
        ...baseReport,
        gate: buildSellerDocumentRequirementReconciliationGate(baseReport, {
          failOnSyncNeeded: options.failOnSyncNeeded,
          failOnManualReview: options.failOnManualReview,
          failOnLoadFailed: options.failOnLoadFailed,
        }),
      }
    : baseReport
  process.stdout.write(options.markdown ? `${renderMarkdown(report)}\n` : `${JSON.stringify(report, null, 2)}\n`)
  if (options.gate && report.gate?.exitCode) {
    process.exitCode = report.gate.exitCode
  }
}

main().catch((error) => {
  console.error('Seller document reconciliation failed:', error?.message || error)
  process.exitCode = 1
})
