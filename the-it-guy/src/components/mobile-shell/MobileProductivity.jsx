import {
  Bell,
  Camera,
  Check,
  ClipboardCheck,
  CloudOff,
  FileCheck2,
  Gauge,
  FileUp,
  Image,
  Lightbulb,
  LockKeyhole,
  Megaphone,
  Send,
  Radio,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
  Upload,
  X,
  Zap,
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { trackMobileMetric } from '../../services/observability/monitoring'
import {
  createMobileUploadRecord,
  getMobileCommandBrief,
  getNotificationPreference,
  getOfflineDrafts,
  getMobileFieldModeSnapshot,
  getMobileHandoffReview,
  getMobileLiveRoomBrief,
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

export function MobileFieldModePanel({
  workspace = {},
  tasks = [],
  documents = [],
  priorityActions = [],
  onOpenDocuments = null,
  onSync = null,
}) {
  const [snapshot, setSnapshot] = useState(() => getMobileFieldModeSnapshot({ workspace, tasks, documents, priorityActions }))
  const ready = snapshot.score >= 80

  function handleSync() {
    const result = syncOfflineDrafts()
    setSnapshot(getMobileFieldModeSnapshot({ workspace, tasks, documents, priorityActions }))
    onSync?.(result)
    void trackMobileMetric('field_mode_sync_used', {
      route: `/mobile/${workspace.module || 'home'}`,
      metadata: { module: workspace.module || '', syncedCount: result.syncedCount },
    })
  }

  return (
    <MobileCard className="overflow-hidden bg-[#10243a] text-white shadow-[0_18px_42px_rgba(15,23,42,0.20)]" data-phase5-field-mode>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#9fe0bd]">Field Mode</p>
          <h2 className="mt-2 text-[24px] font-semibold leading-tight text-white">{snapshot.state}</h2>
          <p className="mt-2 text-[14px] leading-6 text-[#dce8f2]">Capture, scan, sync and continue work without opening desktop.</p>
        </div>
        <span className={`flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full ${ready ? 'bg-[#9fe0bd] text-[#10243a]' : 'bg-[#fff6e5] text-[#7c5a12]'}`}>
          <span className="text-[20px] font-bold">{snapshot.score}</span>
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {snapshot.checks.map((check) => (
          <div key={check.label} className="rounded-[20px] bg-white/10 p-3">
            <p className="text-[11px] font-semibold uppercase text-[#9fb3c7]">{check.label}</p>
            <p className="mt-1 text-[14px] font-semibold text-white">{check.status}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <button type="button" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-2 text-[13px] font-semibold text-[#10243a]" onClick={onOpenDocuments || undefined}>
          <Camera className="h-4 w-4 text-[#1f7a5a]" />
          Scan
        </button>
        <button type="button" className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/12 px-2 text-[13px] font-semibold text-white" onClick={handleSync}>
          <RefreshCw className="h-4 w-4 text-[#9fe0bd]" />
          Sync
        </button>
        <span className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white/12 px-2 text-[13px] font-semibold text-white">
          {snapshot.online ? <Radio className="h-4 w-4 text-[#9fe0bd]" /> : <CloudOff className="h-4 w-4 text-[#ffd2a6]" />}
          {snapshot.online ? 'Live' : 'Offline'}
        </span>
      </div>

      {snapshot.recentScans.length ? (
        <div className="mt-5 space-y-2">
          {snapshot.recentScans.slice(0, 2).map((scan) => (
            <div key={scan.id} className="flex items-center gap-3 rounded-[18px] bg-white/10 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-[#9fe0bd]">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-white">{scan.title}</span>
                <span className="block truncate text-[12px] text-[#c7d7e4]">{scan.source} · {scan.status}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 flex items-start gap-3 rounded-[18px] bg-white/10 p-3">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-[#9fe0bd]" />
          <p className="text-[13px] leading-5 text-[#dce8f2]">No scanner queue yet. Uploading from camera will appear here for quick sync confidence.</p>
        </div>
      )}
    </MobileCard>
  )
}

const COMMAND_TONES = {
  red: 'border-[#f3d4d1] bg-[#fff8f7] text-[#b42318]',
  amber: 'border-[#f2dfbd] bg-[#fffaf1] text-[#b7791f]',
  green: 'border-[#d9eadf] bg-[#f5fbf7] text-[#1f7a5a]',
}

export function MobileCommandBriefPanel({
  workspace = {},
  tasks = [],
  documents = [],
  priorityActions = [],
  activity = [],
  onAction = null,
}) {
  const brief = useMemo(() => getMobileCommandBrief({ workspace, tasks, documents, priorityActions, activity }), [activity, documents, priorityActions, tasks, workspace])
  const healthy = brief.score >= 75

  function handleCommand(action, recommendation = null) {
    void trackMobileMetric('mobile_command_brief_action', {
      route: `/mobile/${workspace.module || 'home'}`,
      metadata: {
        module: workspace.module || '',
        action,
        recommendationId: recommendation?.id || '',
        score: brief.score,
      },
    })
    onAction?.(action, recommendation)
  }

  return (
    <MobileCard className="border-[#dfe7ef] bg-white" data-phase6-command-brief>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#60758d]">Command Brief</p>
          <h2 className="mt-2 text-[23px] font-semibold leading-tight text-[#10243a]">{brief.headline}</h2>
          <p className="mt-2 text-[14px] leading-6 text-[#60758d]">{brief.summary}</p>
        </div>
        <span className={`flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full ${healthy ? 'bg-[#e8f6ef] text-[#1f7a5a]' : 'bg-[#fff6e5] text-[#b7791f]'}`}>
          <span className="text-[19px] font-bold">{brief.score}</span>
        </span>
      </div>

      <div className="mt-5 rounded-[22px] bg-[#f8fafc] p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[#274c69]">
            <Workflow className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-[#10243a]">{brief.handoff.label}</p>
            <p className="mt-1 text-[13px] leading-5 text-[#60758d]">{brief.handoff.body}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {brief.recommendations.map((recommendation) => (
          <button
            key={recommendation.id}
            type="button"
            className={`flex min-h-[74px] w-full items-start gap-3 rounded-[22px] border p-3 text-left ${COMMAND_TONES[recommendation.tone] || COMMAND_TONES.amber}`}
            onClick={() => handleCommand(recommendation.action, recommendation)}
          >
            <Lightbulb className="mt-1 h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{recommendation.title}</span>
              <span className="mt-1 block text-[13px] leading-5 opacity-80">{recommendation.body}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-2">
        {brief.automations.map((automation) => (
          <div key={automation.id} className="flex items-start gap-3 rounded-[18px] bg-[#f8fafc] p-3">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${automation.enabled ? 'bg-[#e8f6ef] text-[#1f7a5a]' : 'bg-[#edf3f8] text-[#60758d]'}`}>
              <Gauge className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-[#10243a]">{automation.title}</span>
              <span className="mt-0.5 block text-[12px] leading-5 text-[#60758d]">{automation.body}</span>
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${automation.enabled ? 'bg-[#e8f6ef] text-[#1f7a5a]' : 'bg-[#edf3f8] text-[#60758d]'}`}>
              {automation.enabled ? 'On' : 'Ready'}
            </span>
          </div>
        ))}
      </div>

      <button type="button" className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#10243a] px-4 text-sm font-semibold text-white" onClick={() => handleCommand('Review command brief')}>
        <Zap className="h-4 w-4 text-[#9fe0bd]" />
        Review Command Brief
      </button>
    </MobileCard>
  )
}

const ROOM_TONES = {
  red: 'border-[#f3d4d1] bg-[#fff8f7] text-[#b42318]',
  amber: 'border-[#f2dfbd] bg-[#fffaf1] text-[#b7791f]',
  green: 'border-[#d9eadf] bg-[#f5fbf7] text-[#1f7a5a]',
}

export function MobileLiveRoomPanel({
  workspace = {},
  tasks = [],
  documents = [],
  activity = [],
  communicationThread = {},
  onSelectUpdate = null,
  onSendUpdate = null,
}) {
  const room = useMemo(() => getMobileLiveRoomBrief({ workspace, tasks, documents, activity, communicationThread }), [activity, communicationThread, documents, tasks, workspace])
  const [selectedUpdate, setSelectedUpdate] = useState(room.suggestedUpdates[0]?.id || '')
  const [sentLabel, setSentLabel] = useState('')
  const activeUpdate = room.suggestedUpdates.find((item) => item.id === selectedUpdate) || room.suggestedUpdates[0]

  function handleSelect(update) {
    setSelectedUpdate(update.id)
    setSentLabel('')
    onSelectUpdate?.(update)
    void trackMobileMetric('mobile_live_room_template_selected', {
      route: `/mobile/${workspace.module || 'room'}`,
      metadata: { module: workspace.module || '', templateId: update.id },
    })
  }

  function handleSend() {
    if (!activeUpdate) return
    setSentLabel('Client-safe update prepared.')
    onSendUpdate?.(activeUpdate)
    void trackMobileMetric('mobile_live_room_update_prepared', {
      route: `/mobile/${workspace.module || 'room'}`,
      metadata: {
        module: workspace.module || '',
        templateId: activeUpdate.id,
        readiness: room.readiness,
      },
    })
  }

  return (
    <MobileCard className="overflow-hidden border-[#dfe7ef] bg-[#f8fbfd]" data-phase7-live-room>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#60758d]">Live Transaction Room</p>
          <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#10243a]">{room.state}</h2>
          <p className="mt-2 text-[14px] leading-6 text-[#60758d]">{room.summary}</p>
        </div>
        <span className="flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-full bg-[#10243a] text-white shadow-[0_14px_30px_rgba(16,36,58,0.18)]">
          <span className="text-[19px] font-bold">{room.readiness}</span>
        </span>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {room.lanes.map((lane) => (
          <div key={lane.id} className={`min-h-[86px] rounded-[20px] border p-3 ${ROOM_TONES[lane.tone] || ROOM_TONES.amber}`}>
            <p className="text-[11px] font-semibold uppercase opacity-75">{lane.label}</p>
            <p className="mt-2 line-clamp-2 text-[13px] font-semibold leading-5">{lane.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-[22px] bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#edf3f8] text-[#274c69]">
            <UsersRound className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-[#10243a]">Accountability Map</p>
            <p className="mt-1 text-[13px] leading-5 text-[#60758d]">Next owner: {room.nextOwner} · {room.nextAction}</p>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {room.accountability.map((participant) => (
            <div key={participant.id} className="flex items-center gap-3 rounded-[18px] bg-[#f8fafc] p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-[#274c69]">
                <UsersRound className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold text-[#10243a]">{participant.name}</span>
                <span className="block truncate text-[12px] text-[#60758d]">{participant.role}</span>
              </span>
              <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#60758d]">{participant.state}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 rounded-[22px] bg-[#10243a] p-4 text-white">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-[#9fe0bd]">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-white">{room.clientUpdate.label}</p>
            <p className="mt-1 text-[13px] leading-5 text-[#dce8f2]">{room.clientUpdate.body}</p>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {room.suggestedUpdates.map((update) => (
            <button
              key={update.id}
              type="button"
              className={`min-h-10 shrink-0 rounded-full px-3 text-[12px] font-semibold ${activeUpdate?.id === update.id ? 'bg-[#9fe0bd] text-[#10243a]' : 'bg-white/10 text-white'}`}
              onClick={() => handleSelect(update)}
            >
              {update.label}
            </button>
          ))}
        </div>

        {activeUpdate ? (
          <div className="mt-3 rounded-[18px] bg-white/10 p-3">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#9fe0bd]" />
              <p className="text-[13px] leading-5 text-[#f7fbff]">{activeUpdate.text}</p>
            </div>
          </div>
        ) : null}

        <button type="button" className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-[#10243a]" onClick={handleSend}>
          <Send className="h-4 w-4 text-[#1f7a5a]" />
          Prepare Shared Update
        </button>
        {sentLabel ? (
          <p className="mt-3 flex items-center gap-2 text-[13px] font-semibold text-[#9fe0bd]">
            <Megaphone className="h-4 w-4" />
            {sentLabel}
          </p>
        ) : null}
      </div>
    </MobileCard>
  )
}

const HANDOFF_TONES = {
  red: 'border-[#f3d4d1] bg-[#fff8f7] text-[#b42318]',
  amber: 'border-[#f2dfbd] bg-[#fffaf1] text-[#b7791f]',
  green: 'border-[#d9eadf] bg-[#f5fbf7] text-[#1f7a5a]',
}

export function MobileHandoffReviewPanel({
  workspace = {},
  tasks = [],
  documents = [],
  activity = [],
  priorityActions = [],
  communicationThread = {},
  onApprove = null,
}) {
  const review = useMemo(() => getMobileHandoffReview({ workspace, tasks, documents, activity, priorityActions, communicationThread }), [activity, communicationThread, documents, priorityActions, tasks, workspace])
  const [approvalLabel, setApprovalLabel] = useState('')
  const ready = review.score >= 86

  function handleApprove() {
    setApprovalLabel(ready ? 'Handoff approval recorded.' : 'Conditional review recorded.')
    onApprove?.(review)
    void trackMobileMetric('mobile_handoff_review_approved', {
      route: `/mobile/${workspace.module || 'handoff'}`,
      metadata: {
        module: workspace.module || '',
        score: review.score,
        certificate: review.certificate,
      },
    })
  }

  return (
    <MobileCard className="overflow-hidden border-[#dfe7ef] bg-white" data-phase8-handoff-review>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#60758d]">Handoff Review</p>
          <h2 className="mt-2 text-[24px] font-semibold leading-tight text-[#10243a]">{review.state}</h2>
          <p className="mt-2 text-[14px] leading-6 text-[#60758d]">{review.summary}</p>
        </div>
        <span className={`flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-full ${ready ? 'bg-[#e8f6ef] text-[#1f7a5a]' : 'bg-[#fff6e5] text-[#b7791f]'}`}>
          <span className="text-[19px] font-bold">{review.score}</span>
        </span>
      </div>

      <div className="mt-5 rounded-[22px] bg-[#10243a] p-4 text-white">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-[#9fe0bd]">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-white">{review.certificate}</p>
            <p className="mt-1 text-[13px] leading-5 text-[#dce8f2]">Owner: {review.owner} · Stage: {review.stageLabel}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {review.packet.map((item) => (
            <div key={item.label} className="rounded-[18px] bg-white/10 p-3">
              <p className="text-[11px] font-semibold uppercase text-[#9fb3c7]">{item.label}</p>
              <p className="mt-1 line-clamp-2 text-[13px] font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {review.gates.map((gate) => (
          <div key={gate.id} className={`rounded-[20px] border p-3 ${HANDOFF_TONES[gate.tone] || HANDOFF_TONES.amber}`}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white/70">
                {gate.id === 'documents' ? <FileCheck2 className="h-4 w-4" /> : gate.id === 'decision' ? <Route className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{gate.label} · {gate.status}</span>
                <span className="mt-1 block text-[13px] leading-5 opacity-80">{gate.body}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {review.audit.map((item) => (
          <div key={item.label} className="rounded-[18px] bg-[#f8fafc] p-3">
            <p className="text-[11px] font-semibold uppercase text-[#60758d]">{item.label}</p>
            <p className="mt-1 text-[13px] font-semibold text-[#10243a]">{item.value}</p>
          </div>
        ))}
      </div>

      <button type="button" className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#10243a] px-4 text-sm font-semibold text-white" onClick={handleApprove}>
        <ClipboardCheck className="h-4 w-4 text-[#9fe0bd]" />
        {ready ? 'Approve Mobile Handoff' : 'Record Conditional Review'}
      </button>
      {approvalLabel ? <p className="mt-3 text-sm font-semibold text-[#1f7a5a]">{approvalLabel}</p> : null}
    </MobileCard>
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
