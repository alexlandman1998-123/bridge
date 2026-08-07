const SELLER_MANDATE_DOCUMENT_TYPE = 'mandate'
const SELLER_MANDATE_DOCUMENT_FAMILY = 'seller_mandate'
const SELLER_MANDATE_SOURCE_SURFACE = 'seller_profile'
const SELLER_MANDATE_STORAGE_SURFACE = 'documents'
const SELLER_MANDATE_VERSIONING_POLICY = 'latest_with_history'
const SELLER_MANDATE_LINKED_ENTITY_TYPE = 'seller_lead'
const SELLER_MANDATE_INFORMATION_MODEL_VERSION = 'seller_mandate_information_model_v1'

const SELLER_MANDATE_DOCUMENT_VARIANT_ALIASES = Object.freeze({
  mandate: 'mandate',
  seller_mandate: 'mandate',
  seller_mandate_document: 'mandate',
  mandate_document: 'mandate',
  generated_mandate: 'generated_mandate',
  mandate_generated: 'generated_mandate',
  seller_mandate_generated: 'generated_mandate',
  draft_mandate: 'draft_mandate',
  mandate_draft: 'draft_mandate',
  seller_mandate_draft: 'draft_mandate',
  signed_mandate: 'signed_mandate',
  mandate_signed: 'signed_mandate',
  mandate_signature: 'signed_mandate',
  final_mandate: 'signed_mandate',
  mandate_final: 'signed_mandate',
  seller_mandate_signed: 'signed_mandate',
})

export const SELLER_MANDATE_SOURCE_OF_TRUTH = Object.freeze({
  authoringSurface: SELLER_MANDATE_SOURCE_SURFACE,
  storageSurface: SELLER_MANDATE_STORAGE_SURFACE,
  versioningPolicy: SELLER_MANDATE_VERSIONING_POLICY,
})

export const SELLER_MANDATE_MINIMUM_METADATA_FIELDS = Object.freeze([
  'sellerLeadId',
  'sellerProfileId',
  'documentType',
  'documentVariant',
  'documentFamily',
  'linkedEntityType',
  'linkedEntityId',
  'sourceSurface',
  'storageSurface',
  'versionNumber',
  'latestDocumentId',
  'previousDocumentId',
  'status',
  'createdAt',
  'updatedAt',
])

function text(value = '') {
  return String(value || '').trim()
}

function number(value, fallback = 1) {
  const parsed = Number.parseInt(text(value), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function normalizeSellerMandateDocumentVariant(value = '') {
  const normalized = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return SELLER_MANDATE_DOCUMENT_VARIANT_ALIASES[normalized] || ''
}

export function normalizeSellerMandateDocumentType(value = '') {
  return normalizeSellerMandateDocumentVariant(value) ? SELLER_MANDATE_DOCUMENT_TYPE : ''
}

export function isSellerMandateDocument(value = '') {
  return Boolean(normalizeSellerMandateDocumentType(value))
}

export function buildSellerMandateDocumentModel(document = {}) {
  const documentVariant = normalizeSellerMandateDocumentVariant(
    document.sellerMandateDocumentVariant ||
      document.seller_mandate_document_variant ||
      document.documentVariant ||
      document.document_variant ||
      document.documentType ||
      document.document_type ||
      document.canonicalDocumentKey ||
      document.canonical_document_key ||
      document.documentKey ||
      document.document_key ||
      document.key ||
      document.label ||
      document.name,
  )
  const documentType = documentVariant ? SELLER_MANDATE_DOCUMENT_TYPE : ''
  const sellerLeadId = text(
    document.sellerLeadId ||
      document.seller_lead_id ||
      document.relatedEntityId ||
      document.related_entity_id ||
      document.linkedEntityId ||
      document.linked_entity_id,
  )
  const sellerProfileId = text(document.sellerProfileId || document.seller_profile_id)
  const linkedEntityId = text(document.linkedEntityId || document.linked_entity_id || sellerLeadId || sellerProfileId)
  const versionNumber = number(
    document.versionNumber ||
      document.version_number ||
      document.currentVersionNumber ||
      document.current_version_number ||
      document.revisionNumber ||
      document.revision_number,
  )
  const sourceSurface = text(document.sourceSurface || document.source_surface || SELLER_MANDATE_SOURCE_SURFACE) || SELLER_MANDATE_SOURCE_SURFACE
  const storageSurface = text(document.storageSurface || document.storage_surface || SELLER_MANDATE_STORAGE_SURFACE) || SELLER_MANDATE_STORAGE_SURFACE
  const linkedEntityType = text(document.linkedEntityType || document.linked_entity_type || SELLER_MANDATE_LINKED_ENTITY_TYPE) || SELLER_MANDATE_LINKED_ENTITY_TYPE

  return {
    version: SELLER_MANDATE_INFORMATION_MODEL_VERSION,
    isSellerMandate: Boolean(documentType),
    sellerMandateDocumentType: documentType,
    sellerMandateDocumentVariant: documentVariant,
    sellerMandateDocumentFamily: documentType ? SELLER_MANDATE_DOCUMENT_FAMILY : '',
    sellerMandateLifecycleState: documentVariant === 'draft_mandate'
      ? 'draft'
      : documentVariant === 'generated_mandate'
        ? 'generated'
        : documentVariant === 'signed_mandate'
          ? 'signed'
          : '',
    sellerMandateSourceSurface: documentType ? sourceSurface : '',
    sellerMandateStorageSurface: documentType ? storageSurface : '',
    sellerMandateVersioningPolicy: documentType ? SELLER_MANDATE_VERSIONING_POLICY : '',
    sellerMandateLinkedEntityType: documentType ? linkedEntityType : '',
    sellerMandateLinkedEntityId: documentType ? linkedEntityId : '',
    sellerMandateSellerLeadId: documentType ? sellerLeadId : '',
    sellerMandateSellerProfileId: documentType ? sellerProfileId : '',
    sellerMandateDocumentId: text(document.id || document.documentId || document.document_id),
    sellerMandateLatestDocumentId: text(document.latestDocumentId || document.latest_document_id),
    sellerMandatePreviousDocumentId: text(document.previousDocumentId || document.previous_document_id),
    sellerMandateVersionNumber: documentType ? versionNumber : 0,
    sellerMandateTitle: documentType ? text(document.title || document.name || document.label) || 'Mandate' : '',
    sellerMandateStatus: documentType ? text(document.status || document.document_status || '').toLowerCase() : '',
    sellerMandateMetadata: documentType
      ? {
          documentType,
          documentVariant,
          documentFamily: SELLER_MANDATE_DOCUMENT_FAMILY,
          sellerLeadId,
          sellerProfileId,
          linkedEntityType,
          linkedEntityId,
          sourceSurface,
          storageSurface,
          versioningPolicy: SELLER_MANDATE_VERSIONING_POLICY,
          versionNumber,
        }
      : null,
  }
}
