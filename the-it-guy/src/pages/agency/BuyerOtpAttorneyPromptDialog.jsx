// Form state and workflow handlers remain in the lead workspace controller.
import Modal from "../../components/ui/Modal"
import { Building2 } from "lucide-react"
import Field from "../../components/ui/Field"
import Button from "../../components/ui/Button"

export default function BuyerOtpAttorneyPromptDialog({ buildKingstonsListingTermsDraft, buyerOtpAttorneyPromptDraft, buyerOtpAttorneyPromptError, buyerOtpAttorneyPromptOpen, closeBuyerOtpAttorneyPrompt, continueBuyerOtpUploadAfterAttorneyPrompt, isManualKingstonsTransferAttorneyDraft, normalizeText, selectedKingstonsListingTerms, sellerPreferredAttorneys, sellerPreferredAttorneysError, sellerPreferredAttorneysLoading, setBuyerOtpAttorneyPromptDraft, setBuyerOtpAttorneyPromptError, updateBuyerOtpAttorneyPromptDraftField }) {
  return (
<Modal
	        open={buyerOtpAttorneyPromptOpen}
	        onClose={closeBuyerOtpAttorneyPrompt}
	        title="Upload Signed OTP"
	        subtitle="Choose the transferring attorney before attaching the signed OTP."
	        className="max-w-2xl"
	      >
	        {buyerOtpAttorneyPromptError ? (
	          <p className="mb-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">
	            {buyerOtpAttorneyPromptError}
	          </p>
	        ) : null}
	        <div className="grid gap-4">
	          <section className="rounded-[18px] border border-[#e2ebf4] bg-white p-4">
	            <div className="flex items-start justify-between gap-3">
	              <div className="flex items-start gap-3">
	                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#edf8f2] text-[#13784f]">
	                  <Building2 className="h-4 w-4" />
	                </span>
	                <div>
	                  <h4 className="text-base font-semibold text-[#102033]">Transferring attorney</h4>
	                  <p className="mt-1 text-sm leading-5 text-[#60758b]">
	                    This is saved on the buyer OTP stage before the signed document is uploaded.
	                  </p>
	                </div>
	              </div>
	              {sellerPreferredAttorneysLoading ? (
	                <span className="rounded-full border border-[#dce7f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#60758b]">Loading...</span>
	              ) : null}
	            </div>
	            {sellerPreferredAttorneysError ? (
	              <p className="mt-3 rounded-[12px] border border-[#f5dfbb] bg-[#fff9ee] px-3 py-2 text-sm text-[#8a5c10]">
	                {sellerPreferredAttorneysError}
	              </p>
	            ) : null}
	            <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
	              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
	                Source
	                <Field
	                  as="select"
	                  value={buyerOtpAttorneyPromptDraft?.transferAttorneyMode || 'agency_recommended'}
	                  onChange={(event) => updateBuyerOtpAttorneyPromptDraftField('transferAttorneyMode', event.target.value)}
	                >
	                  <option value="agency_recommended">Agency panel</option>
	                  <option value="buyer_selected">Manual firm</option>
	                </Field>
	              </label>
	              {!isManualKingstonsTransferAttorneyDraft(buyerOtpAttorneyPromptDraft || {}) ? (
	                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
	                  Attorney
	                  <Field
	                    as="select"
	                    value={buyerOtpAttorneyPromptDraft?.transferAttorneyId || ''}
	                    onChange={(event) => {
	                      const attorneyId = event.target.value
	                      const attorney = sellerPreferredAttorneys.find((row) => normalizeText(row.id) === normalizeText(attorneyId) || normalizeText(row.preferredPartnerId) === normalizeText(attorneyId))
	                      setBuyerOtpAttorneyPromptDraft((previous) => ({
	                        ...buildKingstonsListingTermsDraft(selectedKingstonsListingTerms),
	                        ...(previous || {}),
	                        transferAttorneyId: attorneyId,
	                        transferAttorneyCompany: attorney?.companyName || previous?.transferAttorneyCompany || '',
	                        transferAttorneyContact: attorney?.contactPerson || previous?.transferAttorneyContact || '',
	                        transferAttorneyEmail: attorney?.email || previous?.transferAttorneyEmail || '',
	                        transferAttorneyPhone: attorney?.phone || previous?.transferAttorneyPhone || '',
	                      }))
	                      setBuyerOtpAttorneyPromptError('')
	                    }}
	                  >
	                    <option value="">Choose transfer attorney</option>
	                    {sellerPreferredAttorneys.map((attorney) => (
	                      <option key={attorney.id} value={attorney.id}>{attorney.companyName}</option>
	                    ))}
	                  </Field>
	                </label>
	              ) : (
	                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
	                  Firm name
	                  <Field
	                    placeholder="Buyer appointed firm"
	                    value={buyerOtpAttorneyPromptDraft?.transferAttorneyCompany || ''}
	                    onChange={(event) => updateBuyerOtpAttorneyPromptDraftField('transferAttorneyCompany', event.target.value)}
	                  />
	                </label>
	              )}
	            </div>
	            {isManualKingstonsTransferAttorneyDraft(buyerOtpAttorneyPromptDraft || {}) ? (
	              <div className="mt-3 grid gap-3 md:grid-cols-3">
	                <Field
	                  placeholder="Contact person"
	                  value={buyerOtpAttorneyPromptDraft?.transferAttorneyContact || ''}
	                  onChange={(event) => updateBuyerOtpAttorneyPromptDraftField('transferAttorneyContact', event.target.value)}
	                />
	                <Field
	                  type="email"
	                  inputMode="email"
	                  placeholder="Email"
	                  value={buyerOtpAttorneyPromptDraft?.transferAttorneyEmail || ''}
	                  onChange={(event) => updateBuyerOtpAttorneyPromptDraftField('transferAttorneyEmail', event.target.value)}
	                />
	                <Field
	                  type="tel"
	                  inputMode="tel"
	                  placeholder="Phone"
	                  value={buyerOtpAttorneyPromptDraft?.transferAttorneyPhone || ''}
	                  onChange={(event) => updateBuyerOtpAttorneyPromptDraftField('transferAttorneyPhone', event.target.value)}
	                />
	              </div>
	            ) : null}
	          </section>

	          <section className="rounded-[18px] border border-[#dfe9f4] bg-[#fbfdff] p-4">
	            <div className="flex flex-wrap items-center justify-between gap-4">
	              <div>
	                <h4 className="text-base font-semibold text-[#102033]">Send instruction</h4>
	                <p className="mt-1 text-sm leading-5 text-[#60758b]">
	                  Turn this on when the signed OTP should release the transfer instruction.
	                </p>
	              </div>
	              <button
	                type="button"
	                role="switch"
	                aria-checked={buyerOtpAttorneyPromptDraft?.sendInstruction === true}
	                className={`relative h-8 w-14 rounded-full border transition ${buyerOtpAttorneyPromptDraft?.sendInstruction === true ? 'border-[#13784f] bg-[#13784f]' : 'border-[#cfdbe8] bg-white'}`}
	                onClick={() => updateBuyerOtpAttorneyPromptDraftField('sendInstruction', buyerOtpAttorneyPromptDraft?.sendInstruction !== true)}
	              >
	                <span
	                  className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-[0_4px_10px_rgba(15,34,54,0.20)] transition ${buyerOtpAttorneyPromptDraft?.sendInstruction === true ? 'left-7' : 'left-1'}`}
	                />
	                <span className="sr-only">Send instruction</span>
	              </button>
	            </div>
	          </section>
	        </div>
	        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#edf3f8] pt-4 sm:flex-row sm:justify-end">
	          <Button type="button" variant="ghost" onClick={closeBuyerOtpAttorneyPrompt}>
	            Cancel
	          </Button>
	          <Button type="button" onClick={continueBuyerOtpUploadAfterAttorneyPrompt} disabled={sellerPreferredAttorneysLoading}>
	            Continue to Upload
	          </Button>
	        </div>
	      </Modal>
  )
}
