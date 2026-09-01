import { CheckCircle2, FileSignature, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState } from 'react'

function formatFileSize(bytes = 0) {
  const size = Number(bytes) || 0
  if (!size) return ''
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function ClientDocumentUploadButton({
  uploadKey = '',
  label = 'Upload',
  disabled = false,
  uploadingDocumentKey = '',
  onUpload = null,
  uploadSpec = null,
  className = '',
}) {
  const busy = Boolean(uploadingDocumentKey) && String(uploadingDocumentKey) === String(uploadKey)
  const [selectedFile, setSelectedFile] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const unavailable = disabled || busy || submitting

  const handleChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || unavailable || typeof onUpload !== 'function') return

    setSelectedFile({ name: file.name, size: file.size })
    setFeedback({ tone: 'loading', message: 'Uploading securely — please keep this page open.' })
    setSubmitting(true)

    try {
      const result = await onUpload(uploadSpec, file)
      if (result?.ok === false) {
        setFeedback({ tone: 'error', message: result.error || 'Upload could not be completed. Please choose the file again and retry.' })
        return
      }
      if (result?.ok === true) {
        setFeedback({ tone: 'success', message: 'Received and awaiting review by your transaction team.' })
        return
      }
      setFeedback({ tone: 'loading', message: 'Upload submitted. Waiting for confirmation from your secure document record.' })
    } catch (error) {
      setFeedback({ tone: 'error', message: error?.message || 'Upload could not be completed. Please choose the file again and retry.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-w-0">
      <label
        className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-4 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-white focus-within:ring-2 focus-within:ring-[#4f8dc0] focus-within:ring-offset-2 ${unavailable ? 'cursor-not-allowed opacity-70' : ''} ${className}`.trim()}
        aria-disabled={unavailable}
      >
        {busy || submitting ? <LoaderCircle className="animate-spin" size={14} aria-hidden="true" /> : <FileSignature size={14} aria-hidden="true" />}
        {busy || submitting ? 'Uploading...' : feedback?.tone === 'error' ? 'Try again' : label}
        <input
          type="file"
          className="hidden"
          disabled={unavailable}
          onChange={handleChange}
        />
      </label>
      {selectedFile ? (
        <div className="mt-2 max-w-sm" role="status" aria-live="polite">
          <p className="truncate text-xs font-semibold text-[#41576e]">{selectedFile.name}{selectedFile.size ? ` · ${formatFileSize(selectedFile.size)}` : ''}</p>
          {busy || submitting || feedback?.tone === 'loading' ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-[#526f89]"><LoaderCircle className="animate-spin" size={13} aria-hidden="true" />{feedback?.message || 'Uploading securely — please keep this page open.'}</p>
          ) : null}
          {feedback?.tone === 'success' ? <p className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-[#247148]"><CheckCircle2 size={13} aria-hidden="true" />{feedback.message}</p> : null}
          {feedback?.tone === 'error' ? <p className="mt-1 flex items-center gap-1.5 text-xs leading-5 text-[#b42318]"><TriangleAlert size={13} aria-hidden="true" />{feedback.message}</p> : null}
        </div>
      ) : null}
    </div>
  )
}

export default ClientDocumentUploadButton
