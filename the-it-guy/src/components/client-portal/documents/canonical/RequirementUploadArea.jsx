import { Download } from 'lucide-react'
import ClientDocumentUploadButton from '../ClientDocumentUploadButton'

function RequirementUploadArea({
  requirement = {},
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
}) {
  const uploadKey = requirement.id || requirement.documentDefinitionKey || ''
  const linkedDocument = requirement.linkedDocument || null
  const openKey = String(linkedDocument?.file_path || linkedDocument?.storage_path || linkedDocument?.id || linkedDocument?.url || '').trim()
  const opening = Boolean(openKey && openingDocumentPath === openKey)
  const canOpen = Boolean(linkedDocument && requirement.canOpenDocument)
  const canUpload = Boolean(requirement.canUpload && typeof onUpload === 'function')
  const uploadLabel = requirement.status === 'rejected'
    ? 'Upload replacement'
    : requirement.hasLinkedDocument
      ? 'Replace file'
      : 'Upload'

  if (!canUpload && !canOpen) return null

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {canUpload ? (
        <ClientDocumentUploadButton
          uploadKey={uploadKey}
          label={uploadLabel}
          uploadingDocumentKey={uploadingDocumentKey}
          onUpload={onUpload}
          uploadSpec={requirement.uploadSpec}
        />
      ) : null}
      {canOpen ? (
        <button
          type="button"
          onClick={() => onOpenDocument?.(linkedDocument)}
          disabled={opening}
          className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
        >
          <Download size={14} />
          {opening ? 'Opening...' : requirement.generatedDocument ? 'View generated file' : 'View file'}
        </button>
      ) : null}
    </div>
  )
}

export default RequirementUploadArea
