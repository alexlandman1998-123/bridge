import { useEffect, useRef, useState } from 'react'
import { requestRentalLandlordOnboarding } from '../../../../services/rentals/rentalLandlordOnboardingService.js'
import { uploadRentalApplicationFile } from '../../../../services/rentals/rentalApplicationFileUpload.js'
import RentalLandlordOnboardingDocuments from './RentalLandlordOnboardingDocuments.jsx'
export default function RentalLandlordOnboardingPanel({ leadId, revision, discoveryDirty = false }) {
  const key = `${leadId}:${revision}`
  const [loaded, setLoaded] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [access, setAccess] = useState(null)
  const [changes, setChanges] = useState('')
  const guard = useRef(false)
  const onboarding = loaded?.key === key ? loaded.onboarding : null
  useEffect(() => {
    let cancelled = false
    requestRentalLandlordOnboarding(leadId)
      .then((result) => {
        if (!cancelled) setLoaded({ key, onboarding: result.onboarding })
      })
      .catch((cause) => {
        if (!cancelled) setError(cause.message)
      })
    return () => {
      cancelled = true
    }
  }, [leadId, key])
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
  async function mutate(action, patch) {
    const result = await requestRentalLandlordOnboarding(leadId, 'POST', {
      action,
      version: onboarding.version,
      patch,
    })
    if (result.onboarding) setLoaded({ key, onboarding: result.onboarding })
    else {
      setLoaded({
        key,
        onboarding: {
          ...onboarding,
          version: result.version,
          status: result.status,
          requirements: null,
        },
      })
      throw new Error(
        'Saved, but the checklist could not refresh. Reopen onboarding before continuing.',
      )
    }
    return result
  }
  const upload = (file, row) =>
    run(async () => {
      const result = await uploadRentalApplicationFile(
        file,
        {
          requirementId: row.id,
          generation: row.generation,
          subjectId: row.subjectId,
          purpose: row.purpose,
        },
        onboarding.version,
        (body) => requestRentalLandlordOnboarding(leadId, 'POST', body),
      )
      if (!result.onboarding) {
        setLoaded({
          key,
          onboarding: {
            ...onboarding,
            version: result.version,
            requirements: null,
          },
        })
        throw new Error(
          'File saved. Reopen onboarding to refresh the checklist.',
        )
      }
      setLoaded({ key, onboarding: result.onboarding })
      setNotice(`${file.name} uploaded.`)
    })
  return (
    <section className="space-y-4 rounded-xl border p-4 lg:col-span-2">
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}
      {!onboarding ? (
        <p>Loading landlord onboarding…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              className="rounded border px-3 py-2 text-sm"
              onClick={() =>
                void run(async () => {
                  const result = await requestRentalLandlordOnboarding(
                    leadId,
                    'POST',
                    { action: 'create_access' },
                  )
                  setAccess({
                    ...result,
                    leadId,
                    url: `${window.location.origin}/rental-landlord-onboarding/${result.token}`,
                  })
                })
              }
            >
              Create secure onboarding link
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded border px-3 py-2 text-sm"
              onClick={() =>
                void run(async () => {
                  const result = await requestRentalLandlordOnboarding(leadId)
                  setLoaded({ key, onboarding: result.onboarding })
                })
              }
            >
              Refresh onboarding
            </button>
          </div>
          {access?.leadId === leadId ? (
            <div className="rounded border p-3 text-sm">
              <p>
                Link expires{' '}
                {new Date(access.expiresAt).toLocaleDateString('en-ZA')}.
              </p>
              <input
                aria-label="Secure landlord onboarding link"
                readOnly
                value={access.url}
                className="my-2 w-full rounded border p-2"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await requestRentalLandlordOnboarding(leadId, 'POST', {
                      action: 'revoke_access',
                      accessId: access.accessId,
                    })
                    setAccess(null)
                    setNotice('Onboarding link revoked.')
                  })
                }
                className="rounded border px-3 py-2"
              >
                Revoke this link
              </button>
            </div>
          ) : null}
          {(onboarding.accessLinks || [])
            .filter(
              (link) =>
                !link.revokedAt &&
                Date.parse(link.expiresAt) > Date.now() &&
                link.id !== access?.accessId,
            )
            .map((link) => (
              <div key={link.id} className="flex items-center gap-3 text-sm">
                <span>
                  Existing link expires{' '}
                  {new Date(link.expiresAt).toLocaleDateString('en-ZA')}.
                </span>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded border px-3 py-2"
                  onClick={() =>
                    void run(async () => {
                      await requestRentalLandlordOnboarding(leadId, 'POST', {
                        action: 'revoke_access',
                        accessId: link.id,
                      })
                      const result =
                        await requestRentalLandlordOnboarding(leadId)
                      setLoaded({ key, onboarding: result.onboarding })
                      setNotice('Onboarding link revoked.')
                    })
                  }
                >
                  Revoke existing link
                </button>
              </div>
            ))}
          {onboarding.status === 'submitted' ? (
            <div className="rounded border p-3">
              <p>
                Landlord submitted these details. Request corrections before
                changing discovery or files.
              </p>
              <textarea
                aria-label="Landlord correction request"
                value={changes}
                onChange={(event) => setChanges(event.target.value)}
                className="mt-2 w-full rounded border p-2"
              />
              <button
                type="button"
                disabled={busy || !changes.trim()}
                onClick={() =>
                  void run(async () => {
                    await mutate('request_changes', { message: changes })
                    setNotice(
                      'Corrections requested. The landlord can use the same valid link.',
                    )
                  })
                }
                className="mt-2 rounded border px-3 py-2"
              >
                Request corrections
              </button>
            </div>
          ) : null}
          <RentalLandlordOnboardingDocuments
            onboarding={onboarding}
            disabled={busy}
            preview={discoveryDirty}
            onUpload={upload}
            onOpen={(doc) =>
              run(async () => {
                const result = await requestRentalLandlordOnboarding(
                  leadId,
                  'POST',
                  {
                    action: 'document_url',
                    version: onboarding.version,
                    documentId: doc.id,
                  },
                )
                window.open(result.url, '_blank', 'noopener,noreferrer')
              })
            }
            onReview={(doc, review) =>
              run(async () => {
                await mutate('review_document', {
                  documentId: doc.id,
                  ...review,
                })
                setNotice('Evidence review recorded.')
              })
            }
          />
        </>
      )}
    </section>
  )
}
