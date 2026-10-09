import ListingSellerInformationEditor from '../listings/ListingSellerInformationEditor.jsx'
import Field from '../ui/Field.jsx'
import PropertyDisclosureQuestionnaire from '../onboarding/PropertyDisclosureQuestionnaire.jsx'
import { getPropertyDisclosureAnswerSummary } from '../../lib/propertyDisclosure.js'

function Input({ label, field, draft, onChange, type = 'text' }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
      {label}
      <Field type={type} value={draft[field] ?? ''} onChange={(event) => onChange(field, event.target.value)} />
    </label>
  )
}

export default function SellerLeadAgentOnboardingEditor({
  draft,
  saving,
  onChange,
  onAddPerson,
  onUpdatePerson,
  onRemovePerson,
  onSubmit,
}) {
  const company = ['company', 'close_corporation', 'foreign_company'].includes(draft.branch)
  const trust = ['trust', 'foreign_trust'].includes(draft.branch)
  const disclosure = draft.propertyDisclosure || {}
  const summary = getPropertyDisclosureAnswerSummary(disclosure)
  function patchDisclosure(patch) {
    onChange('propertyDisclosure', { ...disclosure, ...patch })
  }

  return (
    <fieldset disabled={saving} className="min-w-0 space-y-4">
      <p className="rounded-[14px] border border-[#dbe6f2] bg-[#f7fbff] p-3 text-sm text-[#405b75]">
        Capture the seller’s answers here. Save a draft to continue later, or submit the completed answers for review. The seller must review and sign the disclosure themselves.
      </p>
      <ListingSellerInformationEditor
        draft={draft}
        saving={saving}
        showConsent={false}
        onChange={onChange}
        onAddPerson={onAddPerson}
        onUpdatePerson={onUpdatePerson}
        onRemovePerson={onRemovePerson}
        onSubmit={onSubmit}
      />
      {company || trust ? <section className="grid gap-4 rounded-[18px] border border-[#dce6f2] bg-white p-4 sm:grid-cols-2">
        <h4 className="text-sm font-semibold text-[#243d56] sm:col-span-2">Representative identity details</h4>
        {company ? <>
          <Input label="Signatory ID / passport (if not listed above)" field="authorisedSignatoryIdNumber" draft={draft} onChange={onChange} />
          <Input label="Signatory nationality (if not listed above)" field="authorisedSignatoryNationality" draft={draft} onChange={onChange} />
          <Input label="Signatory residential address (if not listed above)" field="authorisedSignatoryAddress" draft={draft} onChange={onChange} />
        </> : null}
        {trust ? <>
          <Input label="Authorised trustee ID / passport (if not listed above)" field="authorisedTrusteeIdNumber" draft={draft} onChange={onChange} />
          <Input label="Authorised trustee nationality (if not listed above)" field="authorisedTrusteeNationality" draft={draft} onChange={onChange} />
          <Input label="Authorised trustee residential address (if not listed above)" field="authorisedTrusteeAddress" draft={draft} onChange={onChange} />
        </> : null}
      </section> : null}
      <section className="grid gap-4 rounded-[18px] border border-[#dce6f2] bg-white p-4 sm:grid-cols-2">
        <h4 className="text-sm font-semibold text-[#243d56] sm:col-span-2">Property and mandate details</h4>
        <Input label="Suburb" field="propertySuburb" draft={draft} onChange={onChange} />
        <Input label="City" field="propertyCity" draft={draft} onChange={onChange} />
        <Input label="Province" field="propertyProvince" draft={draft} onChange={onChange} />
        <Input label="Postal code" field="propertyPostalCode" draft={draft} onChange={onChange} />
        <Input label="Rates and taxes" field="ratesTaxes" draft={draft} onChange={onChange} />
        <Input label="Levies" field="levies" draft={draft} onChange={onChange} />
        <label className="flex items-center gap-2 text-sm font-semibold text-[#2d445e] sm:col-span-2">
          <input type="checkbox" checked={Boolean(draft.leviesNotApplicable)} onChange={(event) => onChange('leviesNotApplicable', event.target.checked)} />Levies do not apply
        </label>
        <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
          Water billing
          <Field as="select" value={draft.waterBillingType || ''} onChange={(event) => onChange('waterBillingType', event.target.value)}>
            <option value="">Select</option><option value="municipal">Municipal</option><option value="prepaid">Prepaid</option><option value="body_corporate">Body corporate</option><option value="other">Other</option>
          </Field>
        </label>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#2d445e] sm:col-span-2">
          <input type="checkbox" checked={Boolean(draft.leaseExists)} onChange={(event) => onChange('leaseExists', event.target.checked)} />A lease exists
        </label>
        {draft.leaseExists ? <Input label="Lease expiry date" field="leaseExpiryDate" type="date" draft={draft} onChange={onChange} /> : null}
      </section>
      <section className="min-w-0 rounded-[18px] border border-[#dce6f2] bg-white p-4">
        <h4 className="text-base font-semibold text-[#243d56]">Property disclosure — Annexure A</h4>
        <p className="my-3 text-sm text-[#405b75]">{summary.answered} / {summary.total} answered. Record Yes, No or Unsure exactly as the seller answers, with explanations where needed.</p>
        {draft.disclosureLocked ? <p role="status" className="mb-3 rounded-[12px] bg-[#f2fbf5] p-3 text-sm text-[#25603d]">This disclosure already has signature evidence or a reviewed upload. Its answers are locked to preserve the original document.</p> : <p className="mb-3 text-sm text-[#405b75]">These answers are captured by the agent and await the seller’s review and signature.</p>}
        <PropertyDisclosureQuestionnaire
          disclosure={disclosure}
          disabled={Boolean(draft.disclosureLocked)}
          onAnswerChange={(key, answer) => patchDisclosure({ responses: { ...disclosure.responses, [key]: { ...disclosure.responses?.[key], answer } } })}
          onNoteChange={(key, note) => patchDisclosure({ responses: { ...disclosure.responses, [key]: { ...disclosure.responses?.[key], note } } })}
          onDisclosureChange={(key, value) => patchDisclosure(typeof key === 'object' ? key : { [key]: value })}
        />
      </section>
      <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
        <label className="flex items-start gap-2 text-sm font-semibold text-[#2d445e]">
          <input type="checkbox" className="mt-1" checked={Boolean(draft.popiConsentAccepted)} onChange={(event) => onChange('popiConsentAccepted', event.target.checked)} />
          I confirm the seller gave consent to capture and process these details for onboarding.
        </label>
      </section>
    </fieldset>
  )
}
