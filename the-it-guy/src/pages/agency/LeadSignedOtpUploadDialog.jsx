// Form state and workflow handlers remain in the lead workspace controller.
import Modal from "../../components/ui/Modal"
import Button from "../../components/ui/Button"
import { CheckCircle2 } from "lucide-react"
import Field from "../../components/ui/Field"
import { normalizeFinanceType } from "../../core/transactions/financeType.js"
import { TRANSACTION_FEE_EX_VAT, TRANSACTION_FEE_INCL_VAT } from "../../services/transactionFeeControlService"

export default function LeadSignedOtpUploadDialog({ OTP_UPLOAD_WIZARD_STEPS, buildKingstonsListingTermsDraft, buyerOfferDocumentUploading, buyerOfferUploadForm, buyerOtpAttorneyPromptError, closeOtpUploadWizard, getOtpUploadWizardValidationMessage, goToOtpUploadWizardStep, handleOtpUploadWizardBack, handleOtpUploadWizardContinue, leadAppointmentOfferListingOptions, normalizeText, otpUploadWizardAttorneyComplete, otpUploadWizardAttorneyDeferred, otpUploadWizardAttorneyDraft, otpUploadWizardAttorneyManual, otpUploadWizardOpen, otpUploadWizardSelectedAttorney, otpUploadWizardStep, otpUploadWizardStepIndex, selectedKingstonsListingTerms, selectedLead, selectedLeadContactName, selectedLeadLinkedListing, selectedOtpUploadListingId, selectedOtpUploadListingOption, sellerPreferredAttorneys, sellerPreferredAttorneysError, sellerPreferredAttorneysLoading, setBuyerOfferUploadForm, setBuyerOtpAttorneyPromptDraft, setBuyerOtpAttorneyPromptError, updateBuyerOtpAttorneyPromptDraftField }) {
  return (
<Modal
	        open={otpUploadWizardOpen}
	        onClose={closeOtpUploadWizard}
	        title="Upload Signed OTP"
	        subtitle="Confirm the OTP details, signatures, terms and transfer attorney before attaching the signed document."
	        className="max-w-5xl"
	        footer={(
	          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	            <p className="text-xs font-semibold text-[#71869c]">
	              OTP cannot be uploaded until the confirmations in this wizard are complete.
	            </p>
	            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
	              <Button type="button" variant="ghost" onClick={otpUploadWizardStepIndex === 0 ? closeOtpUploadWizard : handleOtpUploadWizardBack} disabled={buyerOfferDocumentUploading}>
	                {otpUploadWizardStepIndex === 0 ? 'Cancel' : 'Back'}
	              </Button>
	              <Button type="button" onClick={handleOtpUploadWizardContinue} disabled={buyerOfferDocumentUploading}>
	                {otpUploadWizardStep === 'upload' ? 'Continue to Upload' : 'Continue'}
	              </Button>
	            </div>
	          </div>
	        )}
	      >
	        {buyerOtpAttorneyPromptError ? (
	          <p className="mb-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">
	            {buyerOtpAttorneyPromptError}
	          </p>
	        ) : null}

	        <div className="grid overflow-hidden rounded-[20px] border border-[#dfe9f4] bg-white lg:grid-cols-[260px_1fr]">
	          <aside className="border-b border-[#edf3f8] bg-[#fbfdff] p-4 lg:border-b-0 lg:border-r">
	            <div className="grid gap-2">
	              {OTP_UPLOAD_WIZARD_STEPS.map((step, index) => {
	                const active = step.key === otpUploadWizardStep
	                const complete =
	                  (step.key === 'details' && !getOtpUploadWizardValidationMessage('details')) ||
	                  (step.key === 'confirm' && !getOtpUploadWizardValidationMessage('confirm')) ||
	                  (step.key === 'attorney' && otpUploadWizardAttorneyComplete) ||
	                  (step.key === 'upload' && index < otpUploadWizardStepIndex)
	                return (
	                  <button
	                    key={step.key}
	                    type="button"
	                    onClick={() => goToOtpUploadWizardStep(step.key)}
	                    className={`flex items-center gap-3 rounded-[14px] px-3 py-3 text-left transition ${
	                      active ? 'bg-[#edf5ff] text-[#0b63f6]' : 'text-[#344b63] hover:bg-white'
	                    }`}
	                  >
	                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
	                      complete
	                        ? 'border-[#1f934f] bg-[#1f934f] text-white'
	                        : active
	                          ? 'border-[#0b63f6] bg-[#0b63f6] text-white'
	                          : 'border-[#cbd8e6] bg-white text-[#6f849b]'
	                    }`}>
	                      {complete ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
	                    </span>
	                    <span className="min-w-0">
	                      <span className="block text-sm font-semibold">{step.label}</span>
	                      {step.key === 'confirm' && complete ? <span className="mt-0.5 block text-xs text-[#607891]">Signed by all parties · Arch9 terms included</span> : null}
	                    </span>
	                  </button>
	                )
	              })}
	            </div>
	          </aside>

	          <section className="min-w-0 p-5">
	            <div className="mb-5 grid gap-3 rounded-[16px] border border-[#dfe9f4] bg-[#fbfdff] p-3 sm:grid-cols-2 xl:grid-cols-4">
	              {[
	                ['Buyer', selectedLeadContactName || 'Buyer'],
	                ['Property', selectedOtpUploadListingOption?.label || selectedLeadLinkedListing?.propertyAddress || 'Not selected'],
	                ['OTP Amount', buyerOfferUploadForm.offerAmount ? `R ${Number(buyerOfferUploadForm.offerAmount).toLocaleString('en-ZA')}` : 'Not captured'],
	                ['Finance', buyerOfferUploadForm.financeType || selectedLead?.financeType || selectedLead?.preferredFinanceType || 'Not captured'],
	              ].map(([label, value]) => (
	                <article key={label} className="rounded-[12px] border border-[#e5edf5] bg-white px-3 py-2.5">
	                  <span className="block text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#7b8fa5]">{label}</span>
	                  <strong className="mt-1 block truncate text-sm text-[#18324b]">{value}</strong>
	                </article>
	              ))}
	            </div>

	            {otpUploadWizardStep === 'details' ? (
	              <section className="grid gap-4">
	                <div>
	                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#102033]">Confirm details</h4>
	                  <p className="mt-1 text-sm leading-6 text-[#60758b]">Check the buyer, property, OTP amount and finance route before upload.</p>
	                </div>
	                <div className="grid gap-4 lg:grid-cols-2">
	                  <label className="grid gap-1">
	                    <span className="text-xs font-semibold text-[#6f849b]">Property/listing</span>
	                    <Field
	                      as="select"
	                      value={selectedOtpUploadListingId}
	                      onChange={(event) => setBuyerOfferUploadForm((previous) => ({ ...previous, listingId: event.target.value }))}
	                    >
	                      <option value="">Select property/listing</option>
	                      {leadAppointmentOfferListingOptions.map((listing) => (
	                        <option key={listing.id} value={listing.id}>{listing.label}</option>
	                      ))}
	                    </Field>
	                  </label>
	                  <label className="grid gap-1">
	                    <span className="text-xs font-semibold text-[#6f849b]">OTP amount</span>
	                    <Field
	                      type="number"
	                      min="0"
	                      step="1000"
	                      placeholder="Amount on OTP"
	                      value={buyerOfferUploadForm.offerAmount}
	                      onChange={(event) => setBuyerOfferUploadForm((previous) => ({ ...previous, offerAmount: event.target.value }))}
	                    />
	                  </label>
	                  <label className="grid gap-1">
	                    <span className="text-xs font-semibold text-[#6f849b]">Finance type</span>
	                    <Field
	                      as="select"
	                      value={buyerOfferUploadForm.financeType ? normalizeFinanceType(buyerOfferUploadForm.financeType, { allowUnknown: true }) : ''}
	                      onChange={(event) => setBuyerOfferUploadForm((previous) => ({ ...previous, financeType: event.target.value }))}
	                    >
                      <option value="">Choose finance route</option>
                      <option value="cash">Cash</option>
                      <option value="bond">Bond</option>
                      <option value="combination">Cash and bond</option>
                    </Field>
	                  </label>
	                  <label className="grid gap-1 lg:row-span-2">
	                    <span className="text-xs font-semibold text-[#6f849b]">Agent note</span>
	                    <Field
	                      as="textarea"
	                      rows={4}
	                      placeholder="Add context for reviewing this uploaded offer..."
	                      value={buyerOfferUploadForm.note}
	                      onChange={(event) => setBuyerOfferUploadForm((previous) => ({ ...previous, note: event.target.value }))}
	                    />
	                  </label>
	                </div>
	              </section>
	            ) : null}

	            {otpUploadWizardStep === 'confirm' ? (
	              <section className="grid gap-4">
	                <div>
	                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#102033]">Confirm everyone signed</h4>
	                  <p className="mt-1 text-sm leading-6 text-[#60758b]">Confirm that every required buyer, seller/developer, witness and initial field is complete.</p>
	                </div>
	                <label className="flex min-h-[118px] items-start gap-3 rounded-[16px] border border-[#dfe9f4] bg-[#fbfdff] p-4">
	                  <input
	                    type="checkbox"
	                    checked={buyerOfferUploadForm.confirmedSignedByAllParties === true}
	                    onChange={(event) => setBuyerOfferUploadForm((previous) => ({ ...previous, confirmedSignedByAllParties: event.target.checked }))}
	                    className="mt-1 h-4 w-4 rounded border-[#cbd8e6] text-[#0b63f6]"
	                  />
	                  <span className="min-w-0">
	                    <span className="block text-sm font-semibold text-[#18324b]">Signed by all required parties</span>
	                    <span className="mt-1 block text-sm leading-6 text-[#607891]">The OTP has every required buyer, seller/developer, witness and initial signature.</span>
	                  </span>
	                </label>
	              </section>
	            ) : null}

	            {otpUploadWizardStep === 'confirm' ? (
	              <section className="grid gap-4">
	                <div>
	                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#102033]">Confirm Arch9 terms</h4>
	                  <p className="mt-1 text-sm leading-6 text-[#60758b]">Confirm that the signed OTP includes the required Arch9 terms and conditions.</p>
	                </div>
	                <label className="flex min-h-[118px] items-start gap-3 rounded-[16px] border border-[#dfe9f4] bg-[#fbfdff] p-4">
	                  <input
	                    type="checkbox"
	                    checked={buyerOfferUploadForm.confirmedArch9TermsIncluded === true}
	                    onChange={(event) => setBuyerOfferUploadForm((previous) => ({ ...previous, confirmedArch9TermsIncluded: event.target.checked }))}
	                    className="mt-1 h-4 w-4 rounded border-[#cbd8e6] text-[#0b63f6]"
	                  />
	                  <span className="min-w-0">
	                    <span className="block text-sm font-semibold text-[#18324b]">Arch9 terms included in OTP</span>
	                    <span className="mt-1 block text-sm leading-6 text-[#607891]">The signed document contains the required Arch9 terms and conditions before it enters the transaction file.</span>
	                  </span>
	                </label>
	              </section>
	            ) : null}

	            {otpUploadWizardStep === 'confirm' ? (
	              <section className="grid gap-4">
	                <div>
	                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#102033]">Verify transaction fee and consent</h4>
	                  <p className="mt-1 text-sm leading-6 text-[#60758b]">This records the R1,500 excl. VAT transaction-fee control against the transaction. No invoice is sent at this stage.</p>
	                </div>
	                <div className="rounded-[16px] border border-[#d7e7f7] bg-[#f7fbff] p-4 text-sm text-[#284663]">
	                  <strong className="block text-base text-[#17324d]">R{TRANSACTION_FEE_EX_VAT.toLocaleString('en-ZA')} excl. VAT · R{TRANSACTION_FEE_INCL_VAT.toLocaleString('en-ZA')} incl. VAT</strong>
	                  <span className="mt-1 block leading-6">Select the party to invoice under the applicable agreement. This selection is recorded for finance; it does not create or send an invoice yet.</span>
	                </div>
	                <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
	                  Fee billed to
	                  <Field
	                    as="select"
	                    value={buyerOfferUploadForm.transactionFeeBillingParty}
	                    onChange={(event) => setBuyerOfferUploadForm((previous) => ({ ...previous, transactionFeeBillingParty: event.target.value }))}
	                  >
	                    <option value="">Select billing party</option>
	                    <option value="agent">Agent</option>
	                    <option value="attorney">Transferring attorney</option>
	                  </Field>
	                </label>
	                <label className="flex min-h-[128px] items-start gap-3 rounded-[16px] border border-[#dfe9f4] bg-[#fbfdff] p-4">
	                  <input
	                    type="checkbox"
	                    checked={buyerOfferUploadForm.confirmedTransactionFeeConsentIncluded === true}
	                    onChange={(event) => setBuyerOfferUploadForm((previous) => ({ ...previous, confirmedTransactionFeeConsentIncluded: event.target.checked }))}
	                    className="mt-1 h-4 w-4 rounded border-[#cbd8e6] text-[#0b63f6]"
	                  />
	                  <span className="min-w-0">
	                    <span className="block text-sm font-semibold text-[#18324b]">Transaction-fee terms and approved consent form included</span>
	                    <span className="mt-1 block text-sm leading-6 text-[#607891]">Important: verify the signed OTP pack includes the approved transaction-fee terms and consent form before continuing. This confirmation is saved with the transaction and OTP evidence.</span>
	                  </span>
	                </label>
	              </section>
	            ) : null}

	            {otpUploadWizardStep === 'attorney' ? (
	              <section className="grid gap-4">
	                <div>
	                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#102033]">Select transferring attorney</h4>
	                  <p className="mt-1 text-sm leading-6 text-[#60758b]">Choose the attorney that should be nominated when this OTP is uploaded.</p>
	                </div>
	                {sellerPreferredAttorneysError ? (
	                  <p className="rounded-[12px] border border-[#f5dfbb] bg-[#fff9ee] px-3 py-2 text-sm text-[#8a5c10]">
	                    {sellerPreferredAttorneysError}
	                  </p>
	                ) : null}
	                <section className="rounded-[18px] border border-[#e2ebf4] bg-white p-4">
	                  <div className="grid gap-3 md:grid-cols-[180px_1fr]">
	                    <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
	                      Source
	                      <Field
	                        as="select"
	                        value={otpUploadWizardAttorneyDraft.transferAttorneyMode || 'agency_recommended'}
	                        onChange={(event) => updateBuyerOtpAttorneyPromptDraftField('transferAttorneyMode', event.target.value)}
	                      >
	                        <option value="agency_recommended">Agency panel</option>
	                        <option value="buyer_selected">Manual firm</option>
                        <option value="choose_later">Choose later</option>
	                      </Field>
	                    </label>
	                    {otpUploadWizardAttorneyDeferred ? <p className="self-center text-sm text-[#60758b]">Save the OTP now. Choose the firm from Deal Setup before sending an instruction.</p> : !otpUploadWizardAttorneyManual ? (
	                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
	                        Attorney
	                        <Field
	                          as="select"
	                          value={otpUploadWizardAttorneyDraft.transferAttorneyId || ''}
	                          disabled={sellerPreferredAttorneysLoading}
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
	                          <option value="">{sellerPreferredAttorneysLoading ? 'Loading attorneys...' : 'Choose transfer attorney'}</option>
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
	                          value={otpUploadWizardAttorneyDraft.transferAttorneyCompany || ''}
	                          onChange={(event) => updateBuyerOtpAttorneyPromptDraftField('transferAttorneyCompany', event.target.value)}
	                        />
	                      </label>
	                    )}
	                  </div>
	                  {otpUploadWizardAttorneyManual ? (
	                    <div className="mt-3 grid gap-3 md:grid-cols-3">
	                      <Field placeholder="Contact person" value={otpUploadWizardAttorneyDraft.transferAttorneyContact || ''} onChange={(event) => updateBuyerOtpAttorneyPromptDraftField('transferAttorneyContact', event.target.value)} />
	                      <Field type="email" inputMode="email" placeholder="Email" value={otpUploadWizardAttorneyDraft.transferAttorneyEmail || ''} onChange={(event) => updateBuyerOtpAttorneyPromptDraftField('transferAttorneyEmail', event.target.value)} />
	                      <Field type="tel" inputMode="tel" placeholder="Phone" value={otpUploadWizardAttorneyDraft.transferAttorneyPhone || ''} onChange={(event) => updateBuyerOtpAttorneyPromptDraftField('transferAttorneyPhone', event.target.value)} />
	                    </div>
	                  ) : null}
	                </section>
	              </section>
	            ) : null}

	            {otpUploadWizardStep === 'attorney' && !otpUploadWizardAttorneyDeferred ? (
	              <section className="grid gap-4">
	                <div>
	                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#102033]">Send instruction</h4>
	                  <p className="mt-1 text-sm leading-6 text-[#60758b]">Choose whether the nominated attorney should receive the transfer instruction after the OTP upload.</p>
	                </div>
	                <section className="rounded-[18px] border border-[#dfe9f4] bg-[#fbfdff] p-4">
	                  <div className="flex flex-wrap items-center justify-between gap-4">
	                    <div>
	                      <h5 className="text-base font-semibold text-[#102033]">Send instruction after OTP upload</h5>
	                      <p className="mt-1 text-sm leading-5 text-[#60758b]">
	                        Leave this off to save the attorney as nominated with instruction pending.
	                      </p>
	                    </div>
	                    <button
	                      type="button"
	                      role="switch"
	                      aria-checked={otpUploadWizardAttorneyDraft.sendInstruction === true}
	                      className={`relative h-8 w-14 rounded-full border transition ${otpUploadWizardAttorneyDraft.sendInstruction === true ? 'border-[#13784f] bg-[#13784f]' : 'border-[#cfdbe8] bg-white'}`}
	                      onClick={() => updateBuyerOtpAttorneyPromptDraftField('sendInstruction', otpUploadWizardAttorneyDraft.sendInstruction !== true)}
	                    >
	                      <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-[0_4px_10px_rgba(15,34,54,0.20)] transition ${otpUploadWizardAttorneyDraft.sendInstruction === true ? 'left-7' : 'left-1'}`} />
	                      <span className="sr-only">Send instruction</span>
	                    </button>
	                  </div>
	                </section>
	              </section>
	            ) : null}

	            {otpUploadWizardStep === 'upload' ? (
	              <section className="grid gap-4">
	                <div>
	                  <h4 className="text-lg font-semibold tracking-[-0.02em] text-[#102033]">Upload OTP</h4>
	                  <p className="mt-1 text-sm leading-6 text-[#60758b]">Everything is ready. Continue to choose the signed OTP file.</p>
	                </div>
	                <div className="grid gap-2 rounded-[16px] border border-[#d6eadf] bg-[#f2fbf5] p-4 text-sm text-[#215f3a]">
	                  <p className="font-semibold">Ready to upload</p>
	                  <p>Transferring attorney: {otpUploadWizardAttorneyDeferred ? 'Choose later' : otpUploadWizardSelectedAttorney?.companyName || otpUploadWizardAttorneyDraft.transferAttorneyCompany || otpUploadWizardAttorneyDraft.transferAttorneyEmail || 'Selected'}</p>
	                  <p>Instruction: {otpUploadWizardAttorneyDeferred ? 'None requested' : otpUploadWizardAttorneyDraft.sendInstruction === true ? 'Send after OTP upload' : 'Save as nominated attorney'}</p>
	                </div>
	              </section>
	            ) : null}
	          </section>
	        </div>
	      </Modal>
  )
}
