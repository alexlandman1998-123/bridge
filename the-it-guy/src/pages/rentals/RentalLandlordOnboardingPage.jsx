import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import RentalLandlordDiscoveryForm from '../../modules/rentals/shared/applications/RentalLandlordDiscoveryForm.jsx'
import RentalLandlordOnboardingDocuments from '../../modules/rentals/shared/applications/RentalLandlordOnboardingDocuments.jsx'
import { uploadRentalApplicationFile } from '../../services/rentals/rentalApplicationFileUpload.js'
import { rentalLandlordSubmissionErrors } from '../../services/rentals/rentalLandlordOnboardingModel.js'
export default function RentalLandlordOnboardingPage() {
  const { token = '' } = useParams()
  return <LandlordOnboardingJourney key={token} token={token} />
}
function LandlordOnboardingJourney({ token }) {
  const [onboarding, setOnboarding] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [declaration, setDeclaration] = useState(false)
  const guard = useRef(false)
  async function request(method = 'GET', body) {
    const response = await fetch('/api/public/rental-landlord-onboarding', {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.error || 'Unable to load landlord onboarding.')
    return result
  }
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    request()
      .then((result) => {
        if (!cancelled) {
          setOnboarding(result.onboarding)
          setDirty(false)
          setError('')
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return
    const warn = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  async function run(action) {
    if (guard.current) return
    guard.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (cause) {
      setError(cause.message)
    } finally {
      guard.current = false
      setBusy(false)
    }
  }
  function apply(result, current = onboarding) {
    const next = result.onboarding || {
      ...current,
      version: result.version,
      status: result.status,
      requirements: null,
    }
    setOnboarding(next)
    return next
  }
  async function persist() {
    const result = await request('PATCH', {
      version: onboarding.version,
      patch: onboarding.data,
    })
    const next = apply(result)
    setDirty(false)
    if (!result.onboarding)
      throw new Error(
        'Your answers were saved. Reopen this link to refresh the checklist before uploading.',
      )
    return next
  }
  const upload = (file, row) =>
    run(async () => {
      const current = dirty ? await persist() : onboarding
      const saved = current.requirements?.find(
        (item) => item.id === row.id && item.active,
      )
      if (!saved)
        throw new Error(
          'The saved requirement changed. Save and reopen the checklist.',
        )
      const result = await uploadRentalApplicationFile(
        file,
        {
          requirementId: saved.id,
          generation: saved.generation,
          subjectId: saved.subjectId,
          purpose: saved.purpose,
        },
        current.version,
        (body) => request('POST', body),
      )
      apply(result, current)
      if (!result.onboarding)
        throw new Error(
          'File saved. Reopen this link to refresh the checklist.',
        )
      setNotice(`${file.name} uploaded.`)
    })
  if (loading)
    return (
      <main className="mx-auto max-w-xl p-6">Loading landlord onboarding…</main>
    )
  if (!onboarding)
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-semibold">Onboarding unavailable</h1>
        <p role="alert" className="mt-3">
          {error}
        </p>
        <p className="mt-3">
          Ask your agent for a new link if this one expired.
        </p>
      </main>
    )
  const readOnly = onboarding.status === 'submitted'
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <header className="rounded-xl bg-[#102d4a] p-5 text-white">
        <h1 className="text-2xl font-semibold">Landlord onboarding</h1>
        <p className="mt-2 text-sm">
          Confirm who owns or represents the landlord and supply evidence for
          each property.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-emerald-700">
          {notice}
        </p>
      ) : null}
      {onboarding.requestedChanges ? (
        <p className="rounded border p-3">
          Your agent requested: {onboarding.requestedChanges}
        </p>
      ) : null}
      {readOnly ? (
        <p role="status" className="rounded border p-4">
          Onboarding submitted. Your agent will review the details and evidence.
          Contact them if a correction is needed.
        </p>
      ) : null}
      <RentalLandlordDiscoveryForm
        data={onboarding.data}
        disabled={busy || readOnly}
        onChange={(data) => {
          setOnboarding((current) => ({ ...current, data }))
          setDirty(true)
          setDeclaration(false)
        }}
      />
      {!readOnly ? (
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await persist()
              setNotice(
                'Landlord details saved. You can return using the same link.',
              )
            })
          }
          className="rounded border px-4 py-2"
        >
          Save landlord details
        </button>
      ) : null}
      <RentalLandlordOnboardingDocuments
        onboarding={onboarding}
        disabled={busy || readOnly}
        preview={dirty}
        onUpload={readOnly ? undefined : upload}
        onOpen={(doc) =>
          run(async () => {
            const result = await request('POST', {
              action: 'document_url',
              version: onboarding.version,
              documentId: doc.id,
            })
            window.open(result.url, '_blank', 'noopener,noreferrer')
          })
        }
      />
      {!readOnly ? (
        <section className="rounded border p-4">
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={declaration}
              disabled={busy}
              onChange={(event) => setDeclaration(event.target.checked)}
            />
            I confirm these details are accurate and I have authority to provide
            this landlord and property information.
          </label>
          <p className="mt-2 text-xs text-slate-600">
            Send your details for review. Your agent will resolve outstanding
            evidence and policy checks. The completed and signed prescribed
            disclosure must be accepted before the mandate.
          </p>
          <button
            type="button"
            disabled={
              busy ||
              dirty ||
              !declaration ||
              rentalLandlordSubmissionErrors(onboarding.data).length > 0
            }
            onClick={() =>
              void run(async () => {
                const result = await request('POST', {
                  action: 'submit',
                  version: onboarding.version,
                  declarationAccepted: declaration,
                })
                apply(result)
              })
            }
            className="mt-3 rounded border px-4 py-2"
          >
            Send onboarding for review
          </button>
        </section>
      ) : null}
    </main>
  )
}
