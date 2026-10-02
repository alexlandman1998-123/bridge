import { buildDealSetup, getActiveDealSetupBuyers, validateDealSetup } from './dealSetupContract.js'

export const DEAL_SETUP_COMPATIBILITY_AUDIT_VERSION = 'deal_setup_phase8_compatibility_v1'
export const IMPORTED_DEAL_AUDIT_VERSION = 'imported_deal_audit_v1'

const text = (value) => String(value ?? '').trim()
const IMPORT_SOURCES = new Set(['import', 'bulk_import', 'bulk_upload', 'spreadsheet_import', 'otp_import'])

// Legacy OTP imports retained workbook provenance in the comment rather than
// setting transaction_origin_source. A reference alone is only a candidate.
export function identifyDealImport(transaction = {}) {
  const source = text(transaction.transaction_origin_source).toLowerCase()
  const provenance = text(transaction.comment).match(/^Internal import draft from (.+\.xlsx) row (\d+)\. Source PDF: (.+?\.pdf)\. Workbook status:/i)
  const referenceRow = text(transaction.transaction_reference).match(/^PR-OTP-IMP-R(\d+)$/i)
  if (IMPORT_SOURCES.has(source)) return { status: 'identified', evidence: 'origin_source', source }
  if (provenance && referenceRow && Number(provenance[2]) === Number(referenceRow[1])) {
    return { status: 'identified', evidence: 'workbook_provenance', workbook: provenance[1], row: Number(provenance[2]), sourcePdf: provenance[3] }
  }
  return { status: referenceRow || provenance ? 'candidate' : 'not_identified', evidence: referenceRow ? 'reference_only' : provenance ? 'uncorroborated_provenance' : null }
}

export function auditDealSetupCompatibility({ transaction = {}, buyerParties = [] } = {}) {
  const setup = buildDealSetup({ transaction, buyerParties })
  const validation = validateDealSetup(setup)
  const issues = [...validation.issues]
  if (!transaction.buyer_parties_model_version) issues.push('Legacy buyer-party model version is not recorded.')
  if (setup.buyers.length && !setup.primaryBuyerId) issues.push('Legacy transaction has buyer parties but no primary buyer compatibility link.')
  return Object.freeze({ transactionId: setup.transactionId, readyForBackfill: issues.length === 0, issues: Object.freeze(issues), setup })
}

export function auditImportedDeal({ transaction = {}, buyerParties = [], documents = [], buyerProfile = null } = {}) {
  const compatibility = auditDealSetupCompatibility({ transaction, buyerParties })
  const importEvidence = identifyDealImport(transaction)
  const issueCodes = compatibility.setup.buyerLinkIssues.map((issue) => issue.code)
  const parties = getActiveDealSetupBuyers(buyerParties)
  if (!parties.length) issueCodes.push('buyer_participants_missing')
  else if (!compatibility.setup.primaryBuyerId) issueCodes.push('primary_buyer_missing')
  if (text(transaction.buyer_id) && !buyerProfile) issueCodes.push('captured_buyer_profile_unavailable')
  const normalizedName = (value) => text(value).toLowerCase().replace(/\s+/g, ' ')
  if (text(transaction.buyer_name) && text(buyerProfile?.name) && normalizedName(transaction.buyer_name) !== normalizedName(buyerProfile.name)) {
    issueCodes.push('captured_buyer_name_mismatch')
  }
  const sourceDocuments = documents.filter((document) => {
    const filename = text(document.file_name || document.document_name || document.name).toLowerCase()
    return importEvidence.sourcePdf
      ? filename === importEvidence.sourcePdf.toLowerCase()
      : ['otp', 'signed_otp', 'offer_to_purchase'].includes(text(document.document_type).toLowerCase())
  })
  if (!sourceDocuments.length) issueCodes.push('source_document_not_linked')
  if (!text(transaction.sale_date)) issueCodes.push('historical_sale_date_missing')
  return {
    transactionId: text(transaction.id), organisationId: text(transaction.organisation_id),
    reference: text(transaction.transaction_reference), importEvidence,
    buyerCount: parties.length, primaryBuyerCount: parties.filter((party) => party.is_primary_buyer === true).length,
    capturedBuyerId: text(transaction.buyer_id) || null,
    sourceDocumentIds: sourceDocuments.map((document) => document.id),
    saleDate: transaction.sale_date || null, stageDate: transaction.stage_date || null,
    stage: transaction.stage || null, currentMainStage: transaction.current_main_stage || null,
    issueCodes: [...new Set(issueCodes)], compatibilityIssues: compatibility.issues,
    // Identity confirmation is a human review, even when the links agree.
    requiresDetailsReview: importEvidence.status !== 'not_identified',
  }
}

export function auditImportedDealBatch({ organisationId, records = [] } = {}) {
  if (!text(organisationId)) throw new Error('Choose an organisation before auditing imported transactions.')
  if (records.some((record) => text(record.transaction?.organisation_id) !== text(organisationId))) {
    throw new Error('Every audited transaction must belong to the selected organisation.')
  }
  const audited = records.map(auditImportedDeal)
  const rows = audited.filter((row) => row.importEvidence.status !== 'not_identified')
  const identified = rows.filter((row) => row.importEvidence.status === 'identified')
  return {
    version: IMPORTED_DEAL_AUDIT_VERSION, organisationId: text(organisationId), readOnly: true,
    counts: {
      scanned: records.length, identifiedImports: identified.length,
      candidatesRequiringScopeConfirmation: rows.length - identified.length,
      missingBuyerParties: identified.filter((row) => !row.buyerCount).length,
      buyerLinkConflicts: identified.filter((row) => row.issueCodes.some((code) => ['multiple_primary_buyers', 'invalid_primary_participant_link', 'primary_profile_mismatch', 'primary_participant_mismatch'].includes(code))).length,
      missingSourceDocuments: identified.filter((row) => !row.sourceDocumentIds.length).length,
      missingHistoricalSaleDates: identified.filter((row) => !row.saleDate).length,
    },
    rows,
  }
}
