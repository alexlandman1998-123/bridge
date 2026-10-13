import { useCallback, useRef, useState } from 'react'
import { SellerOnboarding } from '../../pages/SellerOnboarding'
import Modal from '../ui/Modal'
import Field from '../ui/Field'
import SellerCaptureDocuments from '../onboarding/SellerCaptureDocuments'
import { createSellerLeadCaptureReceipt, persistSellerLeadCapture, recordSellerCaptureProgress, SELLER_CAPTURE_PROGRESS } from '../../services/sellerLeadCaptureService'
import { syncPrivateListingRequirements, uploadPrivateListingDocument } from '../../services/privateListingService'

const EMPTY_CAPTURE = Object.freeze({ sellerOnboarding: { status: 'not_started', formData: {
  ownershipDeclarationPending: true, ownershipType: '', ownerEntityType: '', ownerStructureType: '',
  sellerFirstName: '', sellerSurname: '', email: '', phone: '',
  propertyCategory: '', propertyType: '', propertyStructureType: '',
} } })

export default function SellerLeadCreateDialog({ organisationId, actor, assignedAgent, source, priority, metadataControls, onClose, onCreated }) {
  const [receipt] = useState(createSellerLeadCaptureReceipt)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const busy = saving || uploading
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const progressSaved = useRef('')
  const persist = useCallback(candidate => persistSellerLeadCapture({ organisationId, actor, assignedAgent, source, priority, candidate, receipt: receipt }), [organisationId, actor, assignedAgent, source, priority])
  return <Modal open title="Create Seller Lead" subtitle="Add what you know. All seller and property questions are optional. Saved answers appear in the seller’s link." className="max-w-6xl" onClose={busy ? undefined : onClose}>
    <fieldset disabled={busy} className="space-y-4">
      <fieldset disabled={Boolean(receipt.lead)}>{metadataControls}</fieldset>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <SellerOnboarding embedded captureDraft={EMPTY_CAPTURE} completionModeOverride="agent_assisted"
        onSaveStateChange={setSaving} onCapturePersist={persist}
        onCaptureFinished={async () => {
          try {
            if (progressSaved.current !== progress) {
              await recordSellerCaptureProgress({ organisationId, receipt: receipt, progress, actor })
              progressSaved.current = progress
            }
            onCreated(receipt, progress)
          } catch (reason) { setError(reason.message || 'Your details are saved, but progress could not be recorded. Try again.') }
        }}
        captureReview={({ listing, saveDraft }) => <>
          <label className="grid gap-2 text-sm font-semibold">Where are you with this seller?
            <Field as="select" value={progress} onChange={event => setProgress(event.target.value)}>
              <option value="">Choose if you know</option>
              {SELLER_CAPTURE_PROGRESS.map(value => <option key={value}>{value}</option>)}
            </Field>
          </label>
          <p className="text-sm text-[#60748b]">This records your progress. Documents still need review before the next stage can be confirmed.</p>
          {progress === 'We already have a signed mandate' ? <p className="text-sm">Add the signed mandate below. Saving it does not mark it reviewed or activate a listing.</p> : null}
          <SellerCaptureDocuments listing={listing} token={listing.sellerOnboarding?.token}
            onUpload={async (file, row) => {
              setUploading(true)
              try {
                if (!await saveDraft()) throw new Error('Save your latest answers before uploading this document.')
                const saved = receipt.listing
                await syncPrivateListingRequirements(saved, { emitActivity: false, formData: saved.sellerOnboarding.formData })
                await uploadPrivateListingDocument(saved.id, file, {
                  requirementId: row.id, requirementKey: row.requirementKey || row.requirement_key,
                  documentType: row.requirementKey || row.requirement_key,
                  documentCategory: row.requirementGroup || row.requirement_group || 'seller',
                  visibility: 'seller_visible', status: 'uploaded', deferMandateSigning: true,
                  existingSignedEvidence: ['signed_mandate', 'signed_fica_declaration', 'signed_disclosure_form'].includes(row.requirementKey || row.requirement_key),
                })
              } finally { setUploading(false) }
            }} />
        </>}
        onDraftSaved={async listing => {
          try { await syncPrivateListingRequirements(listing, { emitActivity: false, formData: listing.sellerOnboarding.formData }) }
          catch { /* Saving succeeds independently; upload preflight retries the checklist. */ }
        }} />
    </fieldset>
  </Modal>
}
