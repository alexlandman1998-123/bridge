import { getCrossModuleDocumentDefinition, resolveCrossModuleDocumentKey } from './crossModuleDocumentKeyMapService.js'
import { getSellerStructuredFactCaptureSurface } from './sellerStructuredFactRequirementService.js'

function documentKey(row = {}) {
  return String(row.requirementKey || row.requirement_key || row.key || row.documentType || row.document_type || '').trim()
}

export function resolveCanonicalDocumentRequestPresentation(row = {}) {
  const suppliedKey = documentKey(row)
  const canonicalKey = resolveCrossModuleDocumentKey(suppliedKey) || suppliedKey
  const definition = getCrossModuleDocumentDefinition(canonicalKey)
  const kind = definition?.kind || row.requirementKind || row.requirement_kind || 'upload_document'

  if (kind === 'structured_fact') {
    const captureSurface = getSellerStructuredFactCaptureSurface({ key: canonicalKey })
    return {
      canonicalKey,
      kind,
      action: 'capture_details',
      actionLabel: 'Capture details',
      captureSurface: captureSurface?.key || 'seller_details',
      captureSurfaceLabel: captureSurface?.label || 'Seller details',
      helpText: `Capture this information in ${captureSurface?.label || 'Seller details'}; it is not a document upload.`,
    }
  }

  if (kind === 'generated_document') {
    return {
      canonicalKey,
      kind,
      action: 'generate_document',
      actionLabel: 'Prepare document',
      helpText: 'This document is prepared by the platform and should not be uploaded as a substitute.',
    }
  }

  if (kind === 'internal_task') {
    return {
      canonicalKey,
      kind,
      action: 'internal_task',
      actionLabel: 'Complete task',
      helpText: 'This requirement is an internal task, not a document upload.',
    }
  }

  return {
    canonicalKey,
    kind: 'upload_document',
    action: 'upload_document',
    actionLabel: 'Upload',
    helpText: 'Upload the requested supporting document.',
  }
}
