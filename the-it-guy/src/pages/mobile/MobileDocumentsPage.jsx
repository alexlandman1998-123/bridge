import { Download, Eye, Share2, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MobilePushOptIn, MobileUploadSheet } from '../../components/mobile-shell/MobileProductivity'
import { MobileCard, MobileEmptyState } from '../../components/mobile-shell/MobileShellStates'
import { getMobileDocumentCentre } from '../../services/mobileProductivityService'
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
              className="flex min-h-10 items-center justify-center rounded-2xl border border-[#d7e0ea] bg-white text-[#10243a]"
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
  const [centre, setCentre] = useState(() => getMobileDocumentCentre())
  const [filter, setFilter] = useState('All')
  const [uploadTarget, setUploadTarget] = useState(null)
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

  function handleDocumentAction(document, action) {
    void trackMobileMetric('document_action_used', {
      route: '/mobile/documents',
      metadata: { documentId: document.id, action, module: document.module },
    })
  }

  function handleUploaded() {
    setCentre(getMobileDocumentCentre())
    void trackMobileMetric('document_uploaded', { route: '/mobile/documents', metadata: { source: 'document_centre' } })
  }

  return (
    <div className="space-y-5">
      <section className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold text-[#10243a]">Documents</h1>
          <p className="mt-2 text-sm leading-6 text-[#60758d]">Recent, outstanding, requested and uploaded documents in one mobile hub.</p>
        </div>
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#1f7a5a] text-white" onClick={() => setUploadTarget({ module: 'transaction' })} aria-label="Upload document">
          <Upload className="h-5 w-5" />
        </button>
      </section>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {centre.filters.map((item) => (
          <button
            key={item}
            type="button"
            className={`min-h-10 shrink-0 rounded-2xl px-4 text-sm font-semibold ${filter === item ? 'bg-[#10243a] text-white' : 'bg-white text-[#60758d]'}`}
            onClick={() => setFilter(item)}
          >
            {item}
          </button>
        ))}
      </div>

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
        onClose={() => setUploadTarget(null)}
        onUploaded={handleUploaded}
      />
    </div>
  )
}
