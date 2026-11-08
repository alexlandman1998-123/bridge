// Form state and workflow handlers remain in the lead workspace controller.
import Modal from "../../components/ui/Modal"
import Button from "../../components/ui/Button"
import { Plus, X, ShieldCheck } from "lucide-react"
import Field from "../../components/ui/Field"

export default function LeadSellerPackWizardDialog({ KINGSTONS_FICA_JURISTIC_ENTITY_OPTIONS, KINGSTONS_FICA_NATURAL_SETUP_OPTIONS, KINGSTONS_FICA_SELLER_TYPE_DETAILS, KINGSTONS_FICA_SELLER_TYPE_OPTIONS, addKingstonsSellerPackOwnerDraft, buildKingstonsSellerPackProfileDraft, closeKingstonsSellerPackWizard, getKingstonsSellerPackCaptureSummaryLabel, handleKingstonsSellerPackWizardSave, kingstonsSellerPackWizardDraft, kingstonsSellerPackWizardError, kingstonsSellerPackWizardOpen, kingstonsSellerPackWizardSaving, kingstonsSellerPackWizardStep, normalizeKey, normalizeKingstonsSellerPackOwnerDraft, normalizeKingstonsSellerPackOwnerDrafts, removeKingstonsSellerPackOwnerDraft, selectedKingstonsSellerPack, setKingstonsSellerPackWizardDraft, setKingstonsSellerPackWizardError, setKingstonsSellerPackWizardStep, updateKingstonsSellerPackOwnerDraft, updateKingstonsSellerPackWizardDraftField }) {
  return (
<Modal
                        open={kingstonsSellerPackWizardOpen}
                        onClose={closeKingstonsSellerPackWizard}
                        title={kingstonsSellerPackWizardStep === 'details' ? 'Capture seller pack details' : 'Choose seller type'}
                        subtitle="Capture the legal path once, then upload the signed Seller Pack documents from the documents tab."
                        className="max-w-[820px]"
                      >
                        {kingstonsSellerPackWizardError ? (
                          <p className="mb-4 rounded-[14px] border border-[#f4d4d4] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">
                            {kingstonsSellerPackWizardError}
                          </p>
                        ) : null}
                        {kingstonsSellerPackWizardStep === 'type' ? (
                          <div className="grid gap-4 md:grid-cols-2" data-testid="kingstons-fica-seller-type-picker">
                            {KINGSTONS_FICA_SELLER_TYPE_OPTIONS.map((option) => {
                              const detail = KINGSTONS_FICA_SELLER_TYPE_DETAILS[option.value] || {}
                              const isSelected = normalizeKey(kingstonsSellerPackWizardDraft?.sellerType) === option.value
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={`flex h-full min-h-[210px] flex-col rounded-[20px] border p-4 text-left transition ${
                                    isSelected
                                      ? 'border-[#9fc6f2] bg-[#f7fbff] shadow-[0_14px_30px_rgba(29,101,183,0.10)]'
                                      : 'border-[#dbe7f3] bg-white hover:border-[#b8cadf] hover:bg-[#fcfdff]'
                                  }`}
                                  onClick={() => {
                                    setKingstonsSellerPackWizardDraft((previous) => ({
                                      ...(previous || buildKingstonsSellerPackProfileDraft(selectedKingstonsSellerPack)),
                                      sellerType: option.value,
                                    }))
                                    setKingstonsSellerPackWizardStep('details')
                                    setKingstonsSellerPackWizardError('')
                                  }}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Seller type</p>
                                      <h4 className="mt-1 text-base font-semibold text-[#102033]">{detail.title || option.label}</h4>
                                    </div>
                                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${isSelected ? 'border-[#9fc6f2] bg-white text-[#1d65b7]' : 'border-[#dbe7f3] bg-[#f8fbff] text-[#607387]'}`}>
                                      {isSelected ? 'Selected' : 'Choose'}
                                    </span>
                                  </div>
                                  <p className="mt-3 text-sm leading-6 text-[#60758b]">
                                    {detail.summary || option.label}
                                  </p>
                                  <ul className="mt-4 space-y-2 text-sm leading-6 text-[#60758b]">
                                    {(detail.details || []).map((item) => (
                                      <li key={item} className="flex gap-2">
                                        <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#8ab7d8]" />
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </button>
                              )
                            })}
                          </div>
                        ) : null}

                        {kingstonsSellerPackWizardStep === 'details' ? (
                          <div className="space-y-5">
                            <div className="grid gap-3 rounded-[18px] border border-[#e4edf7] bg-[#fbfdff] p-4 md:grid-cols-[repeat(2,minmax(0,1fr))]">
                              <button
                                type="button"
                                className={`rounded-[14px] border px-4 py-3 text-left transition ${normalizeKey(kingstonsSellerPackWizardDraft?.sellerType) === 'natural' ? 'border-[#9fc6f2] bg-white shadow-[0_14px_30px_rgba(29,101,183,0.10)]' : 'border-[#dbe7f3] bg-white hover:border-[#b8cadf]'}`}
                                onClick={() => {
                                  updateKingstonsSellerPackWizardDraftField('sellerType', 'natural')
                                  setKingstonsSellerPackWizardStep('details')
                                }}
                              >
                                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Seller type</p>
                                <h4 className="mt-1 text-base font-semibold text-[#102033]">Natural person</h4>
                                <p className="mt-2 text-sm leading-6 text-[#60758b]">Use this for an individual seller and capture the marital setup that affects signing.</p>
                              </button>
                              <button
                                type="button"
                                className={`rounded-[14px] border px-4 py-3 text-left transition ${normalizeKey(kingstonsSellerPackWizardDraft?.sellerType) === 'juristic' ? 'border-[#9fc6f2] bg-white shadow-[0_14px_30px_rgba(29,101,183,0.10)]' : 'border-[#dbe7f3] bg-white hover:border-[#b8cadf]'}`}
                                onClick={() => {
                                  updateKingstonsSellerPackWizardDraftField('sellerType', 'juristic')
                                  setKingstonsSellerPackWizardStep('details')
                                }}
                              >
                                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">Seller type</p>
                                <h4 className="mt-1 text-base font-semibold text-[#102033]">Juristic person</h4>
                                <p className="mt-2 text-sm leading-6 text-[#60758b]">Use this for companies, close corporations, and trusts with authority details.</p>
                              </button>
                            </div>

                            {normalizeKey(kingstonsSellerPackWizardDraft?.sellerType) === 'natural' ? (
                              <div className="space-y-4 rounded-[18px] border border-[#e4edf7] bg-[#fbfdff] p-4">
                                <div>
                                  <h4 className="text-base font-semibold text-[#102033]">Marital setup</h4>
                                  <p className="mt-1 text-sm leading-6 text-[#60758b]">We only ask for the spouse details that the legal path actually needs.</p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  {KINGSTONS_FICA_NATURAL_SETUP_OPTIONS.map((option) => {
                                    const isSelected = normalizeKey(kingstonsSellerPackWizardDraft?.naturalSetup) === option.value
                                    return (
                                      <button
                                        key={option.value}
                                        type="button"
                                        className={`rounded-[14px] border px-4 py-3 text-left transition ${isSelected ? 'border-[#9fc6f2] bg-white shadow-[0_14px_30px_rgba(29,101,183,0.10)]' : 'border-[#dbe7f3] bg-white hover:border-[#b8cadf]'}`}
                                        onClick={() => updateKingstonsSellerPackWizardDraftField('naturalSetup', option.value)}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <h5 className="text-sm font-semibold text-[#102033]">{option.label}</h5>
                                          <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${isSelected ? 'border-[#9fc6f2] bg-[#f7fbff] text-[#1d65b7]' : 'border-[#dbe7f3] bg-[#f8fbff] text-[#607387]'}`}>
                                            {isSelected ? 'Selected' : 'Choose'}
                                          </span>
                                        </div>
                                        <p className="mt-2 text-sm leading-6 text-[#60758b]">{option.description}</p>
                                      </button>
                                    )
                                  })}
                                </div>

                                <div className="rounded-[16px] border border-[#dbe6f2] bg-white p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <h5 className="text-sm font-semibold text-[#22364a]">Registered owners</h5>
                                      <p className="mt-1 text-sm leading-6 text-[#60758b]">
                                        Capture each owner separately so FICA requirements and follow-ups can be generated correctly.
                                      </p>
                                    </div>
                                    <Button type="button" size="sm" variant="secondary" onClick={addKingstonsSellerPackOwnerDraft}>
                                      <Plus size={15} />
                                      Add owner
                                    </Button>
                                  </div>
                                  <div className="mt-4 space-y-3">
                                    {(normalizeKingstonsSellerPackOwnerDrafts(kingstonsSellerPackWizardDraft?.owners).length
                                      ? normalizeKingstonsSellerPackOwnerDrafts(kingstonsSellerPackWizardDraft?.owners)
                                      : [normalizeKingstonsSellerPackOwnerDraft({})]
                                    ).map((owner, ownerIndex) => (
                                      <div key={owner.id || `owner-${ownerIndex + 1}`} className="rounded-[14px] border border-[#e0eaf4] bg-[#fbfdff] p-3">
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#72859c]">Owner {ownerIndex + 1}</p>
                                          {ownerIndex > 0 ? (
                                            <button
                                              type="button"
                                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#dbe6f2] bg-white text-[#60758b] transition hover:border-[#f0c8c5] hover:text-[#9f3028]"
                                              aria-label={`Remove owner ${ownerIndex + 1}`}
                                              onClick={() => removeKingstonsSellerPackOwnerDraft(ownerIndex)}
                                            >
                                              <X size={15} />
                                            </button>
                                          ) : null}
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-3">
                                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                            First name
                                            <Field
                                              value={owner.firstName || ''}
                                              onChange={(event) => updateKingstonsSellerPackOwnerDraft(ownerIndex, 'firstName', event.target.value)}
                                            />
                                          </label>
                                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                            Surname
                                            <Field
                                              value={owner.surname || ''}
                                              onChange={(event) => updateKingstonsSellerPackOwnerDraft(ownerIndex, 'surname', event.target.value)}
                                            />
                                          </label>
                                          <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                            Email
                                            <Field
                                              type="email"
                                              inputMode="email"
                                              value={owner.email || ''}
                                              onChange={(event) => updateKingstonsSellerPackOwnerDraft(ownerIndex, 'email', event.target.value)}
                                            />
                                          </label>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>

                                {normalizeKey(kingstonsSellerPackWizardDraft?.naturalSetup) === 'in_community' || normalizeKey(kingstonsSellerPackWizardDraft?.naturalSetup) === 'anc' ? (
                                  <div className="rounded-[16px] border border-[#dbe6f2] bg-white p-4">
                                    <div className="flex items-start gap-3">
                                      <ShieldCheck className="mt-0.5 h-4 w-4 text-[#35546c]" />
                                      <div>
                                        <h5 className="text-sm font-semibold text-[#22364a]">Spouse details</h5>
                                        <p className="mt-1 text-sm leading-6 text-[#60758b]">
                                          {normalizeKey(kingstonsSellerPackWizardDraft?.naturalSetup) === 'in_community'
                                            ? 'Capture the spouse details now because they often need to appear in the signing path.'
                                            : 'Capture the spouse details if they will need to appear on the file or sign with the seller.'}
                                        </p>
                                      </div>
                                    </div>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                        Spouse name
                                        <Field
                                          value={kingstonsSellerPackWizardDraft?.spouseName || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('spouseName', event.target.value)}
                                        />
                                      </label>
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                        Spouse ID number
                                        <Field
                                          value={kingstonsSellerPackWizardDraft?.spouseIdNumber || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('spouseIdNumber', event.target.value)}
                                        />
                                      </label>
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                        Spouse email
                                        <Field
                                          type="email"
                                          inputMode="email"
                                          value={kingstonsSellerPackWizardDraft?.spouseEmail || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('spouseEmail', event.target.value)}
                                        />
                                      </label>
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                        Spouse phone
                                        <Field
                                          type="tel"
                                          inputMode="tel"
                                          value={kingstonsSellerPackWizardDraft?.spousePhone || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('spousePhone', event.target.value)}
                                        />
                                      </label>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {normalizeKey(kingstonsSellerPackWizardDraft?.sellerType) === 'juristic' ? (
                              <div className="space-y-4 rounded-[18px] border border-[#e4edf7] bg-[#fbfdff] p-4">
                                <div>
                                  <h4 className="text-base font-semibold text-[#102033]">Entity type</h4>
                                  <p className="mt-1 text-sm leading-6 text-[#60758b]">Choose the legal wrapper, then we’ll capture the matching authority details.</p>
                                </div>
                                <div className="grid gap-3 md:grid-cols-3">
                                  {KINGSTONS_FICA_JURISTIC_ENTITY_OPTIONS.map((option) => {
                                    const isSelected = normalizeKey(kingstonsSellerPackWizardDraft?.juristicEntityType) === option.value
                                    return (
                                      <button
                                        key={option.value}
                                        type="button"
                                        className={`rounded-[14px] border px-4 py-3 text-left transition ${isSelected ? 'border-[#9fc6f2] bg-white shadow-[0_14px_30px_rgba(29,101,183,0.10)]' : 'border-[#dbe7f3] bg-white hover:border-[#b8cadf]'}`}
                                        onClick={() => updateKingstonsSellerPackWizardDraftField('juristicEntityType', option.value)}
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <h5 className="text-sm font-semibold text-[#102033]">{option.label}</h5>
                                          <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${isSelected ? 'border-[#9fc6f2] bg-[#f7fbff] text-[#1d65b7]' : 'border-[#dbe7f3] bg-[#f8fbff] text-[#607387]'}`}>
                                            {isSelected ? 'Selected' : 'Choose'}
                                          </span>
                                        </div>
                                        <p className="mt-2 text-sm leading-6 text-[#60758b]">{option.description}</p>
                                      </button>
                                    )
                                  })}
                                </div>

                                {normalizeKey(kingstonsSellerPackWizardDraft?.juristicEntityType) === 'company' ? (
                                  <div className="rounded-[16px] border border-[#dbe6f2] bg-white p-4">
                                    <h5 className="text-sm font-semibold text-[#22364a]">Company details</h5>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                        Company name
                                        <Field
                                          value={kingstonsSellerPackWizardDraft?.companyName || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('companyName', event.target.value)}
                                        />
                                      </label>
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                        Registration number
                                        <Field
                                          value={kingstonsSellerPackWizardDraft?.companyRegistrationNumber || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('companyRegistrationNumber', event.target.value)}
                                        />
                                      </label>
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                                        Directors
                                        <Field
                                          as="textarea"
                                          rows={3}
                                          className="min-h-[112px] rounded-[12px] px-3 py-3 text-sm font-medium leading-6"
                                          placeholder="List directors one per line"
                                          value={kingstonsSellerPackWizardDraft?.companyDirectorsText || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('companyDirectorsText', event.target.value)}
                                        />
                                      </label>
                                    </div>
                                  </div>
                                ) : null}

                                {normalizeKey(kingstonsSellerPackWizardDraft?.juristicEntityType) === 'trust' ? (
                                  <div className="rounded-[16px] border border-[#dbe6f2] bg-white p-4">
                                    <h5 className="text-sm font-semibold text-[#22364a]">Trust details</h5>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                        Trust name
                                        <Field
                                          value={kingstonsSellerPackWizardDraft?.trustName || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('trustName', event.target.value)}
                                        />
                                      </label>
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                        Registration number
                                        <Field
                                          value={kingstonsSellerPackWizardDraft?.trustRegistrationNumber || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('trustRegistrationNumber', event.target.value)}
                                        />
                                      </label>
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                                        Trustees
                                        <Field
                                          as="textarea"
                                          rows={3}
                                          className="min-h-[112px] rounded-[12px] px-3 py-3 text-sm font-medium leading-6"
                                          placeholder="List trustees one per line"
                                          value={kingstonsSellerPackWizardDraft?.trustTrusteesText || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('trustTrusteesText', event.target.value)}
                                        />
                                      </label>
                                    </div>
                                  </div>
                                ) : null}

                                {normalizeKey(kingstonsSellerPackWizardDraft?.juristicEntityType) === 'close_corporation' ? (
                                  <div className="rounded-[16px] border border-[#dbe6f2] bg-white p-4">
                                    <h5 className="text-sm font-semibold text-[#22364a]">Close corporation details</h5>
                                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                        Entity name
                                        <Field
                                          value={kingstonsSellerPackWizardDraft?.closeCorporationName || kingstonsSellerPackWizardDraft?.companyName || kingstonsSellerPackWizardDraft?.trustName || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('closeCorporationName', event.target.value)}
                                        />
                                      </label>
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057]">
                                        Registration number
                                        <Field
                                          value={kingstonsSellerPackWizardDraft?.closeCorporationRegistrationNumber || kingstonsSellerPackWizardDraft?.companyRegistrationNumber || kingstonsSellerPackWizardDraft?.trustRegistrationNumber || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('closeCorporationRegistrationNumber', event.target.value)}
                                        />
                                      </label>
                                      <label className="grid gap-2 text-sm font-medium text-[#2a4057] md:col-span-2">
                                        Members
                                        <Field
                                          as="textarea"
                                          rows={3}
                                          className="min-h-[112px] rounded-[12px] px-3 py-3 text-sm font-medium leading-6"
                                          placeholder="List members one per line"
                                          value={kingstonsSellerPackWizardDraft?.closeCorporationMembersText || ''}
                                          onChange={(event) => updateKingstonsSellerPackWizardDraftField('closeCorporationMembersText', event.target.value)}
                                        />
                                      </label>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            <div className="rounded-[16px] border border-[#e4edf7] bg-[#f8fbff] px-4 py-4">
                              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#8aa0b7]">Saved path</p>
                              <p className="mt-1 text-sm font-semibold text-[#20364c]">{getKingstonsSellerPackCaptureSummaryLabel(kingstonsSellerPackWizardDraft || selectedKingstonsSellerPack)}</p>
                              <p className="mt-1 text-sm leading-6 text-[#60758b]">
                                {normalizeKey(kingstonsSellerPackWizardDraft?.sellerType) === 'natural'
                                  ? 'We’ll keep the seller pack aligned to the relevant personal signing path.'
                                  : 'We’ll keep the seller pack aligned to the relevant company, trust, or authorised signatory path.'}
                              </p>
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#edf3f8] pt-4">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="rounded-[12px]"
                            onClick={() => {
                              if (kingstonsSellerPackWizardStep === 'details' && kingstonsSellerPackWizardDraft?.sellerType) {
                                setKingstonsSellerPackWizardStep('type')
                                return
                              }
                              closeKingstonsSellerPackWizard()
                            }}
                            disabled={kingstonsSellerPackWizardSaving}
                          >
                            {kingstonsSellerPackWizardStep === 'details' && kingstonsSellerPackWizardDraft?.sellerType ? 'Back' : 'Cancel'}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="rounded-[12px]"
                            onClick={() => void handleKingstonsSellerPackWizardSave()}
                            disabled={kingstonsSellerPackWizardSaving}
                          >
                            {kingstonsSellerPackWizardSaving ? 'Saving...' : 'Save & Continue'}
                          </Button>
                        </div>
                      </Modal>
  )
}
