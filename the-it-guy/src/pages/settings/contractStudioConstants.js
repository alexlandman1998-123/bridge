import { FileSignature, FileText, Layers3 } from 'lucide-react'

function normalizeStudioText(value = '') {
  return String(value ?? '').trim()
}

export const SIMPLE_DOCUMENT_BUILDER_FEATURE_FLAG = 'VITE_ENABLE_SIMPLE_DOCUMENT_BUILDER'

export function isSimpleDocumentBuilderEnabled(env = import.meta.env || {}) {
  return String(env?.[SIMPLE_DOCUMENT_BUILDER_FEATURE_FLAG] || '').toLowerCase() === 'true'
}

export const studioPrimaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#128642] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_16px_28px_rgba(18,134,66,0.22)] transition hover:bg-[#0f7438] disabled:cursor-not-allowed disabled:opacity-60'
export const studioSecondaryButtonClass = 'inline-flex items-center justify-center gap-2 rounded-[16px] border border-[#dbe7f3] bg-white px-4 py-2.5 text-sm font-semibold text-[#102033] shadow-[0_12px_24px_rgba(15,23,42,0.04)] transition hover:border-[#bfd5f5] hover:bg-[#f8fbff] disabled:cursor-not-allowed disabled:opacity-60'
export const studioQuietButtonClass = 'inline-flex items-center justify-center gap-2 rounded-[16px] border border-transparent bg-[#f5f8fc] px-4 py-2.5 text-sm font-semibold text-[#51657c] transition hover:border-[#dbe7f3] hover:bg-white disabled:cursor-not-allowed disabled:opacity-60'
export const studioDangerButtonClass = 'inline-flex items-center justify-center gap-2 rounded-[16px] border border-[#f3d5d7] bg-white px-4 py-2.5 text-sm font-semibold text-[#b4383e] transition hover:bg-[#fff6f6] disabled:cursor-not-allowed disabled:opacity-60'

export const DOCUMENT_RUN_SOURCE_OPTIONS = [
  { key: 'transaction', label: 'Transaction', description: 'Best for offers, accepted deals, and transfer-ready packs.' },
  { key: 'lead', label: 'Lead', description: 'Best for buyer/seller lead documents and pre-transaction mandates.' },
  { key: 'manual', label: 'Manual details', description: 'Use typed details only, without linking a CRM record yet.' },
]

export const DOCUMENT_CREATION_KIND_OPTIONS = [
  { key: 'standard', label: 'Standard document', description: 'Use the selected template as the main contract pack.' },
  { key: 'addendum', label: 'Addendum', description: 'Create an additional document linked to an existing deal or mandate.' },
  { key: 'amendment', label: 'Amendment', description: 'Record agreed changes to a previously generated document.' },
  { key: 'annexure', label: 'Annexure / disclosure', description: 'Attach supporting terms, disclosures, or schedules.' },
  { key: 'custom', label: 'Custom document', description: 'Start a one-off document from the selected template.' },
]

export const CONTRACT_STUDIO_AREAS = [
  {
    key: 'templates',
    label: 'Templates',
    description: 'Build reusable document templates and make them live.',
    icon: FileText,
  },
  {
    key: 'clauseLibrary',
    label: 'Clause Library',
    description: 'Approved clauses, signature blocks, and reusable wording.',
    icon: Layers3,
  },
  {
    key: 'documents',
    label: 'Documents',
    description: 'Drafts, previews, signed documents, and exports.',
    icon: FileSignature,
  },
]

export const CONTRACT_STUDIO_TABS = [
  { key: 'template', label: 'Build' },
  { key: 'variables', label: 'Fields' },
  { key: 'preview', label: 'Preview' },
  { key: 'activity', label: 'History' },
]

export function getDocumentKindOption(key = 'standard') {
  const normalized = normalizeStudioText(key).toLowerCase() || 'standard'
  return DOCUMENT_CREATION_KIND_OPTIONS.find((option) => option.key === normalized) || DOCUMENT_CREATION_KIND_OPTIONS[0]
}

export function getDocumentRunReadiness({
  documentRunForm = {},
  addendumDetailFields = [],
} = {}) {
  const documentKind = getDocumentKindOption(documentRunForm.documentKind).key
  const isRelatedDocumentKind = !['standard', 'custom'].includes(documentKind)
  if (!isRelatedDocumentKind) {
    return {
      ready: true,
      items: [],
      capturedDetailCount: 0,
    }
  }

  const details = documentRunForm.addendumDetails && typeof documentRunForm.addendumDetails === 'object'
    ? documentRunForm.addendumDetails
    : {}
  const fields = Array.isArray(addendumDetailFields) ? addendumDetailFields : []
  const capturedDetailCount = fields.filter((field) => normalizeStudioText(details[field.key])).length
  const items = [
    {
      key: 'original_document',
      label: 'Original document linked',
      detail: 'Add the original packet ID or a clear original document reference.',
      passed: Boolean(normalizeStudioText(documentRunForm.parentDocumentId || documentRunForm.parentDocumentReference)),
    },
    {
      key: 'change_summary',
      label: 'Change summary captured',
      detail: 'Summarise what this addendum changes before generation.',
      passed: Boolean(normalizeStudioText(documentRunForm.documentChangeSummary)),
    },
  ]

  if (fields.length) {
    items.push({
      key: 'guided_details',
      label: 'Addendum details captured',
      detail: 'Fill at least one guided addendum field so the generated document has usable wording.',
      passed: capturedDetailCount > 0,
    })
  }

  return {
    ready: items.every((item) => item.passed),
    items,
    capturedDetailCount,
  }
}
