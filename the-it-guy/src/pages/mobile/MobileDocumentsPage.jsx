import { Camera, Download, Eye, FileCheck2, Share2, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MobilePushOptIn, MobileUploadSheet } from '../../components/mobile-shell/MobileProductivity'
import { MobileCard, MobileEmptyState } from '../../components/mobile-shell/MobileShellStates'
import { getMobileDocumentCentre, getMobileScannerQueue } from '../../services/mobileProductivityService'
import { trackMobileMetric } from '../../services/observability/monitoring'

const ACTION_ICONS = {
  View: Eye,
  Download,
  Share: Share2,
  Upload,
}

function DocumentRow({ document, onUpload, onAction }) {
  return (
    <MobileCard>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#10243a]">{document.title}</p>
          <p className="mt-1 text-xs text-[#60758d]">{document.related} · {document.date}</p>
        </div>
        <span className="rounded-full bg-[#edf3f8] px-3 py-1 text-[11px] font-semibold text-[#274c69]">{document.status}</span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {document.actions.map((action) => {
          const Icon = ACTION_ICONS[action] || Eye
          return (
            <button
              key={action}
              type="button"
              className="flex min-h-11 items-center justify-center rounded-2xl border border-[#d7e0ea] bg-white text-[#10243a]"
              onClick={() => action === 'Upload' ? onUpload(document) : onAction(document, action)}
              aria-label={`${action} ${document.title}`}
            >
              <Icon className="h-4 w-4" />
            </button>
          )
        })}
      </div>
    </MobileCard>
  )
}

export default function MobileDocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [centre, setCentre] = useState(() => getMobileDocumentCentre())
  const [scannerQueue, setScannerQueue] = useState(() => getMobileScannerQueue())
  const [filter, setFilter] = useState('All')
  const [uploadTarget, setUploadTarget] = useState(null)
  const createIntent = searchParams.get('create') || ''
  const rows = useMemo(() => {
    const combined = [
      ...centre.outstanding,
      ...centre.requested,
      ...centre.recent,
      ...centre.uploaded,
    ]
    const unique = new Map(combined.map((item) => [item.id, item]))
    return Array.from(unique.values()).filter((item) => filter === 'All' || item.related === filter)
  }, [centre, filter])

  useEffect(() => {
    if (createIntent === 'document' || createIntent === 'scan') {
      setUploadTarget({ module: 'transaction' })
    }
  }, [createIntent])

  function handleDocumentAction(document, action) {
    void trackMobileMetric('document_action_used', {
      route: '/mobile/documents',
      metadata: { documentId: document.id, action, module: document.module },
    })
  }

  function handleUploaded() {
    setCentre(getMobileDocumentCentre())
    setScannerQueue(getMobileScannerQueue())
    void trackMobileMetric('document_uploaded', { route: '/mobile/documents', metadata: { source: 'document_centre' } })
  }

  function closeUploadSheet() {
    setUploadTarget(null)
    if (!createIntent) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('create')
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <div className="space-y-5" data-phase5-documents>
      <section className="rounded-[30px] bg-[#10243a] p-5 text-white shadow-[0_20px_46px_rgba(15,23,42,0.18)]">
        <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase text-[#9fe0bd]">Scanner Hub</p>
          <h1 className="mt-2 text-[32px] font-semibold text-white">Documents</h1>
          <p className="mt-2 text-sm leading-6 text-[#dce8f2]">Scan, queue and review transaction documents from the field.</p>
        </div>
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1f7a5a] text-white" onClick={() => setUploadTarget({ module: 'transaction' })} aria-label="Upload document">
          <Camera className="h-5 w-5" />
        </button>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-[20px] bg-white/10 p-3">
            <FileCheck2 className="h-4 w-4 text-[#9fe0bd]" />
            <p className="mt-2 text-[22px] font-semibold">{centre.uploaded.length}</p>
            <p className="text-[11px] font-semibold text-[#c7d7e4]">Uploaded</p>
          </div>
          <div className="rounded-[20px] bg-white/10 p-3">
            <Upload className="h-4 w-4 text-[#9fe0bd]" />
            <p className="mt-2 text-[22px] font-semibold">{scannerQueue.length}</p>
            <p className="text-[11px] font-semibold text-[#c7d7e4]">Scans</p>
          </div>
          <div className="rounded-[20px] bg-white/10 p-3">
            <Eye className="h-4 w-4 text-[#9fe0bd]" />
            <p className="mt-2 text-[22px] font-semibold">{centre.outstanding.length}</p>
            <p className="text-[11px] font-semibold text-[#c7d7e4]">Due</p>
          </div>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {centre.filters.map((item) => (
          <button
            key={item}
            type="button"
            className={`min-h-11 shrink-0 rounded-2xl px-4 text-sm font-semibold ${filter === item ? 'bg-[#10243a] text-white' : 'bg-white text-[#60758d]'}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <section>
        <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Scanner Queue</h2>
        {scannerQueue.length ? (
          <div className="space-y-3">
            {scannerQueue.map((scan) => (
              <MobileCard key={scan.id}>
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#e8f6ef] text-[#1f7a5a]">
                    <Camera className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-[#10243a]">{scan.title}</p>
                    <p className="mt-1 text-[13px] text-[#60758d]">{scan.source} · {scan.fileCount} file{scan.fileCount === 1 ? '' : 's'} · {scan.createdLabel}</p>
                  </div>
                  <span className="rounded-full bg-[#edf8f2] px-3 py-1 text-[11px] font-semibold text-[#1f7a5a]">{scan.status}</span>
                </div>
              </MobileCard>
            ))}
          </div>
        ) : (
          <MobileEmptyState title="No scans queued." body="Use the camera upload to create a scanner-ready document queue." actionLabel="Scan Document" onAction={() => setUploadTarget({ module: 'transaction' })} />
        )}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <MobileCard className="p-3">
          <p className="text-[11px] font-semibold uppercase text-[#60758d]">Outstanding</p>
          <p className="mt-2 text-[26px] font-semibold text-[#10243a]">{centre.outstanding.length}</p>
        </MobileCard>
        <MobileCard className="p-3">
          <p className="text-[11px] font-semibold uppercase text-[#60758d]">Uploaded</p>
          <p className="mt-2 text-[26px] font-semibold text-[#10243a]">{centre.uploaded.length + 2}</p>
        </MobileCard>
      </section>

      <section className="space-y-3">
        {rows.length ? rows.map((document) => (
          <DocumentRow
            key={document.id}
            document={document}
            onUpload={setUploadTarget}
            onAction={handleDocumentAction}
          />
        )) : <MobileEmptyState title="No documents found." body="Try a different document filter." />}
      </section>

      <MobilePushOptIn route="/mobile/documents" />

      <MobileUploadSheet
        open={Boolean(uploadTarget)}
        module={uploadTarget?.module || 'transaction'}
        workspaceId={uploadTarget?.id || ''}
        onClose={closeUploadSheet}
        onUploaded={handleUploaded}
      />
    </div>
  )
}
