const text = (value) => String(value ?? '').trim()
const first = (...values) => values.map(text).find(Boolean) || 'Not captured'
const people = (value) => Array.isArray(value) ? value : []
const personName = (person) => first(person.fullName, person.full_name, [person.name || person.firstName || person.first_name, person.surname || person.lastName || person.last_name].filter(Boolean).join(' '))

function ReviewRow({ label, value }) {
  return <div className="grid grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] gap-3 border-b border-[#edf2f7] py-2 last:border-0"><dt className="text-[#607387]">{label}</dt><dd className="min-w-0 break-words font-medium text-[#243d56]">{value}</dd></div>
}

export default function SellerOnboardingAgentReviewPanel({ formData = {}, checklist }) {
  if (!checklist) return null
  const owner = checklist.subject?.legalOwner || {}
  const property = checklist.facts?.property || {}
  const personGroups = [
    ['Co-owners', formData.multipleOwners],
    ['Directors', formData.companyDirectors],
    ['Beneficial owners / controllers', formData.companyBeneficialOwners],
    ['Trust founders', formData.trustFounders],
    ['Trustees', formData.trustees],
    ['Named beneficiaries', formData.trustBeneficiaries],
  ].filter(([, rows]) => people(rows).length)
  return <div className="space-y-4 text-sm">
    <div className={`rounded-[14px] border p-4 ${checklist.ready ? 'border-[#c9e8d5] bg-[#f0faf3]' : 'border-[#f2dfbd] bg-[#fff9ec]'}`}>
      <p className="font-semibold text-[#243d56]">{checklist.ready ? 'Submitted fields ready for agent approval' : 'Complete the missing fields before approval'}</p>
      {checklist.missing.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-[#76551a]">{checklist.missing.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-1 text-[#41634e]">Check the facts below, then record your decision.</p>}
    </div>
    <section className="rounded-[14px] border border-[#dce6f2] bg-white p-4">
      <h4 className="font-semibold text-[#243d56]">Seller and mandate</h4>
      <dl className="mt-2">
        <ReviewRow label="Ownership route" value={first(checklist.subject?.kind?.replaceAll('_', ' '))} />
        <ReviewRow label="Legal owner" value={first(owner.name)} />
        <ReviewRow label="ID / registration" value={first(owner.registrationNumber)} />
        <ReviewRow label="Seller tax number" value={first(formData.sellerTaxNumber, formData.incomeTaxNumber, formData.taxNumber)} />
        <ReviewRow label="SA tax resident" value={first(formData.saResident, formData.taxResident)} />
        <ReviewRow label="Mandate type" value={first(formData.mandateType)} />
        <ReviewRow label="Property address" value={first(property.address, formData.propertyAddress)} />
        <ReviewRow label="Property category" value={first(property.property_category_label, formData.propertyCategory)} />
        <ReviewRow label="Required signer(s)" value={checklist.subject?.signers?.map((signer) => signer.name).filter(Boolean).join(', ') || 'Not captured'} />
      </dl>
    </section>
    <section className="rounded-[14px] border border-[#dce6f2] bg-white p-4">
      <h4 className="font-semibold text-[#243d56]">FICA answers</h4>
      <dl className="mt-2">
        <ReviewRow label="Occupation / activity" value={first(formData.occupation)} />
        <ReviewRow label="Source of funds / wealth" value={first(formData.sourceOfFunds)} />
        <ReviewRow label="Politically exposed" value={first(formData.politicallyExposedPerson)} />
        {text(formData.politicallyExposedPerson).toLowerCase() === 'yes' ? <ReviewRow label="Exposure details" value={first(formData.politicallyExposedDetails)} /> : null}
        {text(formData.trustBeneficiaryClass) ? <ReviewRow label="Trust beneficiary class" value={formData.trustBeneficiaryClass} /> : null}
      </dl>
    </section>
    {personGroups.length ? <section className="rounded-[14px] border border-[#dce6f2] bg-white p-4">
      <h4 className="font-semibold text-[#243d56]">People in the seller structure</h4>
      <div className="mt-3 space-y-3">{personGroups.map(([title, rows]) => <div key={title}><p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#6f839c]">{title}</p><ul className="mt-1 space-y-1">{people(rows).map((person, index) => <li key={person.id || `${title}-${index}`} className="rounded-lg bg-[#f8fbff] px-3 py-2 text-[#435b73]">{personName(person)} · {first(person.idNumber, person.id_number)} · {first(person.nationality)} · {first(person.residentialAddress, person.residential_address)}</li>)}</ul></div>)}</div>
    </section> : null}
    {checklist.followUps.length ? <section className="rounded-[14px] border border-[#dce6f2] bg-[#f8fbff] p-4">
      <h4 className="font-semibold text-[#243d56]">FICA and disclosure follow-up</h4>
      <p className="mt-1 text-[#607387]">These items need evidence or later compliance review. Approval of the submitted fields does not mark FICA complete.</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[#47637d]">{checklist.followUps.map((item) => <li key={item}>{item}</li>)}</ul>
    </section> : null}
  </div>
}
