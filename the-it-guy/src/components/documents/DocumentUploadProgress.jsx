import { CheckCircle2, Loader2 } from 'lucide-react'

export default function DocumentUploadProgress({ progress }) {
  if (!progress) return null
  const uploaded = progress.stage === 'complete'
  const failed = progress.stage === 'failed'
  return <div className={`mt-3 rounded-lg border p-3 text-sm ${failed ? 'border-red-200 bg-red-50 text-red-800' : uploaded ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
    <p role={failed ? 'alert' : 'status'} aria-live="polite" className="flex items-center gap-2 font-semibold">
      {uploaded ? <CheckCircle2 size={16} /> : !failed ? <Loader2 size={16} className="animate-spin" /> : null}
      {uploaded ? 'Uploaded' : failed ? 'Upload needs attention' : 'Uploading'}{progress.fileName ? ` · ${progress.fileName}` : ''}
    </p>
    {!uploaded && !failed ? <div role="progressbar" aria-label={`Uploading ${progress.fileName || 'document'}`} aria-valuetext={progress.message} className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-1/2 animate-pulse rounded-full bg-[#168452]" /></div> : null}
    {!uploaded ? <p className="mt-1 text-xs">{progress.message}</p> : progress.warnings?.length ? <p className="mt-1 text-xs">{progress.warnings.join(' ')}</p> : null}
  </div>
}
