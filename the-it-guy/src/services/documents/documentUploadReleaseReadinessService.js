import { DOCUMENT_UPLOAD_MALWARE_SCAN_DECISION } from '../../lib/documentUploadPolicy.js'

export const DOCUMENT_UPLOAD_RELEASE_SCENARIOS = Object.freeze([
  'upload',
  'persistence',
  'visibility',
  'download',
  'retry',
  'failedNetwork',
])

// A release gate, not a claim that browser tests have run against production.
// Callers must supply evidence for every documented upload flow.
export const DOCUMENT_UPLOAD_RELEASE_MATRIX = Object.freeze([
  { id: 'buyer', label: 'Buyer portal', owner: 'client portal' },
  { id: 'seller', label: 'Seller portal', owner: 'client portal' },
  { id: 'lead', label: 'Lead documents', owner: 'workspace' },
  { id: 'listing', label: 'Private listing documents', owner: 'listings' },
  { id: 'transaction', label: 'Transaction shared documents', owner: 'workspace' },
  { id: 'attorney', label: 'Attorney closeout documents', owner: 'transactions' },
  { id: 'bond', label: 'Bond closeout documents', owner: 'transactions' },
  { id: 'rental', label: 'Rental application documents', owner: 'rentals' },
  { id: 'commercial', label: 'Commercial portal documents', owner: 'commercial' },
  { id: 'developer', label: 'Developer portal documents', owner: 'developer' },
  { id: 'external', label: 'External transaction portal documents', owner: 'external portal' },
])

export const DOCUMENT_UPLOAD_REQUIRED_MIGRATIONS = Object.freeze([
  '20260918195906_transaction_document_recovery_review_queue',
  '20260918200208_document_upload_policy_storage_enforcement',
])

function missingScenarios(evidence = {}) {
  return DOCUMENT_UPLOAD_RELEASE_SCENARIOS.filter((scenario) => evidence[scenario] !== true)
}

export function buildDocumentUploadReleaseReadiness({
  evidenceBySurface = {},
  appliedMigrationVersions = [],
  malwareScan = DOCUMENT_UPLOAD_MALWARE_SCAN_DECISION,
} = {}) {
  const applied = new Set(appliedMigrationVersions)
  const missingMigrations = DOCUMENT_UPLOAD_REQUIRED_MIGRATIONS.filter((version) => !applied.has(version))
  const matrix = DOCUMENT_UPLOAD_RELEASE_MATRIX.map((surface) => {
    const missing = missingScenarios(evidenceBySurface[surface.id])
    return { ...surface, missingScenarios: missing, ready: missing.length === 0 }
  })
  const blockers = [
    ...matrix.filter((surface) => !surface.ready).map((surface) => `${surface.label}: ${surface.missingScenarios.join(', ')}`),
    ...missingMigrations.map((version) => `Migration not applied: ${version}`),
  ]

  if (malwareScan?.scanned !== true) {
    blockers.push(malwareScan?.releaseBlocker || 'A server-side malware scanner must be configured before release.')
  }

  return {
    ready: blockers.length === 0,
    matrix,
    blockers,
    missingMigrations,
    scannerConfigured: malwareScan?.scanned === true,
    summary: {
      surfaces: matrix.length,
      readySurfaces: matrix.filter((surface) => surface.ready).length,
      requiredScenarios: DOCUMENT_UPLOAD_RELEASE_SCENARIOS.length,
    },
  }
}
