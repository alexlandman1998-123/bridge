import {
  Bell,
  Camera,
  Check,
  CloudOff,
  FileUp,
  Image,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { trackMobileMetric } from '../../services/observability/monitoring'
import {
  createMobileUploadRecord,
  getNotificationPreference,
  getOfflineDrafts,
  getUploadOptionsForModule,
  setNotificationPreference,
  syncOfflineDrafts,
} from '../../services/mobileProductivityService'
import { MobileCard, MobileEmptyState } from './MobileShellStates'

function UploadInput({ inputRef, accept, capture, multiple = true, onChange }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      capture={capture}
      multiple={multiple}
      className="hidden"
      onChange={onChange}
    />
  )
}

export function MobileUploadSheet({
  open = false,
  module = 'transaction',
  workspaceId = '',
  onClose = null,
  onUploaded = null,
}) {
  const cameraRef = useRef(null)
  const photoRef = useRef(null)
  const fileRef = useRef(null)
  const [documentType, setDocumentType] = useState(() => getUploadOptionsForModule(module)[0])
  const [success, setSuccess] = useState(null)
  const documentTypes = useMemo(() => getUploadOptionsForModule(module), [module])

  if (!open) return null

  function handleFiles(source, files) {
    if (!files?.length) return
    const record = createMobileUploadRecord({ files, source, module, workspaceId, documentType })
    setSuccess(record)
    void trackMobileMetric(source === 'camera' ? 'camera_upload_used' : 'document_uploaded', {
      route: `/mobile/${module}`,
      metadata: {
        module,
        workspaceId,
        source,
        fileCount: record.files.length,
        queued: record.status === 'queued',
      },
    })
    if (source === 'camera') {
      void trackMobileMetric('document_uploaded', {
        route: `/mobile/${module}`,
        metadata: { module, workspaceId, source, fileCount: record.files.length },
      })
    }
    onUploaded?.(record)
  }

  function handleChange(source, event) {
    handleFiles(source, event.target.files)
    event.target.value = ''
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end bg-[#10243a]/35 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={onClose}>
      <div className="mx-auto w-full max-w-[520px] rounded-[28px] bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.28)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase text-[#1f7a5a]">Mobile Upload</p>
            <h2 className="mt-1 text-[24px] font-semibold text-[#10243a]">Add document</h2>
          </div>
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f1f5f9] text-[#60758d]" onClick={onClose} aria-label="Close upload">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mt-5 block text-xs font-semibold uppercase text-[#60758d]" htmlFor="mobile-upload-document-type">Document Type</label>
        <select
          id="mobile-upload-document-type"
          className="mt-2 min-h-12 w-full rounded-2xl border border-[#d7e0ea] bg-white px-3 text-sm font-semibold text-[#10243a]"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value)}
        >
          {documentTypes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button type="button" className="flex min-h-[82px] flex-col items-center justify-center gap-2 rounded-[20px] bg-[#e8f6ef] px-2 text-sm font-semibold text-[#1f7a5a]" onClick={() => cameraRef.current?.click()}>
            <Camera className="h-5 w-5" />
            Take Photo
          </button>
          <button type="button" className="flex min-h-[82px] flex-col items-center justify-center gap-2 rounded-[20px] bg-[#edf3f8] px-2 text-sm font-semibold text-[#274c69]" onClick={() => photoRef.current?.click()}>
            <Image className="h-5 w-5" />
            Choose Photo
          </button>
          <button type="button" className="flex min-h-[82px] flex-col items-center justify-center gap-2 rounded-[20px] bg-[#fff6e5] px-2 text-sm font-semibold text-[#b7791f]" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-5 w-5" />
            Choose File
          </button>
        </div>

        {success ? (
          <div className="mt-4 rounded-[20px] border border-[#d9eadf] bg-[#f5fbf7] p-4 text-[#1f7a5a]">
            <div className="flex items-center gap-2 text-sm font-semibold"><Check className="h-4 w-4" /> Document Uploaded Successfully</div>
            <p className="mt-1 text-xs">{success.files.length} file{success.files.length === 1 ? '' : 's'} {success.status === 'queued' ? 'queued for sync' : 'optimised for upload'}.</p>
          </div>
        ) : null}

        <p className="mt-4 text-xs leading-5 text-[#60758d]">Photos are prepared for compression and optimisation. Multi-page selections are queued as PDF-ready batches where the browser supports it.</p>

        <UploadInput inputRef={cameraRef} accept="image/*" capture="environment" onChange={(event) => handleChange('camera', event)} />
        <UploadInput inputRef={photoRef} accept="image/*" onChange={(event) => handleChange('photo', event)} />
        <UploadInput inputRef={fileRef} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => handleChange('file', event)} />
      </div>
    </div>
  )
}

export function MobileSmartActionBar({ actions = [], onAction }) {
  if (!actions.length) return null
  return (
    <section>
      <h2 className="mb-3 text-[19px] font-semibold text-[#10243a]">Smart Actions</h2>
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="flex min-h-[58px] items-center justify-center gap-2 rounded-[20px] bg-[#10243a] px-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
            onClick={() => onAction?.(action)}
          >
            <Upload className="h-4 w-4 text-[#9fe0bd]" />
            {action.label}
          </button>
        ))}
      </div>
    </section>
  )
}

export function MobileOfflineDraftPanel() {
  const [drafts, setDrafts] = useState(() => getOfflineDrafts())
  const [syncedLabel, setSyncedLabel] = useState('')

  function handleSync() {
    const result = syncOfflineDrafts()
    setDrafts([])
    setSyncedLabel(result.syncedCount ? `${result.syncedCount} pending change${result.syncedCount === 1 ? '' : 's'} synced.` : 'Nothing pending.')
    void trackMobileMetric('offline_sync_completed', {
      route: '/mobile/offline',
      metadata: { syncedCount: result.syncedCount },
    })
  }

  return (
    <MobileCard>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#edf3f8] text-[#274c69]">
          <CloudOff className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-[#10243a]">Offline Draft Mode</h2>
          <p className="mt-1 text-sm leading-6 text-[#60758d]">Notes, task changes, status updates and document queues can be captured while offline.</p>
        </div>
      </div>
      {drafts.length ? (
        <div className="mt-4 space-y-2">
          {drafts.slice(0, 4).map((draft) => (
            <div key={draft.id} className="rounded-[18px] bg-[#f8fafc] p-3">
              <p className="text-sm font-semibold text-[#10243a]">{draft.title}</p>
              <p className="mt-1 text-xs text-[#60758d]">{draft.type} · {draft.createdLabel}</p>
            </div>
          ))}
        </div>
      ) : <MobileEmptyState title="No offline drafts." body="Pending changes will appear here before sync." />}
      <button type="button" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[#1f7a5a] px-4 text-sm font-semibold text-white" onClick={handleSync}>
        <RefreshCw className="h-4 w-4" />
        Sync Pending Changes
      </button>
      {syncedLabel ? <p className="mt-3 text-sm font-semibold text-[#1f7a5a]">{syncedLabel}</p> : null}
    </MobileCard>
  )
}

export function MobilePushOptIn({ route = '/mobile/notifications' }) {
  const [enabled, setEnabled] = useState(() => getNotificationPreference())
  const [message, setMessage] = useState('')

  async function handleEnable() {
    let allowed = true
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      allowed = (await Notification.requestPermission()) === 'granted'
    } else if (typeof Notification !== 'undefined') {
      allowed = Notification.permission === 'granted'
    }
    setEnabled(allowed)
    setNotificationPreference(allowed)
    setMessage(allowed ? 'Push notifications enabled.' : 'Notification permission was not granted.')
    void trackMobileMetric(allowed ? 'push_notifications_enabled' : 'push_notifications_declined', { route })
  }

  return (
    <MobileCard className="bg-[#10243a] text-white">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-white">
          <Bell className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold text-white">Push Notifications</h2>
          <p className="mt-1 text-sm leading-6 text-[#dce8f2]">Deep-link alerts open the relevant mobile workspace directly.</p>
        </div>
      </div>
      <button type="button" className="mt-4 min-h-11 rounded-2xl bg-white px-4 text-sm font-semibold text-[#10243a]" onClick={handleEnable}>
        {enabled ? 'Notifications Enabled' : 'Enable Notifications'}
      </button>
      {message ? <p className="mt-3 text-sm text-[#9fe0bd]">{message}</p> : null}
    </MobileCard>
  )
}
