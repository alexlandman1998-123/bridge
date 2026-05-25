import { Download, FileSignature, RefreshCcw } from 'lucide-react'

function RequirementUploadArea({
  requirement = {},
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
}) {
  const uploadKey = requirement.id || requirement.documentDefinitionKey || ''
  const busy = Boolean(uploadingDocumentKey) && String(uploadingDocumentKey) === String(uploadKey)
  const linkedDocument = requirement.linkedDocument || null
  const openKey = String(linkedDocument?.file_path || linkedDocument?.storage_path || linkedDocument?.id || linkedDocument?.url || '').trim()
  const opening = Boolean(openKey && openingDocumentPath === openKey)
  const canOpen = Boolean(linkedDocument)
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
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
          {requirement.hasLinkedDocument || requirement.status === 'rejected' ? <RefreshCcw size={14} /> : <FileSignature size={14} />}
          {busy ? 'Uploading...' : uploadLabel}
          <input
            type="file"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onUpload(requirement.uploadSpec, file)
              event.target.value = ''
            }}
          />
        </label>
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
