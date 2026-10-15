import { Building2, CheckCircle2, ChevronRight, Circle, FileText, Link2, Loader2, Mail, Pencil, Phone, RefreshCw, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import ListingDocumentActions from '../../components/documents/ListingDocumentActions'
import { RENTAL_SELECT_OPTIONS } from '../../services/rentals/rentalListingDraftModel'
import { buildRentalListingEditForm } from '../../services/rentals/rentalListingEditModel'
import { listingLandlordOnboardingProgress, listingLandlordValues } from '../../services/rentals/rentalListingLandlordModel'
import { LANDLORD_CONDITIONAL_OPTIONS } from '../../services/rentals/rentalLandlordOnboardingModel'

const card = 'rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.04)]'
const text = (value) => String(value ?? '').trim()
const valueLabel = (value) => text(value) ? text(value).replaceAll('_', ' ') : 'Not captured'
const choiceLabel = (key, value) => LANDLORD_CONDITIONAL_OPTIONS[key]?.find(([id]) => id === value)?.[1] || valueLabel(value)
function Rows({ entries }) {
  return <dl className="mt-4 divide-y divide-[#edf2f7]">{entries.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-2 sm:gap-3"><dt className="text-xs font-medium text-[#607387]">{label}</dt><dd className="min-w-0 break-words text-sm font-semibold text-[#243d56]">{value && typeof value === 'object' ? value : valueLabel(value)}</dd></div>)}</dl>
}
export default function RentalListingLandlordProfile({ listing, onboarding, linkedLead, loading, busy, onboardingError, onEdit, onContinue, onStart, onCreateLink, onRequestChanges, onRefresh }) {
  const values = listingLandlordValues(listing, onboarding)
  const form = buildRentalListingEditForm(listing)
  const profile = onboarding?.data?.profile || {}
  const property = onboarding?.data?.portfolio?.find((item) => item.listingId === listing.id) || {}
  const progress = listingLandlordOnboardingProgress(onboarding, listing.id)
  const type = RENTAL_SELECT_OPTIONS.landlordType.find((option) => option.value === values.landlordType)?.label || 'Landlord type not captured'
  const initials = values.landlordName.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  const submitted = onboarding?.status === 'submitted'
  const disabled = loading || Boolean(busy)
  return <div className="space-y-5">
    <article className={card}>
      <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-[#073f30] text-lg font-semibold text-white">{initials || <Building2 size={24} />}</div><div className="min-w-0"><h2 className="break-words text-2xl font-semibold tracking-[-0.03em] text-[#142132]">{values.landlordName || 'Landlord profile'}</h2><p className="mt-1 text-sm font-semibold text-[#607387]">{type}</p><p className="mt-2 break-words text-sm text-[#425970]">{form.propertyAddress || 'Property address not captured'}</p></div></div><ListingDocumentActions label="Landlord profile"><Button size="sm" variant="secondary" disabled={disabled || submitted || Boolean(onboardingError)} onClick={onEdit}><Pencil size={15} />Edit contact</Button>{linkedLead ? <Link className="flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#243d56] hover:bg-[#f8fbfd]" to={`/agent/rentals/pipeline/leads/${encodeURIComponent(linkedLead.id)}`}><UserRound size={15} />Open landlord lead</Link> : null}<Button size="sm" variant="secondary" disabled={disabled} onClick={onRefresh}><RefreshCw size={15} />Refresh landlord details</Button></ListingDocumentActions></div>
      <div className="mt-5 grid gap-4 border-t border-[#e5edf6] pt-4 sm:grid-cols-3">{[['Monthly rent', form.monthlyRent === '' ? 'Not captured' : `R ${Number(form.monthlyRent).toLocaleString('en-ZA')} per month`], ['Landlord onboarding', loading ? 'Loading…' : onboardingError ? 'Unavailable' : submitted ? 'Submitted' : onboarding ? 'Draft' : 'Not started'], ['Basic details captured', progress ? `${progress.captured} of ${progress.total}` : '—']].map(([label, value]) => <div key={label}><p className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-[#8294aa]">{label}</p><p className="mt-1 text-base font-semibold text-[#142132]">{value}</p>{label === 'Basic details captured' && progress ? <div className="mt-2 h-1.5 max-w-64 overflow-hidden rounded-full bg-[#e5edf6]" role="progressbar" aria-label="Landlord details captured" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><div className="h-full rounded-full bg-[#168452]" style={{width:`${progress.percent}%`}} /></div> : null}</div>)}</div>
    </article>
    <div className="grid items-start gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <article className={card}><header className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-[#142132]">Contact details</h3><Button variant="ghost" size="sm" disabled={disabled || submitted || Boolean(onboardingError)} onClick={onEdit}><Pencil size={14} />Edit</Button></header><Rows entries={[
          ['Name', values.landlordName],
          ['Email', values.landlordEmail ? <a className="inline-flex max-w-full items-center gap-2 break-all text-[#1f4f78]" href={`mailto:${values.landlordEmail}`}><Mail size={14} className="shrink-0" />{values.landlordEmail}</a> : 'Not captured'],
          ['Phone', values.landlordPhone ? <a className="inline-flex items-center gap-2 text-[#1f4f78]" href={`tel:${values.landlordPhone}`}><Phone size={14}/>{values.landlordPhone}</a> : 'Not captured'],
          ['Residential / registered address', profile.residentialAddress],
        ]} /></article>
        <article className={card}><h3 className="text-base font-semibold text-[#142132]">Ownership & rental details</h3><Rows entries={[
          ['Landlord type', type], ['Ownership / title type', property.ownershipType ? valueLabel(property.ownershipType).replace(/^./,letter=>letter.toUpperCase()) : 'Not captured'], ['Rental service', choiceLabel('serviceType',property.serviceType)], ['Property scheme', choiceLabel('schemeType',property.schemeType)],
          ...(['company','close_corporation','trust','other_entity'].includes(values.landlordType) ? [['Registration number', profile.registrationNumber], ['Authorised signatory', profile.authorisedSignatoryName], ['Signing capacity', profile.authorisedSignatoryCapacity]] : []),
          ...((profile.people || []).length ? [['Co-owners / representatives', profile.people.map(person => person.name).filter(Boolean).join(', ')]] : []),
        ]} /></article>
      </div>
      <article className={card}><header className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-[#142132]">Landlord onboarding</h3>{loading || busy ? <Loader2 size={18} className="animate-spin text-[#607387]" /> : <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${submitted ? 'border-[#d8eddf] bg-[#ecfaf1] text-[#1f7d44]' : 'border-[#dbe4ef] bg-[#f8fbff] text-[#48627f]'}`}>{onboardingError ? 'Unavailable' : submitted ? 'Submitted' : onboarding ? 'Draft' : 'Not started'}</span>}</header>
        {onboardingError ? <p className="mt-4 text-sm text-red-700" role="alert">{onboardingError}</p> : <>
          <p className="mt-3 text-sm leading-6 text-[#607387]">{submitted ? 'The landlord submitted these details. Request corrections to reopen them.' : onboarding ? 'Continue the saved landlord details, ownership and rental information.' : 'Start with the landlord and property details already saved on this listing.'}</p>
          {progress ? <div className="mt-4 divide-y divide-[#edf2f7]">{progress.sections.map(section => <div key={section.label} className="flex items-center justify-between gap-3 py-3"><span className="text-sm font-semibold text-[#425970]">{section.label}</span><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${section.complete ? 'text-[#257044]' : 'text-[#607387]'}`}>{section.complete ? <CheckCircle2 size={15}/> : <Circle size={15}/>}{section.complete ? 'Captured' : 'Not captured'}</span></div>)}</div> : null}
          <div className="mt-5 flex flex-wrap gap-2">{onboarding ? submitted ? <Button size="sm" variant="secondary" disabled={disabled} onClick={onRequestChanges}>Request corrections</Button> : <Button size="sm" disabled={disabled} onClick={onContinue}><UserRound size={15}/>Continue landlord onboarding</Button> : <Button size="sm" disabled={disabled} onClick={onStart}><UserRound size={15}/>Start landlord onboarding</Button>}{onboarding ? <Button size="sm" variant="secondary" disabled={disabled} onClick={onCreateLink}><Link2 size={15}/>Create secure link</Button> : null}</div>
        </>}
        <div className="mt-5 flex items-start justify-between gap-3 border-t border-[#e5edf6] pt-4"><div className="flex gap-3"><FileText size={18} className="mt-1 shrink-0 text-[#52708d]"/><div><p className="text-sm font-semibold text-[#243d56]">Landlord documents</p><p className="mt-1 text-xs text-[#607387]">{progress?.documents.total ? `${progress.documents.approved} of ${progress.documents.total} required documents approved` : 'Upload and review landlord evidence in Documents.'}</p></div></div><Link to={`/agent/rentals/listings/${encodeURIComponent(listing.id)}/documents`} className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-[#1f4f78]">Open Documents<ChevronRight size={14}/></Link></div>
      </article>
    </div>
  </div>
}
