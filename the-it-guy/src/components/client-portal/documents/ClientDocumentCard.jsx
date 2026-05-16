import { Download } from 'lucide-react'
import ClientDocumentStatusBadge from './ClientDocumentStatusBadge'
import ClientDocumentUploadButton from './ClientDocumentUploadButton'

function ClientDocumentCard({
  item = {},
  uploadingDocumentKey = '',
  openingDocumentPath = '',
  onUpload = null,
  onOpenDocument = null,
}) {
  const uploadKey = String(item?.uploadKey || item?.id || '').trim()
  const uploadLabel = item?.status === 'rejected' || item?.hasUploadedDocument ? 'Re-upload' : 'Upload'
  const canUpload = Boolean(uploadKey && item?.uploadSpec && typeof onUpload === 'function')
  const canOpen = Boolean(item?.linkedDocument)
  const openKey = String(item?.linkedDocument?.file_path || item?.linkedDocument?.id || '').trim()
  const opening = Boolean(openKey && openingDocumentPath === openKey)

  return (
    <article className="rounded-[18px] border border-[#e3ebf4] bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <strong className="block text-sm font-semibold text-[#142132]">{item?.title || 'Document'}</strong>
          <p className="mt-1 text-sm leading-6 text-[#6b7d93]">{item?.description || 'Supporting document required for your transaction.'}</p>
          {item?.education ? (
            <p className="mt-1 text-xs leading-5 text-[#5f738a]">Why this is needed: {item.education}</p>
          ) : null}
          {item?.metaLine ? <p className="mt-2 text-xs font-medium text-[#7b8ca2]">{item.metaLine}</p> : null}
          {item?.rejectionReason ? (
            <p className="mt-2 text-xs font-semibold text-[#b42318]">Reason: {item.rejectionReason}</p>
          ) : null}
        </div>
        <ClientDocumentStatusBadge status={item?.status || ''} />
      </div>
      {(canUpload || canOpen) ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {canUpload ? (
            <ClientDocumentUploadButton
              uploadKey={uploadKey}
              label={uploadLabel}
              uploadingDocumentKey={uploadingDocumentKey}
              onUpload={onUpload}
              uploadSpec={item.uploadSpec}
            />
          ) : null}
          {canOpen ? (
            <button
              type="button"
              onClick={() => onOpenDocument?.(item.linkedDocument)}
              disabled={opening}
              className="inline-flex items-center gap-2 rounded-full border border-[#dbe5ef] bg-white px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
            >
              <Download size={14} />
              {opening ? 'Opening...' : 'View file'}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export default ClientDocumentCard
