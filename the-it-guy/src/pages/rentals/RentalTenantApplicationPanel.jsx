import { FileText, Loader2 } from 'lucide-react'
import { Link } from 'react-router-dom'

const label = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase())
const date = value => value ? new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'
const propertyLabel = vacancy => [vacancy.title, vacancy.unitLabel, vacancy.address].filter(Boolean).join(' · ')

export default function RentalTenantApplicationPanel({ lead, applications, vacancies, vacancyId, onVacancyChange, expiryDays, onExpiryChange, saving, onPrepare, applicationLink, applicationLinkId, onCopy, onShared, onRevoke }) {
  const selected = vacancies.find(item => item.id === vacancyId)
  const existing = applications.find(item => item.vacancyId === vacancyId && item.status !== 'withdrawn')
  const canPrepare = Boolean(selected && (existing || (lead.stage === 'application_pending' && selected.eligible)))
  const choices = vacancies.filter(item => item.eligible || applications.some(application => application.vacancyId === item.id && application.status !== 'withdrawn'))
  const linked = applications.find(item => item.id === applicationLinkId)
  return <section className="ui-panel ui-panel-body">
    <div className="flex items-center gap-2"><FileText size={18} /><h2 className="text-lg font-semibold text-[#18324b]">Linked applications</h2></div>
    <p className="mt-1 text-sm text-[#607891]">Keep the tenant’s answers and uploads with their selected property.</p>
    <div className="mt-4 rounded-xl border border-[#dbe6f2] bg-[#f8fbff] p-4">
      <p className="font-semibold text-[#20364c]">Application setup</p>
      <p className="mt-1 text-sm text-[#607891]">{lead.stage === 'application_pending' ? 'Choose a marketed property, then capture a draft or prepare the tenant’s secure link.' : 'Complete qualification and viewing to reach Application pending. Existing applications can still be opened below.'}</p>
      <label className="form-field mt-3"><span>Application property</span><select value={vacancyId} disabled={saving} onChange={event => onVacancyChange(event.target.value)}>
        <option value="">Choose marketed vacancy</option>
        {choices.map(vacancy => <option key={vacancy.id} value={vacancy.id}>{propertyLabel(vacancy)} · R {Number(vacancy.askingRent || 0).toLocaleString('en-ZA')}{vacancy.eligible ? '' : ' · Existing application'}</option>)}
      </select></label>
      {selected?.listingId ? <Link className="mt-2 inline-block text-sm font-semibold text-[#1f4f78]" to={`/agent/rentals/listings/${selected.listingId}`}>Open selected listing</Link> : null}
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {existing && existing.status !== 'draft' ? <button type="button" disabled={saving} onClick={() => void onPrepare({ invite: false })} className="ui-pill-button ui-pill-button-active">Open existing application</button> : <>
          <label className="form-field"><span>Link validity</span><select value={expiryDays} disabled={saving} onChange={event => onExpiryChange(event.target.value)}>{[1,3,7,14].map(days => <option key={days} value={days}>{days} days</option>)}</select></label>
          <button type="button" disabled={saving || !canPrepare} onClick={() => void onPrepare({ invite: false })} className="ui-pill-button">{existing ? 'Use existing draft' : 'Create application draft'}</button>
          <button type="button" disabled={saving || !canPrepare} onClick={() => void onPrepare()} className="ui-pill-button ui-pill-button-active">{saving ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}Create secure application link</button>
        </>}
      </div>
      {applicationLink && linked?.status === 'draft' ? <div className="mt-3 flex flex-wrap gap-2">
        <input aria-label="Secure tenant application link" readOnly value={applicationLink} className="min-w-0 flex-1 rounded-xl border border-[#cfdbe8] bg-white px-3 py-2 text-xs" />
        <button type="button" onClick={() => void onCopy()} className="ui-pill-button">Copy link</button>
        <button type="button" disabled={saving || Boolean(linked.data?.onboarding?.sentAt)} onClick={() => void onShared()} className="ui-pill-button ui-pill-button-active">{linked.data?.onboarding?.sentAt ? 'Onboarding marked sent' : 'Mark onboarding sent'}</button>
        <p className="w-full text-xs text-[#607891]">Mark sent after sharing this link with the tenant. Creating or copying it does not send it.</p>
      </div> : null}
      {!choices.length ? <p className="mt-3 text-sm text-[#8a641d]">No marketed vacancies are available in this workspace. Complete the landlord listing and vacancy setup first.</p> : null}
    </div>
    <div className="mt-4 grid gap-3">{applications.map(application => {
      const context = vacancies.find(item => item.id === application.vacancyId)
      const listingId = context?.listingId || application.data?.property?.listingId
      const onboarding = application.data?.onboarding
      return <article key={application.id} className="rounded-xl border border-[#dbe6f2] p-4">
        <Link to={`/agent/rentals/applications/${application.id}`} className="flex flex-wrap items-center justify-between gap-3"><p className="font-semibold text-[#20364c]">{application.data?.property?.title || context?.title || `Application ${application.id.slice(0,8)}`}</p><span className="rounded-full bg-[#eff6ff] px-2 py-1 text-xs font-semibold text-[#2563a4]">{label(application.status)}</span></Link>
        <p className="mt-2 text-sm text-[#607891]">{application.data?.property?.address || context?.address}</p>
        {listingId ? <Link to={`/agent/rentals/listings/${listingId}`} className="mt-2 inline-block text-sm font-semibold text-[#1f4f78]">Open rental listing</Link> : null}
        <p className="mt-2 text-xs text-[#7890a8]">Last updated {date(application.updatedAt)}</p>
        {application.submittedAt ? <p className="mt-2 text-sm text-[#26724c]">Submitted {date(application.submittedAt)} · Open the application to review answers and outstanding uploads.</p> : onboarding?.accessId ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#607891]">{onboarding.revokedAt ? 'Invitation revoked' : new Date(onboarding.expiresAt) <= new Date() ? 'Invitation expired' : onboarding.sentAt ? `Shared ${date(onboarding.sentAt)}` : 'Invitation awaiting sharing'} · expires {date(onboarding.expiresAt)}</p>
          {!onboarding.revokedAt && application.status === 'draft' ? <button type="button" disabled={saving} onClick={() => void onRevoke(application)} className="ui-pill-button">Revoke link</button> : null}
        </div> : null}
      </article>
    })}{!applications.length ? <p className="rounded-xl border border-dashed border-[#dbe6f2] p-4 text-sm text-[#607891]">No application is linked to this tenant yet.</p> : null}</div>
  </section>
}
