// Form state and workflow handlers remain in the lead workspace controller.
import Modal from "../../components/ui/Modal"
import { Tag, Building2 } from "lucide-react"
import Field from "../../components/ui/Field"
import Button from "../../components/ui/Button"

export default function LeadListingTermsDialog({ KINGSTONS_COMMISSION_TYPE_OPTIONS, buildKingstonsListingTermsDraft, closeKingstonsListingTermsModal, handleSaveKingstonsListingTerms, isManualKingstonsTransferAttorneyDraft, kingstonsListingTermsDraft, kingstonsListingTermsError, kingstonsListingTermsModalOpen, kingstonsListingTermsSaving, normalizeKey, normalizeText, selectedKingstonsListingTerms, selectedKingstonsTermsContextIsBuyerOtp, sellerPreferredAttorneys, sellerPreferredAttorneysError, sellerPreferredAttorneysLoading, setKingstonsListingTermsDraft, setKingstonsListingTermsError, updateKingstonsListingTermsDraftField }) {
  return (
<Modal
	        open={kingstonsListingTermsModalOpen}
	        onClose={closeKingstonsListingTermsModal}
	        title={selectedKingstonsTermsContextIsBuyerOtp ? 'Select buyer OTP terms' : 'Confirm listing terms'}
	        subtitle={selectedKingstonsTermsContextIsBuyerOtp
	          ? 'Agent-only commission and transfer attorney selection for this buyer OTP. Nothing is sent to the client from this step.'
	          : 'Legacy Kingstons listing terms capture.'}
	        className="max-w-3xl"
	      >
	        {kingstonsListingTermsError ? (
	          <p className="mb-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">
	            {kingstonsListingTermsError}
	          </p>
	        ) : null}
	        <div className="grid gap-4">
	          <section className="rounded-[18px] border border-[#e2ebf4] bg-[#fbfdff] p-4">
	            <div className="flex items-start gap-3">
	              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#fff4dc] text-[#8a5c10]">
	                <Tag className="h-4 w-4" />
	              </span>
	              <div>
	                <h4 className="text-base font-semibold text-[#102033]">Commission</h4>
	                <p className="mt-1 text-sm leading-5 text-[#60758b]">
	                  {selectedKingstonsTermsContextIsBuyerOtp
	                    ? 'Store the agreed OTP commission for the agent workflow.'
	                    : 'Store the agreed agency commission.'}
	                </p>
	              </div>
	            </div>
	            <div className="mt-4 grid gap-3 md:grid-cols-[180px_1fr]">
	              <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
	                Type
	                <Field
	                  as="select"
	                  value={kingstonsListingTermsDraft?.commissionType || 'percentage'}
	                  onChange={(event) => updateKingstonsListingTermsDraftField('commissionType', event.target.value)}
	                >
	                  {KINGSTONS_COMMISSION_TYPE_OPTIONS.map((option) => (
	                    <option key={option.value} value={option.value}>{option.label}</option>
	                  ))}
	                </Field>
	              </label>
	              {normalizeKey(kingstonsListingTermsDraft?.commissionType) === 'fixed' ? (
	                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
	                  Amount
	                  <Field
	                    type="number"
	                    min="0"
	                    step="100"
	                    placeholder="Example: 85000"
	                    value={kingstonsListingTermsDraft?.commissionAmount || ''}
	                    onChange={(event) => updateKingstonsListingTermsDraftField('commissionAmount', event.target.value)}
	                  />
	                </label>
	              ) : (
	                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
	                  Percentage
	                  <Field
	                    type="number"
	                    min="0"
	                    step="0.1"
	                    placeholder="Example: 5"
	                    value={kingstonsListingTermsDraft?.commissionPercentage || ''}
	                    onChange={(event) => updateKingstonsListingTermsDraftField('commissionPercentage', event.target.value)}
	                  />
	                </label>
	              )}
	            </div>
	            <label className="mt-3 inline-flex min-h-11 items-center gap-3 rounded-[14px] border border-[#dfe9f4] bg-white px-4 text-sm font-semibold text-[#2a4057]">
	              <input
	                type="checkbox"
	                checked={kingstonsListingTermsDraft?.commissionVatIncluded !== false}
	                onChange={(event) => updateKingstonsListingTermsDraftField('commissionVatIncluded', event.target.checked)}
	                className="h-4 w-4 rounded border-[#cbd8e6] text-[#0b63f6]"
	              />
	              <span>{kingstonsListingTermsDraft?.commissionVatIncluded !== false ? 'Commission includes VAT' : 'Commission excludes VAT'}</span>
	            </label>
	            <label className="mt-3 grid gap-2 text-sm font-medium text-[#2a4057]">
	              Notes <span className="font-normal text-[#7a8da3]">(optional)</span>
	              <Field
	                as="textarea"
	                rows={2}
	                placeholder="Add VAT, split, or mandate notes if needed..."
	                value={kingstonsListingTermsDraft?.commissionNotes || ''}
	                onChange={(event) => updateKingstonsListingTermsDraftField('commissionNotes', event.target.value)}
	              />
	            </label>
	          </section>

	          <section className="rounded-[18px] border border-[#e2ebf4] bg-white p-4">
	            <div className="flex items-start justify-between gap-3">
	              <div className="flex items-start gap-3">
	                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#edf8f2] text-[#13784f]">
	                  <Building2 className="h-4 w-4" />
	                </span>
	                <div>
	                  <h4 className="text-base font-semibold text-[#102033]">Transfer attorney nomination</h4>
	                  <p className="mt-1 text-sm leading-5 text-[#60758b]">
	                    {selectedKingstonsTermsContextIsBuyerOtp
	                      ? 'Select the transfer attorney for the buyer OTP stage. This stays internal to the agent workflow.'
	                      : 'Legacy transfer attorney capture for older seller records.'}
	                  </p>
	                </div>
	              </div>
	              {sellerPreferredAttorneysLoading ? (
	                <span className="rounded-full border border-[#dce7f2] bg-[#f8fbff] px-3 py-1 text-xs font-semibold text-[#60758b]">Loading attorneys...</span>
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
	                  value={kingstonsListingTermsDraft?.transferAttorneyMode || 'agency_recommended'}
	                  onChange={(event) => updateKingstonsListingTermsDraftField('transferAttorneyMode', event.target.value)}
	                >
	                  <option value="agency_recommended">Agency panel</option>
	                  <option value={selectedKingstonsTermsContextIsBuyerOtp ? 'buyer_selected' : 'seller_selected'}>Manual firm</option>
	                </Field>
	              </label>
	              {!isManualKingstonsTransferAttorneyDraft(kingstonsListingTermsDraft || {}) ? (
	                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
	                  Attorney
	                  <Field
	                    as="select"
	                    value={kingstonsListingTermsDraft?.transferAttorneyId || ''}
	                    onChange={(event) => {
	                      const attorneyId = event.target.value
	                      const attorney = sellerPreferredAttorneys.find((row) => normalizeText(row.id) === normalizeText(attorneyId) || normalizeText(row.preferredPartnerId) === normalizeText(attorneyId))
	                      setKingstonsListingTermsDraft((previous) => ({
	                        ...buildKingstonsListingTermsDraft(selectedKingstonsListingTerms),
	                        ...(previous || {}),
	                        transferAttorneyId: attorneyId,
	                        transferAttorneyCompany: attorney?.companyName || previous?.transferAttorneyCompany || '',
	                        transferAttorneyContact: attorney?.contactPerson || previous?.transferAttorneyContact || '',
	                        transferAttorneyEmail: attorney?.email || previous?.transferAttorneyEmail || '',
	                        transferAttorneyPhone: attorney?.phone || previous?.transferAttorneyPhone || '',
	                      }))
	                      setKingstonsListingTermsError('')
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
	                    placeholder="Seller appointed firm"
	                    value={kingstonsListingTermsDraft?.transferAttorneyCompany || ''}
	                    onChange={(event) => updateKingstonsListingTermsDraftField('transferAttorneyCompany', event.target.value)}
	                  />
	                </label>
	              )}
	            </div>
	            {isManualKingstonsTransferAttorneyDraft(kingstonsListingTermsDraft || {}) ? (
	              <div className="mt-3 grid gap-3 md:grid-cols-3">
	                <Field
	                  placeholder="Contact person"
	                  value={kingstonsListingTermsDraft?.transferAttorneyContact || ''}
	                  onChange={(event) => updateKingstonsListingTermsDraftField('transferAttorneyContact', event.target.value)}
	                />
	                <Field
	                  type="email"
	                  inputMode="email"
	                  placeholder="Email"
	                  value={kingstonsListingTermsDraft?.transferAttorneyEmail || ''}
	                  onChange={(event) => updateKingstonsListingTermsDraftField('transferAttorneyEmail', event.target.value)}
	                />
	                <Field
	                  type="tel"
	                  inputMode="tel"
	                  placeholder="Phone"
	                  value={kingstonsListingTermsDraft?.transferAttorneyPhone || ''}
	                  onChange={(event) => updateKingstonsListingTermsDraftField('transferAttorneyPhone', event.target.value)}
	                />
	              </div>
	            ) : null}
	          </section>
	        </div>
	        <div className="mt-5 flex flex-col-reverse gap-2 border-t border-[#edf3f8] pt-4 sm:flex-row sm:justify-end">
	          <Button type="button" variant="ghost" onClick={closeKingstonsListingTermsModal} disabled={kingstonsListingTermsSaving}>
	            Cancel
	          </Button>
	          <Button type="button" onClick={() => void handleSaveKingstonsListingTerms()} disabled={kingstonsListingTermsSaving}>
	            {kingstonsListingTermsSaving ? 'Saving...' : selectedKingstonsTermsContextIsBuyerOtp ? 'Save OTP Terms' : 'Save Terms'}
	          </Button>
	        </div>
	      </Modal>
  )
}
