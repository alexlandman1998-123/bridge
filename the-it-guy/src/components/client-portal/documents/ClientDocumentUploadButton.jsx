import { FileSignature } from 'lucide-react'

function ClientDocumentUploadButton({
  uploadKey = '',
  label = 'Upload',
  disabled = false,
  uploadingDocumentKey = '',
  onUpload = null,
  uploadSpec = null,
}) {
  const busy = Boolean(uploadingDocumentKey) && String(uploadingDocumentKey) === String(uploadKey)

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white">
      <FileSignature size={14} />
      {busy ? 'Uploading...' : label}
      <input
        type="file"
        className="hidden"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file && typeof onUpload === 'function') {
            onUpload(uploadSpec, file)
          }
          event.target.value = ''
        }}
      />
    </label>
  )
}

export default ClientDocumentUploadButton

