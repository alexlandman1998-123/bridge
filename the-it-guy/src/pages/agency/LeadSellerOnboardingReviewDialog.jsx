// Form state and workflow handlers remain in the lead workspace controller.
import Modal from "../../components/ui/Modal"
import Button from "../../components/ui/Button"
import { readSellerOnboardingReview, SELLER_ONBOARDING_REVIEW_STATUS } from "../../core/documents/sellerOnboardingReview"
import SellerOnboardingAgentReviewPanel from "../../components/onboarding/SellerOnboardingAgentReviewPanel"
import { applyListingSellerOnboardingSaveSnapshot } from "../../services/listings/listingSellerCanonicalUpdateModel.js"
import { SELLER_DOCUMENT_ACTIONS } from "../../core/documents/sellerDocumentWorkflow"
import { SELLER_PORTAL_SIGNING_ENABLED } from "../../core/documents/sellerPortalSigningPolicy"
import { Check } from "lucide-react"

export default function LeadSellerOnboardingReviewDialog({ continueSellerOnboardingReview, getLeadSellerOnboardingFormData, patchSelectedLeadRecord, refreshSellerOnboardingReviewRecord, saveSellerLeadOnboardingReview, selectedLead, selectedLeadLinkedListing, selectedLeadOnboardingReviewChecklist, selectedLeadReviewFormData, selectedSellerDisclosureComplete, sellerOnboardingCorrectionReason, sellerOnboardingDocumentRoutes, sellerOnboardingReviewError, sellerOnboardingReviewListing, sellerOnboardingReviewModalOpen, sellerOnboardingReviewNeedsRefresh, sellerOnboardingReviewNotice, sellerOnboardingReviewSaving, sellerSigningPackBaselineRef, setSelectedLeadHydratedListing, setSellerOnboardingCorrectionReason, setSellerOnboardingDocumentRoutes, setSellerOnboardingReviewListing, setSellerOnboardingReviewModalOpen }) {
  return (
<Modal
        open={sellerOnboardingReviewModalOpen}
        onClose={() => setSellerOnboardingReviewModalOpen(false)}
        title="Review submitted seller onboarding"
        subtitle="Check the submitted facts and choose how each outstanding seller document will be signed. The seller will not repeat onboarding."
        className="max-w-4xl"
        footer={(
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setSellerOnboardingReviewModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={sellerOnboardingReviewSaving || sellerOnboardingReviewNeedsRefresh || (sellerOnboardingReviewModalOpen && (!selectedLeadOnboardingReviewChecklist?.ready || readSellerOnboardingReview(selectedLeadReviewFormData?.sellerOnboardingReview || selectedLeadReviewFormData?.seller_onboarding_review).status === SELLER_ONBOARDING_REVIEW_STATUS.correctionRequested))} onClick={() => void continueSellerOnboardingReview()}>
              {sellerOnboardingReviewSaving ? 'Saving review…' : 'Approve and continue'}
            </Button>
          </div>
        )}
      >
        <div className="space-y-5">
          {sellerOnboardingReviewError ? <div role="alert" className="rounded-[14px] border border-[#f3c6c1] bg-[#fff6f5] p-3 text-sm text-[#a33c32]">
            {sellerOnboardingReviewError}
            {sellerOnboardingReviewNeedsRefresh ? <Button type="button" variant="secondary" className="mt-3" disabled={sellerOnboardingReviewSaving} onClick={() => void refreshSellerOnboardingReviewRecord()}>Load latest seller details and keep signing choices</Button> : null}
          </div> : null}
          {sellerOnboardingReviewNotice ? <p role="status" className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-3 text-sm text-[#47637d]">{sellerOnboardingReviewNotice}</p> : null}
          <div className="rounded-[16px] border border-[#dce6f2] bg-[#f8fbff] p-4 text-sm leading-6 text-[#47637d]">
            Commission terms are confirmed in the signing pack before anything is sent or prepared. Opening that screen does not create, publish, or activate a market listing.
            {(getLeadSellerOnboardingFormData(selectedLead).sellerReviewedDocumentVersions || getLeadSellerOnboardingFormData(selectedLead).seller_reviewed_document_versions)?.documents?.length ? ' Preparing another pack creates a new reviewed version and keeps the previous copies in the audit history.' : ''}
          </div>
          {sellerOnboardingReviewModalOpen ? <SellerOnboardingAgentReviewPanel formData={selectedLeadReviewFormData} checklist={selectedLeadOnboardingReviewChecklist}
            listing={sellerOnboardingReviewListing || selectedLeadLinkedListing}
            disabled={sellerOnboardingReviewSaving || sellerOnboardingReviewNeedsRefresh || readSellerOnboardingReview(selectedLeadReviewFormData?.sellerOnboardingReview).status === SELLER_ONBOARDING_REVIEW_STATUS.correctionRequested}
            onDifferenceSaved={receipt => {
              const baseline = sellerOnboardingReviewListing || selectedLeadLinkedListing?.sourceListing || selectedLeadLinkedListing
              const saved = applyListingSellerOnboardingSaveSnapshot(baseline, receipt)
              setSellerOnboardingReviewListing(saved)
              setSelectedLeadHydratedListing(saved)
              sellerSigningPackBaselineRef.current = saved
              patchSelectedLeadRecord({ sellerOnboarding: saved.sellerOnboarding }, selectedLead.leadId)
            }}
            onReload={refreshSellerOnboardingReviewRecord}
            onRequestCorrection={reason => saveSellerLeadOnboardingReview(SELLER_ONBOARDING_REVIEW_STATUS.correctionRequested, reason)} /> : null}
          {sellerOnboardingReviewModalOpen ? (() => {
            const form = selectedLeadReviewFormData || {}
            const review = readSellerOnboardingReview(form.sellerOnboardingReview || form.seller_onboarding_review)
            return <section className="rounded-[16px] border border-[#dce6f2] bg-white p-4 text-sm">
              <p className="font-semibold text-[#243d56]">Agent review decision</p>
              {review.status === SELLER_ONBOARDING_REVIEW_STATUS.correctionRequested ? <p className="mt-1 text-[#76551a]">Correction requested: {review.reason}. Wait for resubmission before approving.</p> : <>
                <p className="mt-1 text-[#607387]">Need a correction? The seller can update the existing onboarding link.</p>
                <textarea value={sellerOnboardingCorrectionReason} onChange={(event) => setSellerOnboardingCorrectionReason(event.target.value)} rows={2} placeholder="For example, confirm the beneficial owner’s ID and residential address." className="mt-3 w-full rounded-xl border border-[#dce6f2] bg-white px-3 py-2" />
                <Button type="button" size="sm" variant="secondary" className="mt-2" disabled={sellerOnboardingReviewSaving || sellerOnboardingReviewNeedsRefresh || sellerOnboardingCorrectionReason.trim().length < 5} onClick={() => void saveSellerLeadOnboardingReview(SELLER_ONBOARDING_REVIEW_STATUS.correctionRequested)}>Request correction</Button>
              </>}
            </section>
          })() : null}
          <fieldset className="grid gap-3 rounded-[16px] border border-[#dce6f2] bg-white p-4">
            <legend className="px-1 text-sm font-semibold text-[#243d56]">Choose how each document will be signed</legend>
            {[
              ...(!selectedSellerDisclosureComplete ? [['signed_disclosure_form', 'Mandatory Disclosure / Defects Form']] : []),
              ['signed_fica_declaration', 'Seller FICA declaration'],
              ['signed_mandate', 'Seller mandate'],
            ].filter(([key]) => key in sellerOnboardingDocumentRoutes).map(([documentKey, label]) => (
              <div key={documentKey} className="grid gap-3 rounded-xl border border-[#dce6f2] p-3 text-sm font-semibold text-[#243d56]">
                <span>{label}</span>
                <div role="group" aria-label={`${label} document action`} className="grid gap-2 sm:grid-cols-3">
                  {SELLER_DOCUMENT_ACTIONS.map(([route, title, description]) => {
                    const selected = sellerOnboardingDocumentRoutes[documentKey] === route
                    return (
                      <button
                        key={route}
                        type="button"
                        aria-pressed={selected}
                        disabled={sellerOnboardingReviewSaving || (route === 'digital_pack' && !SELLER_PORTAL_SIGNING_ENABLED)}
                        onClick={() => setSellerOnboardingDocumentRoutes((previous) => ({ ...previous, [documentKey]: route }))}
                        className={`rounded-xl border px-3 py-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#13784f] disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-[#13784f] bg-[#eaf7ef] text-[#126946]' : 'border-[#cfdceb] bg-white text-[#243d56] hover:border-[#b9cde3]'}`}
                      >
                        <span className="flex items-center gap-2">{selected ? <Check className="h-4 w-4" aria-hidden="true" /> : null}{title}</span>
                        <span className="mt-1 block text-xs font-normal">{description}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {!SELLER_PORTAL_SIGNING_ENABLED ? <p className="text-xs text-[#6a8098]">Digital signing is awaiting portal release configuration.</p> : null}
            {selectedSellerDisclosureComplete ? <p className="rounded-xl bg-[#eaf7ee] px-3 py-2 text-sm text-[#176842]">The defects disclosure already has complete signed evidence. It will not be sent again.</p> : null}
          </fieldset>
        </div>
      </Modal>
  )
}
