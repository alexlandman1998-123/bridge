import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchClientOtpSigningByToken, submitClientOtpSignature } from '../lib/api'

function drawCanvasBackground(canvas) {
  const context = canvas.getContext('2d')
  if (!context) return
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
}

function setupSignatureCanvas(canvas) {
  const parent = canvas.parentElement
  const width = Math.max((parent?.clientWidth || 0) - 2, 320)
  const height = 190
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.floor(width * ratio)
  canvas.height = Math.floor(height * ratio)
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.strokeStyle = '#133a63'
  context.lineWidth = 2.2
  drawCanvasBackground(canvas)
}

function DocumentPreviewCard({ payload }) {
  const propertyLabel = [payload?.property?.developmentName, payload?.property?.unitLabel]
    .filter(Boolean)
    .join(' • ') || 'Property to be confirmed'
  const purchaserName = payload?.buyer?.name || 'Client'
  const transactionReference = payload?.transaction?.transactionReference || payload?.transaction?.id || 'Draft OTP'
  const uploadedAt = payload?.otpDocument?.uploadedAt
    ? new Date(payload.otpDocument.uploadedAt).toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    : 'Ready for review'

  return (
    <div className="rounded-[18px] border border-[#dbe5ef] bg-[#f8fbff] p-3 sm:p-5">
      <div className="mx-auto max-w-[760px] rounded-[18px] border border-[#d8e2ed] bg-white shadow-[0_18px_45px_rgba(20,33,50,0.08)]">
        <div className="border-b border-[#e4ecf4] px-5 py-5 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-[#7890a8]">Offer to Purchase</p>
              <h3 className="mt-2 text-[1.35rem] font-semibold tracking-[-0.04em] text-[#142132] sm:text-[1.65rem]">
                Signature copy
              </h3>
            </div>
            <div className="rounded-full border border-[#dbe5ef] bg-[#fbfdff] px-3 py-1.5 text-xs font-semibold text-[#35546c]">
              {uploadedAt}
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-5 py-5 sm:grid-cols-2 sm:px-8">
          <div className="rounded-[14px] border border-[#e2eaf3] bg-[#fbfdff] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Property</p>
            <p className="mt-2 text-sm font-semibold leading-5 text-[#20384f]">{propertyLabel}</p>
          </div>
          <div className="rounded-[14px] border border-[#e2eaf3] bg-[#fbfdff] p-4">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Purchaser</p>
            <p className="mt-2 text-sm font-semibold leading-5 text-[#20384f]">{purchaserName}</p>
          </div>
        </div>

        <div className="px-5 pb-5 sm:px-8 sm:pb-8">
          <div className="space-y-3 rounded-[14px] border border-[#e2eaf3] p-4 text-sm leading-6 text-[#41566d]">
            <p>
              This document records the purchaser&apos;s offer and the terms to proceed with the transaction.
              Review the full OTP before signing below.
            </p>
            <div className="grid gap-2 border-t border-[#edf2f7] pt-3 sm:grid-cols-3">
              <div>
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#8da0b4]">Reference</p>
                <p className="mt-1 truncate font-semibold text-[#20384f]">{transactionReference}</p>
              </div>
              <div>
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#8da0b4]">Document</p>
                <p className="mt-1 font-semibold text-[#20384f]">{payload?.otpDocument?.name || 'OTP'}</p>
              </div>
              <div>
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-[#8da0b4]">Status</p>
                <p className="mt-1 font-semibold text-[#20384f]">Awaiting signature</p>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[14px] border border-dashed border-[#b8c9dc] bg-[#fbfdff] p-4">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-[#7b8ca2]">Signing area</p>
            <div className="mt-8 flex items-end justify-between gap-6">
              <div className="h-px flex-1 bg-[#9fb2c6]" />
              <div className="h-px flex-1 bg-[#9fb2c6]" />
            </div>
            <div className="mt-2 flex justify-between gap-6 text-xs font-semibold text-[#607387]">
              <span>Purchaser signature</span>
              <span>Date</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ClientOtpSigning() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [payload, setPayload] = useState(null)
  const [signatureName, setSignatureName] = useState('')
  const [confirmationAccepted, setConfirmationAccepted] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const previousPointRef = useRef({ x: 0, y: 0 })

  const loadSigningPayload = useCallback(async () => {
    if (!token) {
      setError('Missing client token.')
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError('')
      const data = await fetchClientOtpSigningByToken(token)
      setPayload(data)
      setSignatureName(data?.buyer?.name || '')
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load OTP signing right now.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadSigningPayload()
  }, [loadSigningPayload])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setupSignatureCanvas(canvas)
    const handleResize = () => setupSignatureCanvas(canvas)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [loading])

  function getCanvasCoordinates(event) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const bounds = canvas.getBoundingClientRect()
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    }
  }

  function handlePointerDown(event) {
    const canvas = canvasRef.current
    if (!canvas) return
    event.preventDefault()
    canvas.setPointerCapture?.(event.pointerId)
    drawingRef.current = true
    previousPointRef.current = getCanvasCoordinates(event)
  }

  function handlePointerMove(event) {
    const canvas = canvasRef.current
    if (!canvas || !drawingRef.current) return
    event.preventDefault()
    const context = canvas.getContext('2d')
    if (!context) return
    const point = getCanvasCoordinates(event)
    context.beginPath()
    context.moveTo(previousPointRef.current.x, previousPointRef.current.y)
    context.lineTo(point.x, point.y)
    context.stroke()
    previousPointRef.current = point
    if (!hasSignature) {
      setHasSignature(true)
    }
  }

  function handlePointerUp(event) {
    const canvas = canvasRef.current
    if (!canvas) return
    event.preventDefault()
    drawingRef.current = false
    canvas.releasePointerCapture?.(event.pointerId)
  }

  function handleClearSignature() {
    const canvas = canvasRef.current
    if (!canvas) return
    drawCanvasBackground(canvas)
    setHasSignature(false)
    setSuccessMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return

    if (!hasSignature) {
      setError('Please provide your signature before submitting.')
      return
    }

    if (!confirmationAccepted) {
      setError('Please confirm that you have reviewed the OTP before submitting.')
      return
    }

    try {
      setSaving(true)
      setError('')
      setSuccessMessage('')
      const signatureDataUrl = canvas.toDataURL('image/png')
      await submitClientOtpSignature({
        token,
        otpDocumentId: payload?.otpDocument?.id || null,
        signatureDataUrl,
        confirmationAccepted,
        signatureName,
      })
      setSuccessMessage('Signature submitted successfully. Your transaction team has been updated.')
    } catch (submitError) {
      setError(submitError?.message || 'Unable to submit your signature right now.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] px-4 py-8">
        <div className="mx-auto max-w-5xl rounded-[20px] border border-[#dbe5ef] bg-white p-6 text-sm text-[#5f738a]">
          Loading OTP signing...
        </div>
      </main>
    )
  }

  if (error && !payload) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] px-4 py-8">
        <div className="mx-auto max-w-5xl rounded-[20px] border border-[#f0d7d0] bg-[#fff7f5] p-6 text-sm text-[#9a3e29]">
          {error}
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="rounded-[22px] border border-[#dbe5ef] bg-white p-6 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6d8197]">Arch9 Client Portal</p>
          <h1 className="mt-2 text-[1.6rem] font-semibold tracking-[-0.03em] text-[#142132]">OTP Signing</h1>
          <p className="mt-2 text-sm text-[#62778f]">
            Review your Offer to Purchase and sign to proceed with the transaction.
          </p>
          <div className="mt-4 grid gap-3 text-sm text-[#20384f] sm:grid-cols-2">
            <div className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.1em] text-[#7b8ca2]">Property</p>
              <p className="mt-1 font-semibold">
                {[payload?.property?.developmentName, payload?.property?.unitLabel].filter(Boolean).join(' • ') || 'Not captured'}
              </p>
            </div>
            <div className="rounded-[14px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
              <p className="text-xs uppercase tracking-[0.1em] text-[#7b8ca2]">Purchaser</p>
              <p className="mt-1 font-semibold">{payload?.buyer?.name || 'Client'}</p>
            </div>
          </div>
        </header>

        <section className="rounded-[22px] border border-[#dbe5ef] bg-white p-4 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#6d8197]">Document Preview</h2>
            <a
              href={payload?.otpDocument?.previewUrl || '#'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
            >
              Open full document
            </a>
          </div>
          <DocumentPreviewCard payload={payload} />
        </section>

        <section className="rounded-[22px] border border-[#dbe5ef] bg-white p-6 shadow-[0_16px_34px_rgba(15,23,42,0.05)]">
          <h3 className="text-[1.08rem] font-semibold tracking-[-0.02em] text-[#142132]">Signature Confirmation</h3>
          <p className="mt-1 text-sm text-[#62778f]">
            Sign inside the box below to confirm your acceptance of this OTP.
          </p>

          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-[#21384d]">Signature Name</span>
              <input
                type="text"
                value={signatureName}
                onChange={(event) => setSignatureName(event.target.value)}
                className="w-full rounded-[12px] border border-[#d7e3ef] bg-white px-3 py-2.5 text-sm text-[#142132] focus:border-[#9db5cf] focus:outline-none focus:ring-2 focus:ring-[#d6e5f4]"
                placeholder="Enter your full name"
              />
            </label>

            <div className="rounded-[14px] border border-[#d7e3ef] bg-[#fbfdff] p-3">
              <canvas
                ref={canvasRef}
                className="w-full touch-none rounded-[10px] border border-[#dbe5ef] bg-white"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleClearSignature}
                  className="inline-flex items-center rounded-full border border-[#dbe5ef] bg-white px-3 py-1.5 text-xs font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
                >
                  Clear signature
                </button>
              </div>
            </div>

            <label className="flex items-start gap-2 rounded-[12px] border border-[#e2ebf4] bg-[#fbfdff] px-3 py-2.5 text-sm text-[#32495f]">
              <input
                type="checkbox"
                checked={confirmationAccepted}
                onChange={(event) => setConfirmationAccepted(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[#b6c9de] text-[#2f567a] focus:ring-[#b9d2ea]"
              />
              <span>I confirm that I have reviewed this OTP and I agree to proceed.</span>
            </label>

            {error ? (
              <p className="rounded-[12px] border border-[#f0d7d0] bg-[#fff7f5] px-3 py-2 text-sm text-[#9a3e29]">
                {error}
              </p>
            ) : null}
            {successMessage ? (
              <p className="rounded-[12px] border border-[#cfe6d7] bg-[#eef9f2] px-3 py-2 text-sm text-[#256c47]">
                {successMessage}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex min-h-[42px] items-center rounded-full bg-[#35546c] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#2d475d] disabled:cursor-not-allowed disabled:bg-[#9aa9b8]"
              >
                {saving ? 'Submitting...' : 'Submit Signature'}
              </button>
              <Link
                to={`/client/${token}/documents`}
                className="inline-flex min-h-[42px] items-center rounded-full border border-[#dbe5ef] bg-white px-5 py-2 text-sm font-semibold text-[#35546c] transition hover:border-[#c6d7e7] hover:bg-[#f8fbff]"
              >
                Back to Documents
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  )
}

export default ClientOtpSigning
