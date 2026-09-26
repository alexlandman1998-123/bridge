import ListingSellerInformationEditor from '../listings/ListingSellerInformationEditor.jsx'
import Field from '../ui/Field.jsx'

function Input({ label, field, draft, onChange, type = 'text' }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
      {label}
      <Field type={type} value={draft[field] || ''} onChange={(event) => onChange(field, event.target.value)} />
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
  const company = ['company', 'foreign_company'].includes(draft.branch)
  const trust = ['trust', 'foreign_trust'].includes(draft.branch)
  const naturalPerson = ['individual', 'married', 'foreign_individual'].includes(draft.branch)

  return (
    <div className="space-y-4">
      <p className="rounded-[14px] border border-[#dbe6f2] bg-[#f7fbff] p-3 text-sm text-[#405b75]">
        Capture the seller’s answers here. Saving submits onboarding for agent review; it does not send a link or sign a mandate.
      </p>
      <ListingSellerInformationEditor
        draft={draft}
        saving={saving}
        onChange={onChange}
        onAddPerson={onAddPerson}
        onUpdatePerson={onUpdatePerson}
        onRemovePerson={onRemovePerson}
        onSubmit={onSubmit}
      />
      <section className="grid gap-4 rounded-[18px] border border-[#dce6f2] bg-white p-4 sm:grid-cols-2">
        <h4 className="text-sm font-semibold text-[#243d56] sm:col-span-2">Onboarding identity and tax details</h4>
        {naturalPerson ? <>
          <Input label="Date of birth" field="dateOfBirth" type="date" draft={draft} onChange={onChange} />
          <Input label="Nationality" field="nationality" draft={draft} onChange={onChange} />
          <Input label="Residential address" field="residentialAddress" draft={draft} onChange={onChange} />
        </> : null}
        <Input label="Income tax number" field="incomeTaxNumber" draft={draft} onChange={onChange} />
        <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
          SA tax resident
          <Field as="select" value={draft.saResident || ''} onChange={(event) => onChange('saResident', event.target.value)}>
            <option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option>
          </Field>
        </label>
        {company ? <>
          <Input label="Company resolution date" field="companyResolutionDate" type="date" draft={draft} onChange={onChange} />
          <Input label="Company authority basis" field="companyAuthorityBasis" draft={draft} onChange={onChange} />
        </> : null}
        {trust ? <Input label="Trust authority basis" field="trustAuthorityBasis" draft={draft} onChange={onChange} /> : null}
        {draft.branch === 'deceased_estate' ? <Input label="Executor authority details" field="executorAuthorityDetails" draft={draft} onChange={onChange} /> : null}
        {draft.branch === 'power_of_attorney' ? <Input label="Power of attorney authority details" field="powerOfAttorneyAuthorityDetails" draft={draft} onChange={onChange} /> : null}
      </section>
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
        <label className="grid gap-1.5 text-sm font-semibold text-[#2d445e]">
          Mandate type
          <Field as="select" value={draft.mandateType || ''} onChange={(event) => onChange('mandateType', event.target.value)}>
            <option value="">Select</option><option value="sole">Sole</option><option value="open">Open</option>
          </Field>
        </label>
        <Input label="Estimated asking price" field="askingPrice" type="number" draft={draft} onChange={onChange} />
        <label className="flex items-center gap-2 text-sm font-semibold text-[#2d445e] sm:col-span-2">
          <input type="checkbox" checked={Boolean(draft.leaseExists)} onChange={(event) => onChange('leaseExists', event.target.checked)} />A lease exists
        </label>
        {draft.leaseExists ? <Input label="Lease expiry date" field="leaseExpiryDate" type="date" draft={draft} onChange={onChange} /> : null}
      </section>
      <section className="rounded-[18px] border border-[#dce6f2] bg-white p-4">
        <label className="flex items-start gap-2 text-sm font-semibold text-[#2d445e]">
          <input type="checkbox" className="mt-1" checked={Boolean(draft.popiConsentAccepted)} onChange={(event) => onChange('popiConsentAccepted', event.target.checked)} />
          I confirm the seller gave consent to capture and process these details for onboarding.
        </label>
      </section>
    </div>
  )
}
