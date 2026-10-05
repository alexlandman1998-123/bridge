import Field from '../ui/Field.jsx'
import Button from '../ui/Button.jsx'
import { mandateAgencySchedulesDigest } from '../../core/documents/sellerMandateSigningApproval.js'
import { MANDATE_AGENCY_FIELDS, MANDATE_CAPTURE_GROUPS, MANDATE_CAPTURE_STATUS_OPTIONS, MANDATE_VAT_OPTIONS, normalizeSellerMandateCapture, readSellerMandateTerms } from '../../lib/sellerMandateCapture.js'

const registrationOptions = [['', 'Not captured'], ['captured', 'Registration supplied'], ['not_applicable', 'Not applicable']]
const vatStatusOptions = [['', 'Not captured'], ['registered', 'VAT registered'], ['not_registered', 'Not VAT registered']]

function Input({ label, value, onChange, kind = 'text', options }) {
  return <label className={`grid gap-1.5 text-sm font-semibold text-[#2d445e] ${kind === 'textarea' ? 'sm:col-span-2' : ''}`}>
    {label}
    <Field as={options ? 'select' : kind === 'textarea' ? 'textarea' : undefined} type={kind === 'textarea' ? undefined : kind} rows={kind === 'textarea' ? 3 : undefined} min={kind === 'number' ? '0' : undefined} step={kind === 'number' ? '0.01' : undefined} maxLength={kind === 'textarea' ? 4000 : 500} value={value ?? ''} onChange={event => onChange(event.target.value)}>
      {options?.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </Field>
  </label>
}

/** Shared by lead capture, listing capture, preparation and existing-copy corrections. */
export default function SellerMandateDetailsEditor({ value = {}, onChange, allowExtendedCapture = true, captureReadOnly = false, ownershipType = '' }) {
  const terms = readSellerMandateTerms(value)
  const capture = terms.mandateCapture
  if (capture && capture.version !== 1) return <section role="alert" className="rounded-[18px] border border-[#dce6f2] bg-white p-4 text-sm text-[#243d56]">
    This mandate uses a saved schedule version this app cannot edit. Keep its existing copies and evidence, and have the agent review a replacement before preparing new signing copies.
  </section>
  const evidenceReview = terms.mandateAcceptanceReview || {}
  const updateEvidence = (key, next) => update('mandateAcceptanceReview', { ...evidenceReview, [key]: next, reviewedAt: '', agencySchedulesDigest: '' })
  const update = (key, next) => onChange({ ...terms, [key]: next,
    ...(key === 'mandateDuration' && next === 'until_cancelled' ? { endDate: '' } : {}),
    ...(key === 'mandateType' && next !== 'open' ? { mandateDuration: 'fixed' } : {}),
  })
  const updateCapture = (group, key, next) => onChange({ ...terms, mandateCapture: { ...capture, [group]: { ...capture[group], [key]: next } },
    ...(terms.mandateAcceptanceReview ? { mandateAcceptanceReview: { ...evidenceReview, reviewedAt: '', agencySchedulesDigest: '',
      ...(['agencyA', 'agencyB'].includes(group) ? { ffcVerified: false } : {}), ...(group === 'authority' ? { authorityVerified: false } : {}) } } : {}) })
  const captureInput = (group, [key, label, kind = 'text']) => {
    const options = kind === 'vat' ? MANDATE_VAT_OPTIONS : kind === 'registration' ? registrationOptions : kind === 'vatStatus' ? vatStatusOptions : undefined
    if (key === 'registrationNumber' && capture[group].registrationStatus !== 'captured' || key === 'vatNumber' && capture[group].vatStatus !== 'registered') return null
    return <Input key={key} label={label} kind={options ? 'text' : kind} options={options} value={capture[group][key]} onChange={next => updateCapture(group, key, next)} />
  }
  return <section className="space-y-4 rounded-[18px] border border-[#dce6f2] bg-white p-4">
    <div><h4 className="text-base font-semibold text-[#243d56]">Mandate details</h4><p className="mt-1 text-sm text-[#607387]">Save incomplete details as a draft. Agree the price, dates, fee and protection period before preparing a mandate.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Input label="Mandate type" options={ [['', 'Not captured'], ['sole', 'Exclusive'], ['open', 'Open'], ['dual', 'Dual']] } value={terms.mandateType} onChange={next => update('mandateType', next)} />
      <Input label="Asking price (Rand)" kind="number" value={terms.askingPrice} onChange={next => update('askingPrice', next)} />
      {terms.mandateType === 'dual' ? <Input label="Second agency name" value={terms.otherAgencyName} onChange={next => update('otherAgencyName', next)} /> : null}
      {terms.mandateType === 'open' ? <Input label="Open mandate duration" options={ [['fixed', 'Agreed end date'], ['until_cancelled', 'Until cancelled in writing']] } value={terms.mandateDuration} onChange={next => update('mandateDuration', next)} /> : null}
      <Input label="Mandate start date" kind="date" value={terms.startDate} onChange={next => update('startDate', next)} />
      {terms.mandateType !== 'open' || terms.mandateDuration === 'fixed' ? <Input label="Mandate end date" kind="date" value={terms.endDate} onChange={next => update('endDate', next)} /> : null}
      <Input label="Protection period (calendar days; 0 means none)" kind="number" value={terms.protectionPeriod} onChange={next => update('protectionPeriod', next)} />
      <Input label={terms.mandateType === 'dual' ? 'Combined seller commission basis' : 'Commission basis'} options={ [['', 'Not captured'], ['percentage', 'Percentage'], ['fixed', 'Fixed Rand amount']] } value={terms.commissionBasis} onChange={next => update('commissionBasis', next)} />
      {terms.commissionBasis === 'percentage' ? <Input label="Commission percentage" kind="number" value={terms.commissionPercentage} onChange={next => update('commissionPercentage', next)} /> : null}
      {terms.commissionBasis === 'fixed' ? <Input label="Fixed commission (Rand)" kind="number" value={terms.commissionAmount} onChange={next => update('commissionAmount', next)} /> : null}
      <Input label="Commission VAT treatment" options={MANDATE_VAT_OPTIONS} value={terms.vatHandling} onChange={next => update('vatHandling', next)} />
      <Input label="Special conditions" kind="textarea" value={terms.specialConditions} onChange={next => update('specialConditions', next)} />
    </div>
    {!capture && allowExtendedCapture ? <div className="border-t border-[#dce6f2] pt-4"><Button type="button" variant="secondary" onClick={() => update('mandateCapture', normalizeSellerMandateCapture({}))}>Capture revised mandate schedules</Button><p className="mt-2 text-sm text-[#607387]">Add agency identities, authority, marketing, exclusions, expenses and notice contacts for the revised mandate.</p></div> : null}
    {capture ? <fieldset disabled={captureReadOnly} className="space-y-4">
      <p className="rounded-lg bg-[#f3f7fb] p-3 text-sm text-[#425b74]">The full mandate layout is available for review. Signing requires approval of the exact wording and agency schedules. Certificate references record supplied evidence; they do not confirm verification.</p>
      <details className="rounded-xl border border-[#dce6f2] p-4">
        <summary className="cursor-pointer font-semibold text-[#243d56]">Mandate acceptance evidence review</summary>
        <p className="mt-3 text-sm text-[#607387]">Record these checks after examining the documents. For Dual, check both contracting agencies and their responsible practitioners.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[['reviewedBy', 'Evidence reviewer'], ['authorityReference', 'Checked owner / representative authority reference'], ['disclosureReference', 'Completed signed defects disclosure reference']].map(([key, label]) => <Input key={key} label={label} value={evidenceReview[key]} onChange={next => updateEvidence(key, next)} />)}
        </div>
        <div className="my-4 space-y-3">{[['authorityVerified', 'Authority documents checked'], ['disclosureVerified', 'Completed signed disclosure checked'], ['ffcVerified', 'All contracting business and practitioner FFC records checked']].map(([key, label]) => <label key={key} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={evidenceReview[key] === true} onChange={event => updateEvidence(key, event.target.checked)} />{label}</label>)}</div>
        <Button type="button" variant="secondary" disabled={!evidenceReview.reviewedBy || !evidenceReview.authorityReference || !evidenceReview.disclosureReference || !evidenceReview.authorityVerified || !evidenceReview.disclosureVerified || !evidenceReview.ffcVerified} onClick={async () => {
          const agencySchedulesDigest = await mandateAgencySchedulesDigest(terms)
          update('mandateAcceptanceReview', { ...evidenceReview, agencySchedulesDigest, reviewedAt: new Date().toISOString() })
        }}>Record checked mandate evidence</Button>
        {evidenceReview.reviewedAt ? <p className="mt-2 text-sm text-[#607387]">Recorded {evidenceReview.reviewedAt}. Changes to agency schedules require a fresh check.</p> : null}
      </details>
      {(terms.mandateType === 'dual' ? ['agencyA', 'agencyB'] : ['agencyA']).map(group => <details key={group} className="rounded-xl border border-[#dce6f2] p-4">
        <summary className="cursor-pointer font-semibold text-[#243d56]">{group === 'agencyA' ? terms.mandateType === 'dual' ? 'Agency A' : 'Contracting agency' : 'Agency B'} — identity, certificates and notices</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{MANDATE_AGENCY_FIELDS.map(field => captureInput(group, field))}</div>
      </details>)}
      {MANDATE_CAPTURE_GROUPS.map(group => <details key={group.key} className="rounded-xl border border-[#dce6f2] p-4">
        <summary className="cursor-pointer font-semibold text-[#243d56]">{group.label}</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label={`${group.label} status`} options={group.key === 'marketing' ? MANDATE_CAPTURE_STATUS_OPTIONS.filter(([key]) => !key || key === 'captured') : group.key === 'authority' ? MANDATE_CAPTURE_STATUS_OPTIONS.filter(([key]) => key !== 'none' && (key !== 'not_applicable' || ['individual', 'married', 'foreign_individual', 'multiple_owners'].includes(ownershipType))) : MANDATE_CAPTURE_STATUS_OPTIONS} value={capture[group.key].status} onChange={next => updateCapture(group.key, 'status', next)} />
          {group.key === 'authority' ? captureInput(group.key, group.fields[0]) : null}
          {capture[group.key].status === 'captured' ? group.fields.filter(([key]) => group.key !== 'authority' || key !== 'capacity').map(field => captureInput(group.key, field)) : null}
        </div>
      </details>)}
      {terms.mandateType === 'dual' ? <details className="rounded-xl border border-[#dce6f2] p-4">
        <summary className="cursor-pointer font-semibold text-[#243d56]">Dual commission allocation</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label="Agreed allocation rule" options={ [['', 'Not captured'], ['effective_cause', 'Effective agency receives the fee'], ['agreed_split', 'Agreed allocation in an annexure']] } value={capture.allocation.rule} onChange={next => updateCapture('allocation', 'rule', next)} />
          {capture.allocation.rule === 'agreed_split' ? [['agencyAPercentage', 'Agency A share (%)', 'number'], ['agencyBPercentage', 'Agency B share (%)', 'number'], ['details', 'Allocation instructions', 'textarea'], ['annexureReference', 'Allocation annexure reference']].map(field => captureInput('allocation', field)) : null}
          {[['agencyAVatHandling', 'Agency A portion VAT', 'vat'], ['agencyBVatHandling', 'Agency B portion VAT', 'vat']].map(field => captureInput('allocation', field))}
        </div>
      </details> : null}
      <details className="rounded-xl border border-[#dce6f2] p-4">
        <summary className="cursor-pointer font-semibold text-[#243d56]">Seller notice contacts</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{[['sellerEmail', 'Seller notice email', 'email'], ['sellerAddress', 'Seller notice address']].map(field => captureInput('notices', field))}</div>
      </details>
    </fieldset> : null}
  </section>
}
