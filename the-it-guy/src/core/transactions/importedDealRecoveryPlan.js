import { auditImportedDealBatch } from './dealSetupCompatibilityAudit.js'

const text = (value) => String(value ?? '').trim()
const filenameKey = (name) => text(name).toLowerCase()
// Download suffixes suggest a candidate only. They never prove deal identity.
const copyKey = (name) => filenameKey(name).replace(/\s*\(\d+\)(?=\.pdf$)/, '')

export function buildImportedDealRecoveryPlan({ snapshot, sourceFiles = [] } = {}) {
  const audit = auditImportedDealBatch(snapshot)
  const rows = audit.rows.map((row) => {
    const expected = row.importEvidence.sourcePdf || ''
    const exact = expected ? sourceFiles.filter((file) => filenameKey(file.name) === filenameKey(expected)) : []
    const candidates = exact.length ? exact : expected ? sourceFiles.filter((file) => copyKey(file.name) === copyKey(expected)) : []
    const shared = candidates.some((file) => audit.rows.some((other) => other.transactionId !== row.transactionId && other.importEvidence.sourcePdf && copyKey(other.importEvidence.sourcePdf) === copyKey(file.name)))
    const match = candidates.length > 1 || shared ? 'ambiguous' : candidates.length === 1 ? exact.length ? 'exact_filename_candidate' : 'download_copy_candidate' : 'not_found'
    const record = snapshot.records.find((item) => text(item.transaction.id) === row.transactionId)
    const available = (record.documents || []).filter((document) => row.sourceDocumentIds.includes(document.id) && document.available === true)
    return {
      ...row,
      scopeConfirmed: row.importEvidence.status === 'identified',
      sourceRecovery: {
        expectedFilename: expected || null,
        status: available.length ? 'linked_source_requires_review' : match,
        candidates: candidates.map(({ name, path, sha256, size }) => ({ name, path, sha256, size })),
        availableDocumentIds: available.map((document) => document.id),
        requiresContentVerification: true,
      },
      buyerRecovery: {
        status: row.issueCodes.some((code) => /buyer/.test(code)) ? 'requires_source_check_and_link_review' : 'links_present_identity_unverified',
        capturedBuyerId: row.capturedBuyerId,
        automaticMatchAllowed: false,
      },
      actions: [
        ...(row.importEvidence.status !== 'identified' ? ['Confirm this transaction belongs to the import batch before recovery.'] : []),
        ...(!available.length ? ['Recover and compare the source PDF before attaching it to this transaction.'] : []),
        'Check the buyer identity and primary assignment against the source; resolve any link issue through Manage buyer links.',
        ...(!row.saleDate ? ['Check the actual sale date against the source; do not infer it from the filename or workbook status.'] : []),
        'Review buyer, seller, property, attorney and funding details before confirming each section.',
      ],
    }
  })
  return {
    version: 'imported_deal_recovery_plan_v1', organisationId: audit.organisationId,
    readOnly: true, automaticWritesAllowed: false,
    counts: { ...audit.counts,
      missingAvailableSourceDocuments: rows.filter((row) => !row.sourceRecovery.availableDocumentIds.length).length,
      localSourceCandidates: rows.filter((row) => ['exact_filename_candidate', 'download_copy_candidate'].includes(row.sourceRecovery.status)).length,
      ambiguousSourceMatches: rows.filter((row) => row.sourceRecovery.status === 'ambiguous').length,
      sourcesNotFound: rows.filter((row) => row.sourceRecovery.status === 'not_found').length,
    },
    rows,
  }
}
