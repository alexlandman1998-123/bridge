import { useRef, useState } from 'react'
import DocumentUploadProgress from '../documents/DocumentUploadProgress.jsx'
import { getDocumentUploadPolicy } from '../../lib/documentUploadPolicy.js'
import { createDocumentUploadProgress } from '../../lib/documentUploadLifecycle.js'

// Use the Sales feedback component while retaining rental requirement/version
// checks in the caller. All selected files remain available for a safe retry.
export default function RentalDocumentUploadControl({ title, label = 'Upload file', multiple = false, disabled = false, onUpload, className = '', surface = 'rental_application' }) {
  const policy = getDocumentUploadPolicy({ surface })
  const [progress, setProgress] = useState(null)
  const [retryFiles, setRetryFiles] = useState(null)
  const guard = useRef(false)
  async function upload(files) {
    if (disabled || guard.current) return
    guard.current = true
    let latest = createDocumentUploadProgress('preparing', '', { fileName: files[0].name })
    setProgress(latest)
    const report = event => { latest = event; setProgress(event) }
    try {
      const result = await onUpload(files, report)
      if (result === false && latest.stage !== 'complete') throw new Error(latest.stage === 'failed' ? latest.message : 'The document could not be saved. Review the message and retry.')
      if (result === false) { setRetryFiles(files); return }
      if (latest.stage !== 'complete') report(createDocumentUploadProgress('complete', '', { fileName: files.at(-1).name }))
      setRetryFiles(null)
    } catch (cause) {
      report(createDocumentUploadProgress('failed', cause.message, { fileName: latest.fileName }))
      setRetryFiles(files)
    } finally { guard.current = false }
  }
  return <div className="min-w-0">
    <label className={`${className} inline-block ${disabled || progress?.busy ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      {label}
      <input type="file" title={policy.helpText} aria-label={`Upload ${title}`} className="sr-only" accept={policy.accept} multiple={multiple} disabled={disabled || progress?.busy} onChange={event => {
        const files = Array.from(event.target.files || [])
        event.target.value = ''
        if (files.length) void upload(files)
      }} />
    </label>
    <span className="block text-xs font-normal text-slate-500">{policy.helpText}</span>
    <DocumentUploadProgress progress={progress} />
    {retryFiles ? <button type="button" className={`${className} mt-2`} disabled={disabled || progress?.busy} onClick={() => void upload(retryFiles)}>Retry upload</button> : null}
  </div>
}
