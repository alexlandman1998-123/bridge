import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Building2, FileText, Loader2, MapPin, UserRound } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import RentalApplicationDecisionPanel from '../../modules/rentals/shared/applications/RentalApplicationDecisionPanel.jsx'
import RentalApplicationScreeningPanel from '../../modules/rentals/shared/applications/RentalApplicationScreeningPanel.jsx'
import RentalApplicationTenancyConversionPanel from '../../modules/rentals/shared/applications/RentalApplicationTenancyConversionPanel.jsx'
import { getRentalApplicationReview } from '../../services/rentals/rentalApplicationRepository.js'

const TABS = ['Overview', 'Documents', 'Screening', 'Decision']
const text = (value) => String(value ?? '').trim()
const title = (value) => text(value).replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Draft'
const statusTone = (status) => status === 'approved' ? 'border-[#cfe8dc] bg-[#effaf3] text-[#26724c]' : status === 'declined' ? 'border-[#f1cdc8] bg-[#fff5f4] text-[#9f3028]' : status === 'submitted' ? 'border-[#d8e5f5] bg-[#eff6ff] text-[#2563a4]' : 'border-[#efdcb7] bg-[#fff9ec] text-[#8a641d]'
const nameOf = (application = {}) => { const identity = application.data?.identity || {}; return text(`${identity.firstName || ''} ${identity.lastName || ''}`) || text(application.data?.tenantName) || 'Applicant pending' }
const applicationImage = (application = {}) => { const property = application.data?.property || {}; return text(property.imageUrl || property.image_url || property.coverImageUrl || property.cover_image_url || property.photoUrl || property.photo_url || application.data?.imageUrl) }
const rent = (application = {}) => { const property = application.data?.property || {}; const rental = application.data?.rentalInfo || application.data?.rental || {}; const amount = Number(property.monthlyRent || property.monthly_rent || rental.monthlyRent || rental.monthly_rent || application.data?.monthlyRent || 0); return amount > 0 ? `R ${amount.toLocaleString('en-ZA', { maximumFractionDigits: 0 })} / month` : 'Rent pending' }
function Field({ label, value }) { return <div className="rounded-xl bg-[#f8fbff] px-3 py-3"><p className="text-[.65rem] font-semibold uppercase tracking-[.08em] text-[#7b8ca2]">{label}</p><p className="mt-1 text-sm font-semibold text-[#20364d]">{value || 'Not provided'}</p></div> }

export default function RentalApplicationDetailPage() {
  const { applicationId } = useParams()
  const workspace = useWorkspace()
  const organisationId = useMemo(() => text(workspace.workspace?.id || workspace.currentMembership?.organisation_id), [workspace])
  const [application, setApplication] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('Overview')

  const load = useCallback(async () => {
    try {
      setLoading(true); setError('')
      const next = await getRentalApplicationReview(applicationId)
      setApplication(next)
      if (!next) setError('This application is unavailable in your current workspace.')
    } catch (reason) { setError(reason?.message || 'Unable to load this application.') } finally { setLoading(false) }
  }, [applicationId])
  useEffect(() => { void load() }, [load])

  if (loading) return <main className="mx-auto grid min-h-56 w-full max-w-[1600px] place-items-center py-6 text-sm text-[#60758b]"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Loading application…</span></main>
  if (!application) return <main className="mx-auto w-full max-w-[1600px] py-2"><Link to="/agent/rentals/applications" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1769d1]"><ArrowLeft size={15} />Back to applications</Link><p className="mt-5 rounded-xl border border-dashed border-[#d8e4f0] bg-white p-8 text-sm text-[#60758b]">{error || 'Application unavailable.'}</p></main>

  const identity = application.data?.identity || {}
  const employment = application.data?.employment || {}
  const income = application.data?.income || {}
  const property = application.data?.property || {}
  const photo = applicationImage(application)
  const address = text(property.address || property.addressLine || property.name) || 'Property details pending'
  const content = tab === 'Overview'
    ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><Field label="Email" value={identity.email || application.data?.contact?.email} /><Field label="Phone" value={identity.phone || application.data?.contact?.phone} /><Field label="Employment" value={employment.employer || employment.status} /><Field label="Monthly income" value={income.monthlyIncome ? `R ${Number(income.monthlyIncome).toLocaleString('en-ZA')}` : ''} /><Field label="Occupation date" value={property.occupationDate} /><Field label="Received" value={application.submittedAt ? new Date(application.submittedAt).toLocaleDateString() : ''} /></div>
    : tab === 'Documents'
      ? <div className="grid gap-3 sm:grid-cols-2">{application.documents?.length ? application.documents.map((document) => <Field key={document.id} label={document.type} value={title(document.status)} />) : <p className="text-sm text-[#60758b]">No documents have been attached yet.</p>}<div className="sm:col-span-2 rounded-xl border border-dashed border-[#d8e4f0] p-3 text-sm text-[#60758b]">Consents: {application.consents?.length ? application.consents.map((consent) => consent.type).join(', ') : 'none recorded'}</div></div>
      : tab === 'Screening'
        ? <RentalApplicationScreeningPanel application={application} organisationId={organisationId} />
        : <><RentalApplicationDecisionPanel application={application} onDecision={() => void load()} /><RentalApplicationTenancyConversionPanel application={application} onConverted={() => void load()} /></>

  return <main className="mx-auto w-full max-w-[1600px] py-2"><section className="space-y-4 pb-6"><Link to="/agent/rentals/applications" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1769d1]"><ArrowLeft size={15} />Back to applications</Link><section className="overflow-hidden rounded-[20px] border border-[#dfe7f0] bg-white shadow-[0_16px_36px_rgba(15,23,42,.055)]"><div className="grid border-b border-[#edf2f7] lg:grid-cols-[220px_minmax(0,1fr)]"><div className="relative min-h-[150px] bg-[linear-gradient(135deg,#dbe9f5,#f7fafc)]">{photo ? <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[#6e8baa]"><Building2 size={34} /></span>}</div><div className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#edf5ff] text-[#315f8f]"><UserRound size={20} /></span><div><p className="text-[.68rem] font-semibold uppercase tracking-[.1em] text-[#7b8ca2]">Rental application</p><h1 className="mt-1 text-xl font-semibold text-[#142132]">{nameOf(application)}</h1><p className="mt-1 flex items-center gap-1.5 text-sm text-[#60758b]"><MapPin size={14} />{address}</p></div></div><span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusTone(application.status)}`}>{title(application.status)}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Field label="Monthly rent" value={rent(application)} /><Field label="Application status" value={title(application.status)} /><Field label="Last updated" value={application.updatedAt ? new Date(application.updatedAt).toLocaleDateString() : 'Recently'} /></div></div></div><div className="flex gap-1 overflow-x-auto border-b border-[#edf2f7] px-4 sm:px-5">{TABS.map((item) => <button type="button" key={item} onClick={() => setTab(item)} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-semibold ${tab === item ? 'border-[#1769d1] text-[#1769d1]' : 'border-transparent text-[#60758b]'}`}>{item}</button>)}</div><div className="p-4 sm:p-5">{content}</div></section></section></main>
}
