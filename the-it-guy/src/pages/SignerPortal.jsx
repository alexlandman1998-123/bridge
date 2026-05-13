import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  applySignerField,
  completeSignerSigning,
  resolveExternalSignerSession,
  saveSignerAsset,
} from '../lib/externalSigningApi'
import { renderPacketPreviewHtml } from '../core/documents/packetWorkflow'

function normalizeText(value) {
  return String(value || '').trim()
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
  if (code === 'SIGNER_SESSION_REQUEST_FAILED' || code === 'SIGNER_SESSION_FAILED') {
    return 'This signing link could not be opened. Please request a new signing link from your agent.'
  }
  if (code === 'SIGNER_ACTION_REQUEST_FAILED' || code === 'SIGNER_ACTION_FAILED') {
    return 'The signing action could not be completed. Please try again or request a new signing link.'
  }
  if (code === 'REMAINING_REQUIRED_FIELDS') return 'Complete all required fields before submitting signing.'
  if (code === 'FIELD_SCOPE_DENIED') return 'This field cannot be completed from your signing session.'
  const message = normalizeText(error?.message)
  if (message.toLowerCase().includes('edge function') || message.toLowerCase().includes('non-2xx')) {
    return 'This signing link could not be opened. Please request a new signing link from your agent.'
  }
  return message || 'Unable to process signing right now.'
}

function fieldTypeLabel(fieldType = '') {
  const normalized = normalizeText(fieldType).toLowerCase()
  if (!normalized) return 'Field'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function SignatureCanvas({ title, onSave, onClear, saving = false }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    context.lineJoin = 'round'
    context.lineCap = 'round'
    context.lineWidth = 2
    context.strokeStyle = '#10253f'
  }, [])

  function pointFromEvent(event) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const touch = event.touches?.[0]
    const clientX = touch ? touch.clientX : event.clientX
    const clientY = touch ? touch.clientY : event.clientY
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  function startDraw(event) {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    drawingRef.current = true
    const point = pointFromEvent(event)
    context.beginPath()
    context.moveTo(point.x, point.y)
    event.preventDefault()
  }

  function draw(event) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    const point = pointFromEvent(event)
    context.lineTo(point.x, point.y)
    context.stroke()
    event.preventDefault()
  }

  function endDraw() {
    drawingRef.current = false
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (typeof onClear === 'function') onClear()
  }

  async function saveCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    await onSave(dataUrl)
  }

  return (
    <article className="rounded-[12px] border border-[#dce6f2] bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7389a2]">{title}</p>
      <canvas
        ref={canvasRef}
        width={320}
        height={120}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
        className="mt-2 w-full rounded-[10px] border border-[#d6e1ed] bg-[#fcfdff]"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={clearCanvas}
          className="rounded-[9px] border border-[#d1dbe7] px-3 py-1.5 text-xs font-medium text-[#38556f]"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => void saveCanvas()}
          disabled={saving}
          className="rounded-[9px] bg-[#12385f] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </article>
  )
}

export default function SignerPortal() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [session, setSession] = useState(null)
  const [assets, setAssets] = useState({
    initial: null,
    signature: null,
  })

  async function refreshSession() {
    const result = await resolveExternalSignerSession({ token })
    setSession(result?.session || null)
  }

  useEffect(() => {
    let active = true

    async function load() {
      try {
        setLoading(true)
        setErrorMessage('')
        const result = await resolveExternalSignerSession({ token })
        if (!active) return
        setSession(result?.session || null)
      } catch (error) {
        if (!active) return
        setErrorMessage(resolveErrorMessage(error))
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [token])

  const signer = session?.signer || {}
  const packet = session?.packet || {}
  const version = session?.version || {}
  const fields = useMemo(() => (Array.isArray(session?.fields) ? session.fields : []), [session?.fields])
  const documentPreviewUrl = normalizeText(session?.documentPreviewUrl)
  const fallbackPreviewHtml = useMemo(() => {
    const previewData = session?.previewData && typeof session.previewData === 'object' ? session.previewData : null
    if (!previewData) return ''
    const sectionManifest = Array.isArray(previewData.sectionManifest) ? previewData.sectionManifest : []
    const placeholders = previewData.placeholders && typeof previewData.placeholders === 'object' ? previewData.placeholders : {}
    if (!sectionManifest.length || !Object.keys(placeholders).length) return ''
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
    const completed = required.filter((field) => normalizeText(field?.status).toLowerCase() === 'completed')
    const remaining = required.filter((field) => normalizeText(field?.status).toLowerCase() !== 'completed')
    const nextField = remaining[0] || null
    const percent = required.length ? Math.round((completed.length / required.length) * 100) : 0
    return {
      requiredCount: required.length,
      completedCount: completed.length,
      remainingCount: remaining.length,
      nextField,
      percent,
      initialsRemaining: remaining.filter((field) => normalizeText(field.field_type) === 'initial').length,
      signaturesRemaining: remaining.filter((field) => normalizeText(field.field_type) === 'signature').length,
    }
  }, [fields])

  const canCompleteSigning = progress.remainingCount === 0 && progress.requiredCount > 0

  async function handleSaveAsset(assetType, dataUrl) {
    try {
      setBusyAction(`save_${assetType}`)
      setErrorMessage('')
      setStatusMessage('')
      const result = await saveSignerAsset({
        token,
        assetType,
        dataUrl,
      })
      setAssets((current) => ({
        ...current,
        [assetType]: result?.asset || null,
      }))
      setStatusMessage(`${fieldTypeLabel(assetType)} saved.`)
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error))
    } finally {
      setBusyAction('')
    }
  }

  async function handleApplyField(field) {
    const fieldId = normalizeText(field?.id)
    const fieldType = normalizeText(field?.field_type).toLowerCase()
    if (!fieldId || !['initial', 'signature'].includes(fieldType)) return

    try {
      setBusyAction(`apply_${fieldId}`)
      setErrorMessage('')
      setStatusMessage('')
      await applySignerField({
        token,
        fieldId,
        assetType: fieldType,
        assetPath: assets[fieldType]?.path || '',
        completedByEmail: signer?.signer_email || '',
      })
      await refreshSession()
      setStatusMessage(`${fieldTypeLabel(fieldType)} applied to page ${field?.page_number}.`)
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error))
    } finally {
      setBusyAction('')
    }
  }

  async function handleCompleteSigning() {
    try {
      setBusyAction('complete_signing')
      setErrorMessage('')
      setStatusMessage('')
      await completeSignerSigning({ token })
      await refreshSession()
      setStatusMessage('Signing completed successfully.')
    } catch (error) {
      setErrorMessage(resolveErrorMessage(error))
    } finally {
      setBusyAction('')
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f3f6fa] p-6 text-[#142132]">
        <div className="mx-auto max-w-6xl rounded-[18px] border border-[#d7e2ef] bg-white px-6 py-8 shadow-[0_18px_48px_rgba(15,32,54,0.08)]">
          <p className="text-sm text-[#5b718a]">Loading signing session…</p>
        </div>
      </main>
    )
  }

  if (errorMessage && !session) {
    return (
      <main className="min-h-screen bg-[#f3f6fa] p-6 text-[#142132]">
        <div className="mx-auto max-w-6xl rounded-[18px] border border-[#f1d2ce] bg-white px-6 py-8 shadow-[0_18px_48px_rgba(15,32,54,0.08)]">
          <h1 className="text-lg font-semibold text-[#8e1f15]">Signing Link Unavailable</h1>
          <p className="mt-2 text-sm text-[#8e1f15]">{errorMessage}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f3f6fa] p-6 text-[#142132]">
      <div className="mx-auto grid max-w-7xl gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-[18px] border border-[#d7e2ef] bg-white px-5 py-5 shadow-[0_18px_48px_rgba(15,32,54,0.08)]">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7389a2]">Bridge Secure Signing</p>
          <h1 className="mt-2 text-lg font-semibold text-[#142132]">{packet?.title || 'Document Packet'}</h1>
          <p className="mt-1 text-xs text-[#607387]">Version {version?.version_number || '—'}</p>

          <div className="mt-4 space-y-2 rounded-[12px] border border-[#dce6f2] bg-[#fbfdff] px-3 py-3 text-xs">
            <p><span className="font-semibold text-[#142132]">Signer:</span> {signer?.signer_name || '—'}</p>
            <p><span className="font-semibold text-[#142132]">Role:</span> {String(signer?.signer_role || '').replace(/_/g, ' ') || '—'}</p>
            <p><span className="font-semibold text-[#142132]">Status:</span> {signer?.status || 'pending'}</p>
            <p><span className="font-semibold text-[#142132]">Expires:</span> {formatDateTime(signer?.token_expires_at)}</p>
          </div>

          <div className="mt-3 rounded-[12px] border border-[#dce6f2] bg-white px-3 py-3 text-xs">
            <p className="font-semibold text-[#142132]">Progress</p>
            <p className="mt-1 text-[#607387]">Required fields: {progress.requiredCount}</p>
            <p className="mt-1 text-[#607387]">Completed: {progress.completedCount}</p>
            <p className="mt-1 text-[#607387]">Remaining: {progress.remainingCount}</p>
            <p className="mt-1 text-[#607387]">Completion: {progress.percent}%</p>
            <p className="mt-1 text-[#607387]">Next required: {progress.nextField ? `${fieldTypeLabel(progress.nextField.field_type)} • page ${progress.nextField.page_number}` : 'All complete'}</p>
          </div>

          <div className="mt-3 space-y-3">
            <SignatureCanvas
              title="Initials"
              saving={busyAction === 'save_initial'}
              onClear={() => setAssets((current) => ({ ...current, initial: null }))}
              onSave={(dataUrl) => handleSaveAsset('initial', dataUrl)}
            />
            <SignatureCanvas
              title="Signature"
              saving={busyAction === 'save_signature'}
              onClear={() => setAssets((current) => ({ ...current, signature: null }))}
              onSave={(dataUrl) => handleSaveAsset('signature', dataUrl)}
            />
          </div>

          <div className="mt-3 rounded-[12px] border border-[#dce6f2] bg-white px-3 py-3 text-xs">
            <p className="font-semibold text-[#142132]">Your Signing Fields</p>
            <div className="mt-2 space-y-2">
              {fields.map((field) => {
                const fieldId = normalizeText(field?.id)
                const fieldType = normalizeText(field?.field_type).toLowerCase()
                const canApply = ['initial', 'signature'].includes(fieldType) && normalizeText(field?.status).toLowerCase() !== 'completed'
                return (
                  <article key={fieldId} className="rounded-[10px] border border-[#e1eaf4] bg-[#fbfdff] px-2.5 py-2">
                    <p className="font-semibold text-[#142132]">{fieldTypeLabel(fieldType)} • page {field?.page_number}</p>
                    <p className="mt-0.5 text-[#607387]">Status: {field?.status || 'pending'}</p>
                    {canApply ? (
                      <button
                        type="button"
                        onClick={() => void handleApplyField(field)}
                        disabled={Boolean(busyAction)}
                        className="mt-2 rounded-[8px] border border-[#c9d7e5] bg-white px-2.5 py-1 text-[0.7rem] font-medium text-[#23425e] disabled:opacity-50"
                      >
                        {busyAction === `apply_${fieldId}` ? 'Applying…' : `Apply ${fieldTypeLabel(fieldType)}`}
                      </button>
                    ) : null}
                  </article>
                )
              })}
              {!fields.length ? <p className="text-[#7a8fa7]">No assigned fields found for this signer.</p> : null}
            </div>
          </div>

          {errorMessage ? (
            <p className="mt-3 rounded-[10px] border border-[#f1d2ce] bg-[#fff4f3] px-3 py-2 text-xs text-[#8e1f15]">{errorMessage}</p>
          ) : null}
          {statusMessage ? (
            <p className="mt-3 rounded-[10px] border border-[#d4ebdd] bg-[#edf9f2] px-3 py-2 text-xs text-[#1d7347]">{statusMessage}</p>
          ) : null}

          <button
            type="button"
            onClick={() => void handleCompleteSigning()}
            disabled={!canCompleteSigning || Boolean(busyAction)}
            className="mt-3 w-full rounded-[10px] bg-[#12385f] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busyAction === 'complete_signing' ? 'Completing…' : 'Complete Signing'}
          </button>
        </section>

        <section className="rounded-[18px] border border-[#d7e2ef] bg-white p-4 shadow-[0_18px_48px_rgba(15,32,54,0.08)]">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#142132]">Document Preview</h2>
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-[#7b8ca2]">Read Only</span>
          </div>
          <div className="h-[76vh] overflow-hidden rounded-[12px] border border-[#dce6f2] bg-[#f7fbff]">
            {documentPreviewUrl ? (
              <iframe title="signer-document-preview" src={documentPreviewUrl} className="h-full w-full border-0 bg-white" />
            ) : fallbackPreviewHtml ? (
              <iframe title="signer-document-preview" srcDoc={fallbackPreviewHtml} className="h-full w-full border-0 bg-white" />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-sm text-[#607387]">
                Preview is not available yet for this packet version.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
