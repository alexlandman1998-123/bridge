import { useState } from 'react'
import { DOCUMENT_UPLOAD_ACCEPT } from '../../../../lib/documentUploadPolicy.js'
import { rentalLandlordRequirementTitle, rentalLandlordRequirementReason } from '../../../../services/rentals/rentalLandlordOnboardingModel.js'
export default function RentalLandlordOnboardingDocuments({
  onboarding,
  disabled = false,
  onUpload,
  onOpen,
  onReview,
  preview = false,
}) {
  const [notes, setNotes] = useState({})
  const [signed, setSigned] = useState({})
  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Landlord onboarding documents</h2>
      <p className="text-sm text-slate-600">
        Upload evidence for the named landlord, person or property. Uploading
        records receipt; the agent reviews acceptance. Additional collection
        policies remain subject to confirmation.
      </p>
      {preview ? (
        <p role="status" className="text-sm text-amber-800">
          Save the discovery answers to refresh these requirements before
          uploading.
        </p>
      ) : null}
      {!onboarding.requirements?.length ? (
        <p>
          Save the landlord type and properties to prepare the checklist.
          Exceptional landlord types need your agent’s review.
        </p>
      ) : null}
      {(onboarding.requirements || [])
        .filter((row) => row.active)
        .map((row) => {
          const doc = preview
            ? null
            : onboarding.documents?.find((item) => item.id === row.documentId)
          const title = rentalLandlordRequirementTitle(row, onboarding.data)
          return (
            <article key={row.id} className="rounded-xl border p-4">
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{rentalLandlordRequirementReason(row)}</p>
              <p className="mt-1 text-sm text-slate-600">
                {doc ? `${doc.file_name} · ${row.state}` : 'Not uploaded'}
              </p>
              {doc?.review_note ? (
                <p className="mt-2 text-sm">{doc.review_note}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-3">
                {doc && onOpen ? (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void onOpen(doc)}
                    className="rounded border px-3 py-2 text-sm"
                  >
                    Open {doc.file_name}
                  </button>
                ) : null}
                {onUpload ? (
                  <label className="cursor-pointer rounded border px-3 py-2 text-sm">
                    {doc ? 'Replace file' : 'Upload file'}
                    <input
                      aria-label={`Upload ${title}`}
                      type="file"
                      accept={DOCUMENT_UPLOAD_ACCEPT}
                      disabled={
                        disabled || preview || onboarding.status !== 'draft'
                      }
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0]
                        event.target.value = ''
                        if (file) void onUpload(file, row)
                      }}
                    />
                  </label>
                ) : null}
              </div>
              {doc && onReview ? (
                <div className="mt-3 space-y-2">
                  <label className="grid gap-1 text-sm">
                    Review note
                    <textarea
                      aria-label={`${title} review note`}
                      disabled={disabled}
                      value={notes[doc.id] || ''}
                      onChange={(event) =>
                        setNotes((current) => ({
                          ...current,
                          [doc.id]: event.target.value,
                        }))
                      }
                      className="rounded border p-2"
                    />
                  </label>
                  {row.purpose === 'property_disclosure' ? (
                    <label className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={Boolean(signed[doc.id])}
                        onChange={(event) =>
                          setSigned((current) => ({
                            ...current,
                            [doc.id]: event.target.checked,
                          }))
                        }
                      />
                      I checked the prescribed disclosure is completed and
                      signed.
                    </label>
                  ) : null}
                  <div className="flex gap-2">
                    {['accepted', 'rejected'].map((status) => (
                      <button
                        type="button"
                        key={status}
                        disabled={
                          disabled ||
                          !notes[doc.id]?.trim() ||
                          (status === 'accepted' &&
                            row.purpose === 'property_disclosure' &&
                            !signed[doc.id])
                        }
                        onClick={() =>
                          void onReview(doc, {
                            status,
                            note: notes[doc.id],
                            completedSigned: Boolean(signed[doc.id]),
                          })
                        }
                        className="rounded border px-3 py-2 text-sm"
                      >
                        {status === 'accepted'
                          ? 'Accept evidence'
                          : 'Reject evidence'}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
    </section>
  )
}
