import { useCallback, useRef, useState } from 'react'
import { SellerOnboarding } from '../../pages/SellerOnboarding'
import Modal from '../ui/Modal'
import Field from '../ui/Field'
import Button from '../ui/Button'
import SellerCaptureDocuments from '../onboarding/SellerCaptureDocuments'
import LeadAgentTeamSelect from './LeadAgentTeamSelect'
import { LEAD_CAPTURE_SOURCE_OPTIONS } from './leadCaptureSources'
import { createSellerLeadCaptureReceipt, persistSellerLeadCapture, recordSellerCaptureProgress, SELLER_CAPTURE_PROGRESS } from '../../services/sellerLeadCaptureService'
import { syncPrivateListingRequirements, uploadPrivateListingDocument } from '../../services/privateListingService'

const EMPTY_CAPTURE = Object.freeze({ sellerOnboarding: { status: 'not_started', formData: {
  ownershipDeclarationPending: true, ownershipType: '', ownerEntityType: '', ownerStructureType: '',
  sellerFirstName: '', sellerSurname: '', email: '', phone: '',
  propertyCategory: '', propertyType: '', propertyStructureType: '',
} } })

export default function SellerLeadCreateDialog({ organisationId, actor, assignedAgent, agents = [], lockPrimaryAgent = false, source, onSourceChange, sourceOptions, priority, metadataControls, onClose, onCreated }) {
  const [receipt] = useState(createSellerLeadCaptureReceipt)
  const [primaryAgent, setPrimaryAgent] = useState(assignedAgent)
  const [additionalAgents, setAdditionalAgents] = useState([])
  const [saving, setSaving] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preparingDocuments, setPreparingDocuments] = useState(false)
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const captureSaveRef = useRef(null)
  const [documentListing, setDocumentListing] = useState(null)
  const [progressOpen, setProgressOpen] = useState(false)
  const busy = saving || uploading || preparingDocuments || closing
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const progressSaved = useRef('')
  const sources = sourceOptions?.length ? sourceOptions : LEAD_CAPTURE_SOURCE_OPTIONS
  const handleSaveStateChange = useCallback((active, { submitting = false } = {}) => {
    setSaving(active)
    setFinishing(submitting)
  }, [])
  const persist = useCallback(async candidate => {
    const saved = await persistSellerLeadCapture({ organisationId, actor, assignedAgent: primaryAgent, additionalAgents, source, priority, candidate, receipt })
    if (progressSaved.current !== progress) {
      try {
        await recordSellerCaptureProgress({ organisationId, receipt, progress, actor })
        progressSaved.current = progress
      } catch (reason) {
        throw Object.assign(new Error('Your details are saved, but progress could not be recorded. Try again.'), { committed: true, listing: saved, cause: reason })
      }
    }
    return saved
  }, [organisationId, actor, primaryAgent, additionalAgents, source, priority, receipt, progress])
  const metadataKey = JSON.stringify([source, priority, primaryAgent?.userId || primaryAgent?.id, additionalAgents.map(agent => agent.userId || agent.id).sort(), progress])
  async function closeCapture() {
    if (closingRef.current) return
    closingRef.current = true
    setClosing(true)
    try {
      if (!captureSaveRef.current || await captureSaveRef.current()) onClose?.()
    } finally {
      closingRef.current = false
      setClosing(false)
    }
  }
  return <Modal open title="Create Seller Lead" className="max-w-4xl" onClose={uploading || preparingDocuments || closing || finishing ? undefined : closeCapture}>
    <fieldset disabled={uploading || preparingDocuments || closing || finishing} className="space-y-4">
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      <SellerOnboarding embedded captureDraft={EMPTY_CAPTURE} completionModeOverride="agent_assisted" captureLayout="tabs"
        captureAutosave captureMetadataKey={metadataKey} captureSaveRef={captureSaveRef}
        captureLeadMetadata={<>
        <fieldset className="col-span-2 min-w-0 sm:col-span-1">
          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">Source
            <Field as="select" value={source || ''}
              onChange={event => onSourceChange?.(event.target.value)} disabled={!onSourceChange}
              className="min-h-[52px] rounded-[16px] text-base">
              {!source ? <option value="">Choose source</option> : !sources.includes(source) ? <option value={source}>{source}</option> : null}
              {sources.map(option => <option key={option}>{option}</option>)}
            </Field>
          </label>
        </fieldset>
        <fieldset className="col-span-2 min-w-0">
          <LeadAgentTeamSelect agents={agents} primaryAgent={primaryAgent} additionalAgents={additionalAgents} lockPrimary={lockPrimaryAgent || saving || Boolean(receipt.lead)}
            onPrimaryChange={setPrimaryAgent} onAdditionalChange={setAdditionalAgents} />
          {metadataControls}
        </fieldset>
        <details open={progressOpen} onToggle={event => setProgressOpen(event.currentTarget.open)} className="col-span-2 rounded-[14px] border border-[#d7e2ed] px-3 py-3">
          <summary className="cursor-pointer text-sm font-medium text-[#2a4057]">Seller progress (optional)</summary>
          {progressOpen ? <label className="mt-3 grid gap-2 text-sm font-medium">Where are you with this seller?
            <Field as="select" value={progress} onChange={event => setProgress(event.target.value)}>
              <option value="">Choose if you know</option>
              {SELLER_CAPTURE_PROGRESS.map(value => <option key={value}>{value}</option>)}
            </Field>
          </label> : null}
        </details>
        </>}
        onSaveStateChange={handleSaveStateChange} onCapturePersist={persist}
        onCaptureFinished={async () => {
          try {
            if (progressSaved.current !== progress) {
              await recordSellerCaptureProgress({ organisationId, receipt: receipt, progress, actor })
              progressSaved.current = progress
            }
            onCreated(receipt, progress)
          } catch (reason) { setError(reason.message || 'Your details are saved, but progress could not be recorded. Try again.') }
        }}
        captureReview={({ listing, saveDraft, hasUnsavedChanges }) => <>
          {!documentListing || hasUnsavedChanges ? <div className="flex flex-col items-start gap-4 rounded-[18px] border border-[#dce6f2] bg-[#fafbfc] p-5">
            <p className="text-sm text-[#60748b]">Add any documents you have. You can also save the lead and add them later.</p>
            <Button type="button" variant="secondary" disabled={busy} onClick={async () => {
              setPreparingDocuments(true)
              setError('')
              try {
                if (!await saveDraft()) return
                const saved = receipt.listing
                const prepared = await syncPrivateListingRequirements(saved, { emitActivity: false, formData: saved.sellerOnboarding.formData })
                setDocumentListing(prepared?.listing || saved)
              } catch (reason) { setError(reason.message || 'Documents could not be prepared. Try again.') }
              finally { setPreparingDocuments(false) }
            }}>{preparingDocuments ? 'Preparing documents…' : 'Save details to add documents'}</Button>
          </div> : <SellerCaptureDocuments compact listing={listing} initialListing={documentListing} token={listing.sellerOnboarding?.token}
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
            }} />}
        </>} />
    </fieldset>
  </Modal>
}
