import { Check, ChevronRight, Download, FileCheck2, Loader2, LockKeyhole, PenLine, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import {
  applySignerField,
  completeSignerSigning,
  resolveSignerFinalSignedArtifactAccess,
  resolveExternalSignerSession,
  saveSignerAsset,
} from '../lib/externalSigningApi'
import { renderPacketPreviewHtml } from '../core/documents/packetWorkflow'
import { buildSigningCompletion } from '../core/documents/signingCompletionContract'
import { getSigningCompletionAccess } from '../core/documents/signingCompletionAccess'
import { buildDocumentRoleGuidance } from '../core/documents/documentRoleGuidance'
import DocumentRoleGuidanceCard from '../components/documents/DocumentRoleGuidanceCard'
import { buildDocumentRoleActions } from '../core/documents/documentRoleActions'
import DocumentRoleActionBar from '../components/documents/DocumentRoleActionBar'
import { buildDocumentResponsibility } from '../core/documents/documentResponsibility'
import DocumentResponsibilityCard from '../components/documents/DocumentResponsibilityCard'
import { buildDocumentHelpRecovery } from '../core/documents/documentHelpRecovery'
import DocumentHelpRecoveryCard from '../components/documents/DocumentHelpRecoveryCard'
import { buildDocumentJourneyProgress } from '../core/documents/documentJourneyProgress'
import { DocumentJourneyProgress } from '../components/documents/DocumentJourneyProgress'
import { buildDocumentMobileAction } from '../core/documents/documentMobileAction'
import { DocumentMobileActionDock } from '../components/documents/DocumentMobileActionDock'
import { buildDocumentAccessibility } from '../core/documents/documentAccessibility'
import { DocumentAccessibilityNavigation } from '../components/documents/DocumentAccessibilityNavigation'
import { buildDocumentCommitConfirmation } from '../core/documents/documentCommitConfirmation'
import { DocumentCommitConfirmation } from '../components/documents/DocumentCommitConfirmation'
import { buildDocumentOutcomeFeedback } from '../core/documents/documentOutcomeFeedback'
import { DocumentOutcomeNotice } from '../components/documents/DocumentOutcomeNotice'
import { recordDocumentExperienceEvent } from '../services/documentExperienceTelemetryService'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizePreviewHtml(value) {
  const html = normalizeText(value)
  return html.includes('<') ? html : ''
}

function normalizeSectionManifest(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value.sectionManifest)) return value.sectionManifest
  if (Array.isArray(value.sections)) return value.sections
  if (Array.isArray(value.items)) return value.items
  return []
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function formatDateTime(value) {
  const text = normalizeText(value)
  if (!text) return '—'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-ZA')
}

function resolveErrorMessage(error = null) {
  const code = normalizeText(error?.code).toUpperCase()
  if (code === 'INVALID_SIGNING_TOKEN') return 'This signing link is invalid.'
  if (code === 'SIGNING_TOKEN_EXPIRED') return 'This signing link has expired.'
  if (code === 'REMAINING_REQUIRED_FIELDS') return 'Complete all required fields before submitting signing.'
  if (code === 'FIELD_SCOPE_DENIED') return 'This field cannot be completed from your signing session.'
  if (code === 'SELLER_WAITING_FOR_AGENT') return 'The agency representative needs to sign first. You will receive a signing invitation once that step is complete.'
  if (code === 'SIGNING_ALREADY_COMPLETED') return 'All required signatures are complete.'
  if (code.includes('SIGNER_SESSION')) return 'This signing link could not be opened. Please request a new signing link from your agent.'
  if (code.includes('SIGNER_ACTION')) return 'The signing action could not be completed. Please try again or request a new signing link.'
  const message = normalizeText(error?.message)
  if (message.toLowerCase().includes('edge function') || message.toLowerCase().includes('non-2xx')) {
    return 'This signing link could not be opened. Please request a new signing link from your agent.'
  }
  return message || 'Unable to process signing right now.'
}

function SigningCompleteScreen({
  completion,
  packet = {},
  signer = {},
  version = {},
  refreshing = false,
  finalArtifactBusy = false,
  finalArtifactError = '',
  onRefresh = null,
  onOpenFinalArtifact = null,
}) {
  const finalArtifact = completion?.finalArtifact || {}
  const finalArtifactReady = finalArtifact?.ready === true
  const documentType = normalizeKey(completion?.document?.type || packet?.packet_type)
  const completedLabel = documentType === 'otp' ? 'Offer to Purchase' : documentType === 'mandate' ? 'Mandate' : 'Document'

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#eef3f8] p-4 text-[#142132] sm:p-6">
      <section className="w-full max-w-2xl rounded-[28px] border border-[#d4e5dc] bg-white px-6 py-8 text-center shadow-[0_24px_70px_rgba(15,32,54,0.12)] sm:px-10 sm:py-11">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#e9f8ef] text-[#237047]">
          <FileCheck2 className="h-8 w-8" />
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#2b7b4d]">Signing complete</p>
        <h1 className="mt-2 text-2xl font-black text-[#142132] sm:text-3xl">Your {completedLabel} has been signed</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#607387]">
          Thank you, {completion?.signer?.name || signer?.signer_name || 'Signer'}. Your signature was saved against this transaction and this signing link will not restart the process.
        </p>

        <div className="mt-7 rounded-[18px] border border-[#d7e2ef] bg-[#f8fbfd] p-4 text-left">
          <p className="text-sm font-bold text-[#142132]">{completion?.document?.title || packet?.title || 'Signed document'}</p>
          <p className="mt-1 text-xs text-[#607387]">
            Version {completion?.version?.number || version?.version_number || '—'} · completed {formatDateTime(completion?.completedAt || completion?.signer?.signedAt)}
          </p>
          <p className={`mt-3 flex items-center gap-2 text-xs font-semibold ${completion?.transactionSaved ? 'text-[#276b46]' : 'text-[#8a641f]'}`}>
            <ShieldCheck className="h-4 w-4" />
            {completion?.transactionSaved
              ? 'Completed version locked, verified and saved to the transaction'
              : 'Completed version locked — transaction publication is being verified'}
          </p>
          {completion?.delivery?.emailStatus === 'sent' ? (
            <p className="mt-2 text-xs font-semibold text-[#276b46]">A secure completed-copy email was delivered.</p>
          ) : null}
        </div>

        {finalArtifactReady && typeof onOpenFinalArtifact === 'function' ? (
          <button
            type="button"
            onClick={onOpenFinalArtifact}
            disabled={finalArtifactBusy}
            className="mt-6 inline-flex min-h-[50px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#12385f] px-5 text-sm font-bold text-white shadow-[0_14px_30px_rgba(18,56,95,0.22)] sm:w-auto"
          >
            {finalArtifactBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
            {finalArtifactBusy ? 'Preparing secure PDF…' : 'Open completed PDF'}
          </button>
        ) : (
          <p className="mt-6 rounded-[14px] border border-[#d8e3ef] bg-[#f4f8fc] px-4 py-3 text-sm font-semibold text-[#35546c]">
            Your part is complete. The final PDF will be available in the transaction once every required signer has finished.
          </p>
        )}

        {finalArtifactError ? (
          <p className="mt-3 rounded-[12px] border border-[#f0ccc7] bg-[#fff7f5] px-4 py-3 text-sm font-semibold text-[#8e1f15]">
            {finalArtifactError}
          </p>
        ) : null}

        {(!finalArtifactReady || !completion?.transactionSaved) && typeof onRefresh === 'function' ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-[#cbd9e8] bg-white px-4 text-sm font-bold text-[#35546c] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Checking…' : 'Check for completed copy'}
          </button>
        ) : null}

        <p className="mt-6 text-xs leading-5 text-[#7389a2]">You may safely close this page. Reopening this link will continue to show this confirmation.</p>
      </section>
    </main>
  )
}

function fieldTypeLabel(fieldType = '') {
  const normalized = normalizeKey(fieldType)
  if (normalized === 'initial') return 'Initial'
  if (normalized === 'signature') return 'Signature'
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : 'Field'
}

function fieldLocationLabel(field = null, { includeType = true } = {}) {
  const fieldType = normalizeKey(field?.field_type)
  const typeLabel = fieldTypeLabel(fieldType)
  const pageNumber = Number(field?.page_number) || 1
  const locationLabel = fieldType === 'initial' ? `section ${pageNumber}` : `page ${pageNumber}`
  return includeType ? `${typeLabel} · ${locationLabel}` : locationLabel
}

function signerInstructionText({ signer = {}, progress = {} } = {}) {
  const role = normalizeKey(signer?.signer_role)
  const status = normalizeKey(signer?.status)
  if (status === 'signed' || Number(progress?.remainingCount || 0) === 0) return 'All required signatures are complete.'
  if (role === 'agent') return 'Please review and sign the mandate.'
  if (role === 'seller') return 'The agency representative has signed. Please review and sign the mandate.'
  return 'Please review and complete the required signing fields.'
}

function isCompleted(field = null) {
  return normalizeKey(field?.status) === 'completed'
}

function numberOr(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function getFieldId(field = null) {
  return normalizeText(field?.id)
}

function Arch9Mark() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-[#d8e3ef] bg-white shadow-[0_10px_24px_rgba(17,47,80,0.10)]">
        <img src="/favicon-light.svg" alt="" className="h-8 w-8 object-contain" />
      </span>
      <div>
        <p className="text-sm font-bold leading-none text-[#142132]">Arch9</p>
        <p className="mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-[#748aa2]">Secure Signing</p>
      </div>
    </div>
  )
}

function LoadingShell() {
  return (
    <main className="min-h-screen bg-[#eef3f8] p-4 text-[#142132] sm:p-6">
      <div className="mx-auto max-w-6xl rounded-[22px] border border-[#d7e2ef] bg-white px-6 py-8 shadow-[0_18px_48px_rgba(15,32,54,0.08)]">
        <div className="flex items-center gap-3 text-sm font-semibold text-[#4d6680]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading secure signing session...
        </div>
      </div>
    </main>
  )
}

function SigningCanvas({ mode, signerName, onSave, onCancel, saving = false }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const drawingRef = useRef(false)
  const [tab, setTab] = useState('draw')
  const [typedName, setTypedName] = useState(signerName || '')
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return undefined

    function resizeCanvas() {
      const rect = wrap.getBoundingClientRect()
      const width = Math.max(280, Math.floor(rect.width))
      const height = Math.max(150, Math.min(260, Math.floor(window.innerHeight * 0.28)))
      const ratio = Math.max(1, window.devicePixelRatio || 1)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      canvas.width = Math.floor(width * ratio)
      canvas.height = Math.floor(height * ratio)
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.lineJoin = 'round'
      context.lineCap = 'round'
      context.lineWidth = mode === 'initial' ? 3 : 2.6
      context.strokeStyle = '#10253f'
    }

    resizeCanvas()
    const observer = new ResizeObserver(resizeCanvas)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [mode])

  function pointFromEvent(event) {
    const canvas = canvasRef.current
    const rect = canvas?.getBoundingClientRect()
    const source = event.touches?.[0] || event.changedTouches?.[0] || event
    return {
      x: (source.clientX || 0) - (rect?.left || 0),
      y: (source.clientY || 0) - (rect?.top || 0),
    }
  }

  function startDraw(event) {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    drawingRef.current = true
    const point = pointFromEvent(event)
    context.beginPath()
    context.moveTo(point.x, point.y)
    event.preventDefault()
  }

  function draw(event) {
    if (!drawingRef.current) return
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const point = pointFromEvent(event)
    context.lineTo(point.x, point.y)
    context.stroke()
    setHasInk(true)
    event.preventDefault()
  }

  function endDraw() {
    drawingRef.current = false
  }

  function clearCanvas() {
    if (tab === 'type') {
      setTypedName('')
      return
    }
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const rect = canvas.getBoundingClientRect()
    context.clearRect(0, 0, rect.width, rect.height)
    setHasInk(false)
  }

  function typedDataUrl() {
    const canvas = document.createElement('canvas')
    const width = mode === 'initial' ? 560 : 920
    const height = mode === 'initial' ? 220 : 280
    const ratio = 2
    canvas.width = width * ratio
    canvas.height = height * ratio
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const context = canvas.getContext('2d')
    context.scale(ratio, ratio)
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#10253f'
    context.font = `${mode === 'initial' ? 92 : 104}px "Brush Script MT", "Segoe Script", cursive`
    context.textBaseline = 'middle'
    context.fillText(typedName || signerName || 'Signed', 32, height / 2)
    return canvas.toDataURL('image/png')
  }

  async function save() {
    if (tab === 'type') {
      await onSave(typedDataUrl())
      return
    }
    if (!hasInk) return
    await onSave(canvasRef.current.toDataURL('image/png'))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#071523]/65 p-0 backdrop-blur-sm sm:items-center sm:p-5">
      <section className="max-h-[94vh] w-full max-w-2xl overflow-hidden rounded-t-[26px] border border-[#d8e3ef] bg-white shadow-[0_30px_90px_rgba(6,18,32,0.35)] sm:rounded-[26px]">
        <header className="flex items-start justify-between gap-4 border-b border-[#e5edf5] px-5 py-4">
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7389a2]">{fieldTypeLabel(mode)} Required</p>
            <h2 className="mt-1 text-lg font-bold text-[#122238]">Add your {fieldTypeLabel(mode).toLowerCase()}</h2>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full border border-[#d8e3ef] p-2 text-[#47627c]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="inline-flex rounded-full border border-[#d8e3ef] bg-[#f5f8fb] p-1">
            {['draw', 'type'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${tab === item ? 'bg-[#12385f] text-white shadow-sm' : 'text-[#58708a]'}`}
              >
                {item === 'draw' ? 'Draw' : 'Type'}
              </button>
            ))}
          </div>

          {tab === 'draw' ? (
            <div ref={wrapRef} className="rounded-[18px] border border-[#cfdceb] bg-[#fbfdff] p-2">
              <canvas
                ref={canvasRef}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
                className="block w-full rounded-[14px] bg-white [touch-action:none]"
                aria-label={`Draw ${mode}`}
              />
            </div>
          ) : (
            <div className="rounded-[18px] border border-[#cfdceb] bg-[#fbfdff] p-4">
              <label className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7389a2]" htmlFor="typed-signature">Name</label>
              <input
                id="typed-signature"
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                className="mt-2 w-full rounded-[12px] border border-[#d3dfeb] px-4 py-3 text-base font-semibold text-[#17283d] outline-none focus:border-[#12385f]"
              />
              <div className="mt-3 min-h-[110px] rounded-[14px] bg-white px-4 py-5 text-5xl text-[#10253f]" style={{ fontFamily: '"Brush Script MT", "Segoe Script", cursive' }}>
                {typedName || signerName || 'Signed'}
              </div>
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-[#e5edf5] px-5 py-4 sm:flex-row sm:justify-between">
          <button type="button" onClick={clearCanvas} className="min-h-[46px] rounded-[12px] border border-[#cad8e8] px-4 text-sm font-semibold text-[#284761]">
            Clear
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || (tab === 'draw' && !hasInk) || (tab === 'type' && !normalizeText(typedName))}
            className="min-h-[46px] rounded-[12px] bg-[#12385f] px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Saving...' : `Save ${fieldTypeLabel(mode)}`}
          </button>
        </footer>
      </section>
    </div>
  )
}

function PdfPage({ page, pageNumber, fields, activeFieldId, onFieldClick, zoom = 1 }) {
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const [display, setDisplay] = useState({ width: 0, height: 0, baseWidth: 1 })

  useEffect(() => {
    let cancelled = false
    let renderTask = null
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || !page) return undefined

    async function render() {
      const base = page.getViewport({ scale: 1 })
      const available = Math.max(280, wrap.clientWidth || 720)
      const targetWidth = Math.min(available, 980) * zoom
      const scale = targetWidth / base.width
      const ratio = Math.max(1, window.devicePixelRatio || 1)
      const viewport = page.getViewport({ scale })
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const context = canvas.getContext('2d')
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      renderTask = page.render({ canvasContext: context, viewport })
      await renderTask.promise
      if (!cancelled) setDisplay({ width: viewport.width, height: viewport.height, baseWidth: base.width })
    }

    render().catch((error) => {
      if (error?.name !== 'RenderingCancelledException') console.warn('[SignerPortal] PDF page render failed', error)
    })

    return () => {
      cancelled = true
      try {
        renderTask?.cancel?.()
      } catch (cancelError) {
        if (cancelError?.name !== 'RenderingCancelledException') console.warn('[SignerPortal] PDF render cancel failed', cancelError)
      }
    }
  }, [page, zoom])

  const pageScale = display.width / display.baseWidth

  return (
    <div ref={wrapRef} className="flex justify-center px-2 py-4 sm:px-4">
      <div className="relative overflow-hidden rounded-[12px] bg-white shadow-[0_18px_50px_rgba(15,32,54,0.16)] ring-1 ring-[#dce6f2]">
        <canvas ref={canvasRef} className="block bg-white" />
        {display.width ? fields.map((field) => {
          const fieldId = getFieldId(field)
          const fieldType = normalizeKey(field?.field_type)
          const completed = isCompleted(field)
          const active = activeFieldId === fieldId
          const left = numberOr(field?.x_position, 0) * pageScale
          const top = numberOr(field?.y_position, 0) * pageScale
          const width = Math.max(54, numberOr(field?.width, 110) * pageScale)
          const height = Math.max(32, numberOr(field?.height, 34) * pageScale)
          return (
            <button
              id={`sign-field-${fieldId}`}
              key={fieldId}
              type="button"
              onClick={() => onFieldClick(field)}
              className={`absolute flex items-center justify-center rounded-[8px] border text-[11px] font-bold shadow-lg transition ${
                completed
                  ? 'border-[#85c7a0] bg-[#eaf8ef]/95 text-[#1f7043]'
                  : active
                    ? 'border-[#f0b84b] bg-[#fff5d9] text-[#805200] ring-4 ring-[#f0b84b]/25'
                    : 'border-[#12385f] bg-[#12385f]/95 text-white hover:scale-[1.02]'
              }`}
              style={{ left, top, width, height }}
              aria-label={`${fieldTypeLabel(fieldType)} field on ${fieldType === 'initial' ? `section ${pageNumber}` : `page ${pageNumber}`}`}
            >
              {completed ? <Check className="mr-1 h-3.5 w-3.5" /> : <PenLine className="mr-1 h-3.5 w-3.5" />}
              {fieldType === 'initial' ? 'Initial' : 'Sign'}
            </button>
          )
        }) : null}
      </div>
    </div>
  )
}

function DocumentPreview({ documentUrl, fallbackHtml, fields, activeFieldId, onFieldClick }) {
  const [pdf, setPdf] = useState(null)
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    let cancelled = false
    let task = null
    async function loadPdf() {
      if (!documentUrl) return
      try {
        setLoading(true)
        setError('')
        setPages([])
        task = pdfjsLib.getDocument({ url: documentUrl, withCredentials: false })
        const loaded = await task.promise
        if (cancelled) return
        setPdf(loaded)
        const pageNumbers = Array.from({ length: loaded.numPages }, (_, index) => index + 1)
        const loadedPages = await Promise.all(pageNumbers.map((pageNumber) => loaded.getPage(pageNumber)))
        if (!cancelled) setPages(loadedPages)
      } catch (loadError) {
        console.warn('[SignerPortal] PDF preview failed; falling back to HTML/iframe preview.', loadError)
        if (!cancelled) setError('PDF preview could not be rendered in this browser.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadPdf()
    return () => {
      cancelled = true
      try {
        task?.destroy?.()
      } catch (destroyError) {
        console.warn('[SignerPortal] PDF task cleanup failed', destroyError)
      }
    }
  }, [documentUrl])

  const fieldsByPage = useMemo(() => {
    const groups = new Map()
    for (const field of fields) {
      const page = Math.max(1, Math.floor(numberOr(field?.page_number, 1)))
      if (!groups.has(page)) groups.set(page, [])
      groups.get(page).push(field)
    }
    return groups
  }, [fields])

  return (
    <section className="min-h-0 rounded-[22px] border border-[#d6e2ef] bg-[#e8eef5] shadow-[0_22px_70px_rgba(10,30,52,0.12)]">
      <header className="sticky top-[88px] z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#d6e2ef] bg-white/95 px-4 py-3 backdrop-blur md:top-0">
        <div>
          <h2 className="text-sm font-bold text-[#142132]">Document Preview</h2>
          <p className="text-xs text-[#607387]">{pdf ? `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}` : 'Review the document before signing.'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setZoom((value) => Math.max(0.8, Number((value - 0.1).toFixed(1))))} className="rounded-lg border border-[#ccd9e8] px-3 py-1.5 text-xs font-bold text-[#35546c]">-</button>
          <span className="min-w-12 text-center text-xs font-bold text-[#607387]">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((value) => Math.min(1.6, Number((value + 0.1).toFixed(1))))} className="rounded-lg border border-[#ccd9e8] px-3 py-1.5 text-xs font-bold text-[#35546c]">+</button>
        </div>
      </header>

      <div className="max-h-none overflow-auto md:max-h-[calc(100vh-148px)]">
        {loading ? (
          <div className="space-y-4 p-4">
            {[1, 2].map((item) => <div key={item} className="mx-auto h-[640px] max-w-[760px] animate-pulse rounded-[14px] bg-white/80" />)}
          </div>
        ) : pages.length ? (
          pages.map((page, index) => (
            <PdfPage
              key={page.pageNumber}
              page={page}
              pageNumber={index + 1}
              fields={fieldsByPage.get(index + 1) || []}
              activeFieldId={activeFieldId}
              onFieldClick={onFieldClick}
              zoom={zoom}
            />
          ))
        ) : fallbackHtml ? (
          <div className="h-[72vh] bg-white">
            <iframe title="signer-document-preview" srcDoc={fallbackHtml} className="h-full w-full border-0 bg-white" />
          </div>
        ) : documentUrl ? (
          <div className="h-[72vh] bg-white">
            <iframe title="signer-document-preview" src={documentUrl} className="h-full w-full border-0 bg-white" />
          </div>
        ) : (
          <div className="flex min-h-[56vh] items-center justify-center px-6 text-center text-sm text-[#607387]">
            {error || 'Preview is not available yet for this packet version.'}
          </div>
        )}
      </div>
    </section>
  )
}

export default function SignerPortal() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [session, setSession] = useState(null)
  const [completionDownloadError, setCompletionDownloadError] = useState('')
  const [assets, setAssets] = useState({ initial: null, signature: null })
  const [activeFieldId, setActiveFieldId] = useState('')
  const [captureField, setCaptureField] = useState(null)
  const [completeConfirmationOpen, setCompleteConfirmationOpen] = useState(false)
  const lastSignerJourneyTelemetryRef = useRef('')
  const lastSignerOutcomeTelemetryRef = useRef('')

  async function resolvePortalSession() {
    const result = await resolveExternalSignerSession({ token })
    return result?.session || null
  }

  async function refreshSession() {
    const nextSession = await resolvePortalSession()
    setSession(nextSession)
    return nextSession
  }

  useEffect(() => {
    let active = true
    async function load() {
      try {
        setLoading(true)
        setErrorMessage('')
        const result = await resolvePortalSession()
        if (!active) return
        setSession(result)
      } catch (error) {
        if (active) setErrorMessage(resolveErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [token])

  useEffect(() => {
    const completion = session?.completion
    if (!completion || !getSigningCompletionAccess(completion).shouldPoll) return undefined
    const timer = window.setTimeout(() => {
      void refreshSession().catch((error) => {
        console.warn('[SignerPortal] Completion refresh is still pending.', error)
      })
    }, 15000)
    return () => window.clearTimeout(timer)
  }, [session?.completion?.finalArtifact?.ready, session?.completion?.transactionSaved, token])

  const signer = session?.signer || {}
  const packet = session?.packet || {}
  const version = session?.version || {}
  const sessionBinding = session?.sessionBinding || session?.session_binding || {}
  const fields = useMemo(() => (Array.isArray(session?.fields) ? session.fields : []), [session?.fields])
  const documentPreviewUrl = normalizeText(
    session?.documentPreviewUrl ||
      session?.document_preview_url ||
      session?.previewUrl ||
      session?.preview_url ||
      session?.previewVersion?.rendered_file_url ||
      session?.version?.rendered_file_url,
  )
  const fallbackPreviewHtml = useMemo(() => {
    const previewData = session?.previewData && typeof session.previewData === 'object' ? session.previewData : null
    if (!previewData) return ''

    const storedPreviewHtml = normalizePreviewHtml(previewData.previewHtml || previewData.preview_html || previewData.html)
    if (storedPreviewHtml) return storedPreviewHtml

    const sectionManifest = normalizeSectionManifest(previewData.sectionManifest || previewData.section_manifest)
    const placeholders = previewData.placeholders && typeof previewData.placeholders === 'object' ? previewData.placeholders : {}
    if (!sectionManifest.length) return ''
    return renderPacketPreviewHtml({
      packetType: previewData.packetType || packet?.packet_type || 'mandate',
      title: previewData.title || packet?.title || 'Document Packet',
      placeholders,
      sectionManifest,
      branding: previewData.branding && typeof previewData.branding === 'object' ? previewData.branding : {},
    })
  }, [packet?.packet_type, packet?.title, session?.previewData])

  const progress = useMemo(() => {
    const required = fields.filter((field) => field?.required)
    const completed = required.filter(isCompleted)
    const remaining = required.filter((field) => !isCompleted(field))
    const percent = required.length ? Math.round((completed.length / required.length) * 100) : 0
    return {
      requiredCount: required.length,
      completedCount: completed.length,
      remainingCount: remaining.length,
      nextField: remaining[0] || null,
      percent,
    }
  }, [fields])

  const canCompleteSigning = progress.remainingCount === 0 && progress.requiredCount > 0
  const signerInstruction = signerInstructionText({ signer, progress })
  const currentCaptureType = normalizeKey(captureField?.field_type)
  const signerExperienceState = loading ? 'loading' : normalizeKey(signer?.status) || 'pending'
  const signerOutcomeFeedback = buildDocumentOutcomeFeedback({
    surface: 'signer_portal',
    message: statusMessage,
    remainingFields: progress.remainingCount,
  })
  const recordSignerExperience = useCallback((eventName, metadata = {}) => {
    void recordDocumentExperienceEvent({
      eventName,
      surface: 'signer_portal',
      role: signer?.signer_role,
      packetType: packet?.packet_type,
      ...metadata,
    })
  }, [packet?.packet_type, signer?.signer_role])

  useEffect(() => {
    if (!session || lastSignerJourneyTelemetryRef.current === signerExperienceState) return
    lastSignerJourneyTelemetryRef.current = signerExperienceState
    recordSignerExperience('journey_viewed', { state: signerExperienceState })
  }, [recordSignerExperience, session, signerExperienceState])

  useEffect(() => {
    const category = signerOutcomeFeedback?.category || ''
    const outcomeKey = `${signerExperienceState}:${category}`
    if (!category || lastSignerOutcomeTelemetryRef.current === outcomeKey) return
    lastSignerOutcomeTelemetryRef.current = outcomeKey
    recordSignerExperience('outcome_shown', { state: signerExperienceState, category })
  }, [recordSignerExperience, signerExperienceState, signerOutcomeFeedback?.category])

  function scrollToField(field = progress.nextField) {
    const fieldId = getFieldId(field)
    if (!fieldId) return
    setActiveFieldId(fieldId)
    window.setTimeout(() => {
      document.getElementById(`sign-field-${fieldId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }, 50)
  }

  function selectField(field) {
    const fieldType = normalizeKey(field?.field_type)
    setActiveFieldId(getFieldId(field))
    if (isCompleted(field)) {
      setStatusMessage(`${fieldTypeLabel(fieldType)} on ${fieldLocationLabel(field, { includeType: false })} is already complete.`)
      return
    }
    if (['initial', 'signature'].includes(fieldType)) void handleUseSaved(field)
  }

  async function applyFieldWithAsset(field, asset) {
    const fieldId = getFieldId(field)
    const fieldType = normalizeKey(field?.field_type)
    await applySignerField({
      token,
      fieldId,
      assetType: fieldType,
      assetPath: asset?.path || '',
      completedByEmail: signer?.signer_email || '',
    })
    const nextSession = await refreshSession()
    const nextRemaining = (Array.isArray(nextSession?.fields) ? nextSession.fields : []).find((item) => item?.required && !isCompleted(item))
    setStatusMessage(`${fieldTypeLabel(fieldType)} applied to ${fieldLocationLabel(field, { includeType: false })}.`)
    setCaptureField(null)
    if (nextRemaining) scrollToField(nextRemaining)
  }

  async function handleSaveAndApply(dataUrl) {
    const field = captureField
    const assetType = normalizeKey(field?.field_type)
    if (!field || !['initial', 'signature'].includes(assetType)) return
    try {
      setBusyAction(`field_${getFieldId(field)}`)
      setErrorMessage('')
      setStatusMessage('')
      const result = await saveSignerAsset({ token, assetType, dataUrl })
      const asset = result?.asset || null
      setAssets((current) => ({ ...current, [assetType]: asset }))
      await applyFieldWithAsset(field, asset)
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error))
    } finally {
      setBusyAction('')
    }
  }

  async function handleUseSaved(field) {
    const fieldType = normalizeKey(field?.field_type)
    const asset = assets[fieldType]
    setActiveFieldId(getFieldId(field))
    if (!asset?.path) {
      setCaptureField(field)
      return
    }
    try {
      setBusyAction(`field_${getFieldId(field)}`)
      setErrorMessage('')
      await applyFieldWithAsset(field, asset)
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error))
    } finally {
      setBusyAction('')
    }
  }

  async function handleCompleteSigning(confirmedCompletion = false) {
    if (!confirmedCompletion) {
      recordSignerExperience('commit_opened', { state: signerExperienceState, actionId: 'complete_signing' })
      setCompleteConfirmationOpen(true)
      return
    }
    recordSignerExperience('commit_confirmed', { state: signerExperienceState, actionId: 'complete_signing' })
    try {
      setBusyAction('complete_signing')
      setErrorMessage('')
      setStatusMessage('')
      await completeSignerSigning({ token })
      await refreshSession()
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error))
    } finally {
      setBusyAction('')
    }
  }

  async function handleRefreshCompletion() {
    try {
      setBusyAction('refresh_completion')
      setErrorMessage('')
      await refreshSession()
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error))
    } finally {
      setBusyAction('')
    }
  }

  async function handleOpenCompletedPdf() {
    const completion = session?.completion || {}
    const finalArtifact = completion?.finalArtifact || {}
    const packetId = normalizeText(finalArtifact.packetId || completion?.document?.packetId || completion?.document?.id || session?.packet?.id)
    const packetVersionId = normalizeText(finalArtifact.packetVersionId || completion?.version?.id || session?.version?.id)
    const documentId = normalizeText(finalArtifact.documentId)
    const targetWindow = window.open('', '_blank')
    try {
      setBusyAction('open_final_artifact')
      setCompletionDownloadError('')
      const access = await resolveSignerFinalSignedArtifactAccess({
        token,
        packetId,
        packetVersionId,
        documentId,
        download: true,
      })
      const downloadUrl = normalizeText(access?.finalArtifact?.downloadUrl)
      if (!downloadUrl) throw new Error(access?.message || 'The completed document is not ready for secure download yet.')
      if (targetWindow) {
        targetWindow.opener = null
        targetWindow.location.replace(downloadUrl)
      } else {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (error) {
      targetWindow?.close()
      setCompletionDownloadError(resolveErrorMessage(error))
    } finally {
      setBusyAction('')
    }
  }

  async function handleRetryPortalSession() {
    try {
      setLoading(true)
      setErrorMessage('')
      await refreshSession()
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingShell />

  if (errorMessage && !session) {
    const unavailableHelp = buildDocumentHelpRecovery({ surface: 'signer_portal', issue: errorMessage })
    return (
      <main className="min-h-screen bg-[#eef3f8] p-4 text-[#142132] sm:p-6">
        <div className="mx-auto max-w-4xl space-y-4 rounded-[22px] border border-[#f1d2ce] bg-white px-6 py-8 shadow-[0_18px_48px_rgba(15,32,54,0.08)]">
          <h1 className="text-lg font-bold text-[#8e1f15]">Signing Link Unavailable</h1>
          <p className="mt-2 text-sm text-[#8e1f15]">{errorMessage}</p>
          <DocumentHelpRecoveryCard model={unavailableHelp} busy={loading} compact onAction={() => void handleRetryPortalSession()} />
        </div>
      </main>
    )
  }

  const completion = session?.completion || (normalizeKey(session?.signer?.status) === 'signed'
    ? buildSigningCompletion({
        completedAt: session?.signer?.signed_at,
        document: {
          id: session?.packet?.id,
          packetId: session?.packet?.id,
          type: session?.packet?.packet_type,
          title: session?.packet?.title,
          transactionId: session?.packet?.transaction_id,
          transactionReference: session?.packet?.transaction_reference,
          propertyLabel: session?.packet?.property_label,
        },
        version: { id: session?.version?.id, number: session?.version?.version_number },
        signer: session?.signer,
      })
    : null)

  if (completion) {
    return (
      <SigningCompleteScreen
        completion={completion}
        packet={packet}
        signer={signer}
        version={version}
        refreshing={busyAction === 'refresh_completion'}
        finalArtifactBusy={busyAction === 'open_final_artifact'}
        finalArtifactError={completionDownloadError}
        onRefresh={() => void handleRefreshCompletion()}
        onOpenFinalArtifact={() => void handleOpenCompletedPdf()}
      />
    )
  }

  const signerGuidance = buildDocumentRoleGuidance({
    surface: 'signer_portal',
    role: signer?.signer_role,
    packetType: packet?.packet_type,
    signerStatus: signer?.status,
    remainingFields: progress.remainingCount,
    completedFields: progress.completedCount,
  })
  const signerJourney = buildDocumentJourneyProgress({
    surface: 'signer_portal',
    signerStatus: signer?.status,
    requiredFields: progress.requiredCount,
    completedFields: progress.completedCount,
  })
  const signerActions = buildDocumentRoleActions({
    surface: 'signer_portal',
    role: signer?.signer_role,
    remainingFields: progress.remainingCount,
    requiredFields: progress.requiredCount,
    canComplete: canCompleteSigning,
  })
  const signerResponsibility = buildDocumentResponsibility({
    surface: 'signer_portal',
    role: signer?.signer_role,
    state: signer?.status,
    signers: session?.signingOrder || [],
    currentSigner: signer,
  })
  const signerHelpRecovery = buildDocumentHelpRecovery({
    surface: 'signer_portal',
    role: signer?.signer_role,
    state: signer?.status,
    issue: errorMessage,
    hasPreview: Boolean(documentPreviewUrl || fallbackPreviewHtml),
  })
  const signerMobileAction = buildDocumentMobileAction({
    surface: 'signer_portal',
    recoveryAction: signerHelpRecovery.hasIssue && signerHelpRecovery.action
      ? { ...signerHelpRecovery.action, description: signerHelpRecovery.summary }
      : null,
    blocked: signerHelpRecovery.hasIssue,
    remainingFields: progress.remainingCount,
    requiredFields: progress.requiredCount,
    canComplete: canCompleteSigning,
    currentOwnerLabel: signerResponsibility.currentOwner?.name || signerResponsibility.currentOwner?.roleLabel,
  })
  const signerAccessibility = buildDocumentAccessibility({
    surface: 'signer_portal',
    journey: signerJourney,
    responsibility: signerResponsibility,
    helpRecovery: signerHelpRecovery,
    mobileAction: signerMobileAction,
    completedFields: progress.completedCount,
    requiredFields: progress.requiredCount,
    contentTargetId: 'signer-document-content',
    actionsTargetId: 'signer-document-actions',
  })
  const completeConfirmation = buildDocumentCommitConfirmation({
    action: 'complete_signing',
    packetType: packet?.packet_type,
    remainingFields: progress.remainingCount,
    signerRole: signer?.signer_role,
  })

  async function handleConfirmedCompletion() {
    await handleCompleteSigning(true)
    setCompleteConfirmationOpen(false)
  }

  function handleSignerRoleAction(actionId) {
    recordSignerExperience('primary_action_selected', { state: signerExperienceState, actionId })
    if (actionId === 'next_field') scrollToField(progress.nextField || fields[0])
    else if (actionId === 'review_document') window.scrollTo({ top: 0, behavior: 'smooth' })
    else if (actionId === 'complete_signing' && canCompleteSigning) void handleCompleteSigning()
  }

  function handleHelpRecoveryAction(actionId) {
    recordSignerExperience('recovery_selected', { state: signerExperienceState, actionId, category: signerHelpRecovery.category })
    if (actionId === 'next_field') scrollToField(progress.nextField || fields[0])
    else if (actionId === 'retry' || actionId === 'refresh') void handleRetryPortalSession()
    else if (actionId === 'review_document') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleMobileAction(actionId) {
    if (['next_field', 'review_document', 'complete_signing'].includes(actionId)) handleSignerRoleAction(actionId)
    else handleHelpRecoveryAction(actionId)
  }

  return (
    <main className="min-h-screen bg-[#eef3f8] pb-[calc(7rem+env(safe-area-inset-bottom))] text-[#142132] md:pb-0">
      <DocumentAccessibilityNavigation model={signerAccessibility} />
      <header className="sticky top-0 z-40 border-b border-[#d7e2ef] bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3">
          <Arch9Mark />
          <div className="min-w-0 flex-1 text-center md:flex-none">
            <h1 className="truncate text-sm font-bold text-[#142132] sm:text-base">{packet?.title || 'Document Packet'}</h1>
            <p className="text-xs text-[#607387]">Version {version?.version_number || '—'} · {signer?.signer_name || 'Signer'}</p>
            <p className="mt-1 text-xs font-semibold text-[#35546c]">{signerInstruction}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#cfe4d8] bg-[#eef9f2] px-3 py-2 text-xs font-bold text-[#276b46]">
            <ShieldCheck className="h-4 w-4" />
            {sessionBinding?.certified ? 'Certified document' : 'Secure'}
          </div>
        </div>
      </header>

      <div className="sticky top-[65px] z-30 border-b border-[#d7e2ef] bg-[#f8fbfd]/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="mb-2 flex items-center justify-between text-xs font-bold text-[#35546c]">
          <span>{progress.completedCount}/{progress.requiredCount} completed</span>
          <span>{progress.percent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#dfe9f3]">
          <div className="h-full rounded-full bg-[#12385f] transition-all" style={{ width: `${progress.percent}%` }} />
        </div>
      </div>

      <div className="mx-auto grid max-w-[1500px] gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_390px] lg:p-5">
        <div id="signer-document-content" tabIndex={-1} className="min-w-0 scroll-mt-24 focus:outline-none">
          <DocumentPreview
            documentUrl={documentPreviewUrl}
            fallbackHtml={fallbackPreviewHtml}
            fields={fields}
            activeFieldId={activeFieldId}
            onFieldClick={selectField}
          />
        </div>

        <aside id="signer-document-actions" tabIndex={-1} className="scroll-mt-24 space-y-4 focus:outline-none lg:sticky lg:top-[86px] lg:max-h-[calc(100vh-106px)] lg:overflow-y-auto">
          <DocumentJourneyProgress model={signerJourney} compact />
          <DocumentRoleGuidanceCard guidance={signerGuidance} compact />
          <DocumentRoleActionBar model={signerActions} busy={Boolean(busyAction)} compact onAction={handleSignerRoleAction} />
          <DocumentResponsibilityCard model={signerResponsibility} compact />
          <DocumentHelpRecoveryCard model={signerHelpRecovery} busy={Boolean(busyAction) || loading} compact onAction={handleHelpRecoveryAction} />
          <section className="rounded-[22px] border border-[#d7e2ef] bg-white p-4 shadow-[0_18px_48px_rgba(15,32,54,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7389a2]">Progress</p>
                <h2 className="mt-1 text-lg font-bold text-[#142132]">{progress.percent}% complete</h2>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f1f6fb] text-sm font-black text-[#12385f]">{progress.completedCount}/{progress.requiredCount}</div>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#dfe9f3]">
              <div className="h-full rounded-full bg-[#12385f] transition-all" style={{ width: `${progress.percent}%` }} />
            </div>
            <button type="button" onClick={() => scrollToField()} disabled={!progress.nextField} className="mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[12px] bg-[#12385f] text-sm font-bold text-white disabled:bg-[#a5b4c5]">
              {progress.nextField ? `Next: ${fieldLocationLabel(progress.nextField)}` : 'All required fields complete'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </section>

          <section className="rounded-[22px] border border-[#d7e2ef] bg-white p-4 shadow-[0_18px_48px_rgba(15,32,54,0.08)]">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7389a2]">Signer</p>
            <div className="mt-3 space-y-2 text-sm text-[#4f6680]">
              <p><span className="font-bold text-[#142132]">Name:</span> {signer?.signer_name || '—'}</p>
              <p><span className="font-bold text-[#142132]">Role:</span> {String(signer?.signer_role || '').replace(/_/g, ' ') || '—'}</p>
              <p><span className="font-bold text-[#142132]">Status:</span> {signer?.status || 'pending'}</p>
              <p><span className="font-bold text-[#142132]">Expires:</span> {formatDateTime(signer?.token_expires_at)}</p>
              {sessionBinding?.certified ? <p className="flex items-center gap-1.5 font-semibold text-[#276b46]"><ShieldCheck className="h-4 w-4" /> Exact delivered PDF verified</p> : null}
            </div>
          </section>

          <section className="rounded-[22px] border border-[#d7e2ef] bg-white p-4 shadow-[0_18px_48px_rgba(15,32,54,0.08)]">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7389a2]">Required Fields</p>
            <div className="mt-3 space-y-2">
              {fields.map((field) => {
                const fieldId = getFieldId(field)
                const completed = isCompleted(field)
                return (
                  <button
                    key={fieldId}
                    type="button"
                    onClick={() => completed ? scrollToField(field) : handleUseSaved(field)}
                    className={`flex w-full items-center justify-between gap-3 rounded-[14px] border px-3 py-3 text-left transition ${
                      completed ? 'border-[#cde8d6] bg-[#eef9f2]' : 'border-[#d8e3ef] bg-[#fbfdff] hover:border-[#12385f]'
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-bold text-[#142132]">{fieldLocationLabel(field)}</span>
                      <span className="mt-0.5 block text-xs text-[#607387]">{completed ? 'Completed' : 'Tap to complete'}</span>
                    </span>
                    {completed ? <Check className="h-5 w-5 text-[#2b7b4d]" /> : <PenLine className="h-5 w-5 text-[#12385f]" />}
                  </button>
                )
              })}
            </div>
          </section>

          {errorMessage ? <p className="rounded-[14px] border border-[#f1d2ce] bg-[#fff4f3] px-4 py-3 text-sm font-semibold text-[#8e1f15]">{errorMessage}</p> : null}
          {statusMessage ? <DocumentOutcomeNotice model={signerOutcomeFeedback} onDismiss={() => setStatusMessage('')} /> : null}

          <button
            type="button"
            onClick={() => void handleCompleteSigning()}
            disabled={!canCompleteSigning || Boolean(busyAction)}
            className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[15px] bg-[#12385f] px-4 text-base font-bold text-white shadow-[0_16px_34px_rgba(18,56,95,0.24)] disabled:bg-[#9daec1]"
          >
            <LockKeyhole className="h-5 w-5" />
            {busyAction === 'complete_signing' ? 'Completing...' : 'Complete Signing'}
          </button>
        </aside>
      </div>

      <DocumentMobileActionDock model={signerMobileAction} busy={Boolean(busyAction) || loading} onAction={handleMobileAction} />

      <DocumentCommitConfirmation
        model={completeConfirmation}
        open={completeConfirmationOpen}
        busy={busyAction === 'complete_signing'}
        onCancel={() => setCompleteConfirmationOpen(false)}
        onConfirm={() => void handleConfirmedCompletion()}
      />

      {captureField ? (
        <SigningCanvas
          mode={currentCaptureType}
          signerName={signer?.signer_name || ''}
          saving={Boolean(busyAction)}
          onCancel={() => setCaptureField(null)}
          onSave={handleSaveAndApply}
        />
      ) : null}
    </main>
  )
}
