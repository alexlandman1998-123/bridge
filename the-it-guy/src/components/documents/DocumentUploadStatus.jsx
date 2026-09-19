import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react'

function formatFileSize(bytes = 0) {
  const size = Number(bytes) || 0
  if (!size) return ''
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

export default function DocumentUploadStatus({ file = null, progress = null, className = '' }) {
  if (!file && !progress) return null
  const tone = progress?.stage === 'failed' ? 'error' : progress?.stage === 'complete' ? 'success' : 'loading'
  const Icon = tone === 'error' ? TriangleAlert : tone === 'success' ? CheckCircle2 : LoaderCircle
  const color = tone === 'error' ? 'text-[#b42318]' : tone === 'success' ? 'text-[#247148]' : 'text-[#526f89]'
  const message = progress?.message || (file ? 'Ready to upload.' : '')

  return (
    <div className={`min-w-0 ${className}`.trim()} role="status" aria-live="polite">
      {file ? <p className="truncate text-xs font-semibold text-[#41576e]">{file.name}{file.size ? ` · ${formatFileSize(file.size)}` : ''}</p> : null}
      {message ? <p className={`mt-1 flex items-start gap-1.5 text-xs leading-5 ${color}`}><Icon className={tone === 'loading' ? 'mt-0.5 animate-spin' : 'mt-0.5'} size={13} aria-hidden="true" />{message}</p> : null}
    </div>
  )
}
