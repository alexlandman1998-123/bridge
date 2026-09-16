import { Bell, CalendarDays, CheckCircle2, ChevronRight, CircleHelp, Clock3, FileUp, House, MessageCircle, ReceiptText, Send, Wrench } from 'lucide-react'

const money = (value) => Number.isFinite(Number(value))
  ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(value)).replace('ZAR', 'R')
  : 'Not available'
const longDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not available'
const shortDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : ''

function greeting(name = '') {
  const hour = new Date().getHours()
  const salutation = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return `${salutation}${name ? `, ${name.split(' ')[0]}` : ''}`
}

function leaseStatus(lease = {}) {
  const end = lease.endsOn ? new Date(`${lease.endsOn}T12:00:00`) : null
  const days = end ? Math.ceil((end.getTime() - Date.now()) / 86400000) : null
  if (lease.status === 'ended' || (days !== null && days < 0)) return 'Ended'
  if (lease.status === 'renewal_pending') return 'Renewal pending'
  if (days !== null && days <= 60) return 'Ending soon'
  if (lease.status === 'upcoming') return 'Upcoming'
  return 'Active'
}

function Card({ children, className = '' }) {
  return <section className={`rounded-[22px] border border-[#e8dfd2] bg-white p-5 shadow-[0_10px_30px_rgba(7,30,26,.055)] sm:p-6 ${className}`.trim()}>{children}</section>
}

function CardHeading({ icon: Icon, title, action, tone = 'green' }) {
  const iconClass = tone === 'amber' ? 'bg-[#fff2df] text-[#9d5a0c]' : 'bg-[#e7f6ee] text-[#176b50]'
  return <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span className={`grid h-10 w-10 place-items-center rounded-full ${iconClass}`}><Icon size={18} /></span><h2 className="text-base font-semibold tracking-[-.025em] text-[#071e1a]">{title}</h2></div>{action}</div>
}

function TextAction({ children, onClick, disabled = false }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-[#07533d] underline decoration-[#9acbb7] underline-offset-4 transition hover:text-[#031011] focus:outline-none focus:ring-2 focus:ring-[#64b992] disabled:cursor-not-allowed disabled:text-[#8b938e] disabled:no-underline">{children}<ChevronRight size={16} /></button>
}

export default function TenantPortalHome({ data = {}, onNavigate, branding = {} }) {
  const tenancy = data.tenancy || {}; const lease = data.lease || {}; const property = data.property || {}; const requests = data.requests || []
  const openRequests = requests.filter((request) => !['completed', 'closed', 'cancelled', 'resolved'].includes(String(request.status || '').toLowerCase()))
  const latestRequest = openRequests[0] || null
  const name = tenancy.tenantName || ''
  const status = leaseStatus(lease)
  const propertyTitle = [property.name, property.unitLabel].filter(Boolean).join(' · ') || 'Your home'
  const address = [property.addressLine1, property.suburb, property.city].filter(Boolean).join(', ')
  const image = branding.samplePropertyImageUrl || ''
  const hasPaymentData = Boolean(data.payment)
  const activity = [...requests].slice(0, 3)

  return <div className="mx-auto max-w-[1440px] space-y-5 pb-4 sm:space-y-6">
    <header className="flex items-start justify-between gap-4 pt-1 sm:items-center">
      <div><h1 className="font-serif text-3xl font-semibold tracking-[-.045em] text-[#071e1a] sm:text-[2.55rem]">{greeting(name)}</h1><p className="mt-1 text-base text-[#5f665f] sm:text-lg">Here’s what’s happening with your home.</p></div>
      <button type="button" aria-label="Notifications" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#e8dfd2] bg-white text-[#07533d] shadow-sm transition hover:bg-[#f3fbf6] focus:outline-none focus:ring-2 focus:ring-[#64b992]"><Bell size={19} /></button>
    </header>

    <Card className="overflow-hidden p-0">
      <div className="grid lg:grid-cols-[minmax(250px,.72fr)_minmax(0,1.5fr)]">
        <div className="min-h-[190px] bg-[#e8efe9]">{image ? <img src={image} alt={propertyTitle} className="h-full min-h-[190px] w-full object-cover" /> : <div className="flex h-full min-h-[190px] items-end bg-[radial-gradient(circle_at_80%_15%,#bde3cf,transparent_42%),linear-gradient(135deg,#dceade,#f8f3ea)] p-6"><House className="text-[#176b50]" size={38} /><span className="ml-3 text-sm font-semibold text-[#275444]">Your rental home</span></div>}</div>
        <div className="flex flex-col justify-between gap-5 p-5 sm:p-7"><div><h2 className="font-serif text-2xl font-semibold tracking-[-.035em] text-[#071e1a]">{propertyTitle}</h2><p className="mt-2 text-sm text-[#5f665f] sm:text-base">{address || 'Your property address will appear here.'}</p></div><div className="grid gap-4 border-t border-[#eee6dc] pt-4 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-end"><div><p className="text-xs font-medium text-[#6a736c]">Lease status</p><span className="mt-2 inline-flex rounded-full bg-[#e3f5eb] px-3 py-1 text-sm font-semibold text-[#176b50]">{status}</span></div><div><p className="text-xs font-medium text-[#6a736c]">Lease dates</p><p className="mt-2 text-sm font-semibold text-[#1f2a25]">{longDate(lease.startsOn)} – {longDate(lease.endsOn)}</p></div><TextAction onClick={() => onNavigate('lease')}>View my home</TextAction></div></div>
      </div>
    </Card>

    <div className="grid gap-5 lg:grid-cols-10">
      <Card className="order-2 bg-[linear-gradient(135deg,#f8fffa,#e5f8ed)] lg:order-1 lg:col-span-3"><CardHeading icon={ReceiptText} title="Rent status" /><p className="mt-6 text-sm font-medium text-[#53645a]">Monthly rent</p><p className="mt-1 font-serif text-4xl font-semibold tracking-[-.05em] tabular-nums text-[#071e1a]">{money(lease.monthlyRent)}</p>{hasPaymentData ? <p className="mt-3 text-sm text-[#176b50]">Payment information is available.</p> : <div className="mt-5 border-t border-[#b8dec8] pt-4"><p className="text-sm font-medium text-[#334a3d]">Payment records are not connected yet.</p><p className="mt-1 text-xs leading-5 text-[#607166]">Please use the payment instructions supplied by your rental team.</p></div>}</Card>
      <Card className="order-1 lg:order-2 lg:col-span-4"><CardHeading icon={Clock3} title="Needs your attention" tone={latestRequest ? 'amber' : 'green'} action={latestRequest ? <TextAction onClick={() => onNavigate('maintenance')}>View request</TextAction> : null} />{latestRequest ? <div className="mt-5 rounded-2xl bg-[#fffaf3] p-4"><p className="font-semibold text-[#31271b]">Your {String(latestRequest.request_type || 'support').replaceAll('_', ' ')} request is {String(latestRequest.status || 'submitted').replaceAll('_', ' ')}.</p><p className="mt-1 text-sm text-[#6e6457]">Submitted {shortDate(latestRequest.submitted_at)}. Your rental team will update you here.</p></div> : <div className="mt-5 flex gap-3 rounded-2xl bg-[#f3fbf6] p-4"><CheckCircle2 className="mt-0.5 shrink-0 text-[#237856]" size={20} /><div><p className="font-semibold text-[#173f2e]">You’re all caught up</p><p className="mt-1 text-sm text-[#537064]">There’s nothing requiring your attention.</p></div></div>}</Card>
      <Card className="order-3 lg:col-span-3"><CardHeading icon={Wrench} title="Quick actions" /><div className="mt-5 grid grid-cols-3 gap-2"><button onClick={() => onNavigate('maintenance')} type="button" className="min-h-[116px] rounded-2xl border border-[#e8dfd2] p-3 text-center text-sm font-semibold text-[#18352b] transition hover:border-[#87c5a7] hover:bg-[#f5fcf7] focus:outline-none focus:ring-2 focus:ring-[#64b992]"><Wrench className="mx-auto mb-3 text-[#176b50]" size={22} />Report an issue</button><button onClick={() => onNavigate('messages')} type="button" className="min-h-[116px] rounded-2xl border border-[#e8dfd2] p-3 text-center text-sm font-semibold text-[#18352b] transition hover:border-[#87c5a7] hover:bg-[#f5fcf7] focus:outline-none focus:ring-2 focus:ring-[#64b992]"><MessageCircle className="mx-auto mb-3 text-[#176b50]" size={22} />Send a message</button><button onClick={() => onNavigate('documents')} type="button" className="min-h-[116px] rounded-2xl border border-[#e8dfd2] p-3 text-center text-sm font-semibold text-[#18352b] transition hover:border-[#87c5a7] hover:bg-[#f5fcf7] focus:outline-none focus:ring-2 focus:ring-[#64b992]"><FileUp className="mx-auto mb-3 text-[#176b50]" size={22} />View documents</button></div></Card>
    </div>

    <div className="grid gap-5 lg:grid-cols-3">
      <Card><CardHeading icon={Wrench} title="Maintenance" action={<TextAction onClick={() => onNavigate('maintenance')}>{latestRequest ? 'View request' : 'Report an issue'}</TextAction>} />{latestRequest ? <div className="mt-5"><p className="text-xs font-medium text-[#6a736c]">Latest request</p><p className="mt-1 font-semibold text-[#14241d]">{latestRequest.message || 'Maintenance request'}</p><div className="mt-4 h-2 rounded-full bg-[#e5ece6]"><div className="h-full w-1/2 rounded-full bg-[#64b992]" /></div><p className="mt-2 text-xs text-[#607166]">{String(latestRequest.status || 'Submitted').replaceAll('_', ' ')}</p></div> : <p className="mt-5 text-sm leading-6 text-[#607166]">No open maintenance requests. If something needs attention, let your rental team know.</p>}</Card>
      <Card><CardHeading icon={CalendarDays} title="Upcoming" />{lease.endsOn ? <div className="mt-5 flex gap-3 rounded-2xl bg-[#faf7f2] p-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-center text-xs font-semibold text-[#176b50]">{shortDate(lease.endsOn)}</span><div><p className="font-semibold text-[#1b2922]">Lease end date</p><p className="mt-1 text-sm text-[#607166]">Your current lease ends on {longDate(lease.endsOn)}.</p></div></div> : <p className="mt-5 text-sm leading-6 text-[#607166]">There are no upcoming dates available yet.</p>}</Card>
      <Card><CardHeading icon={ReceiptText} title="Recent activity" />{activity.length ? <div className="mt-4 divide-y divide-[#eee6dc]">{activity.map((request) => <div key={request.id} className="flex gap-3 py-3 first:pt-0"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e7f6ee] text-[#176b50]"><Wrench size={15} /></span><div><p className="text-sm font-semibold text-[#1b2922]">Request {String(request.status || 'submitted').replaceAll('_', ' ')}</p><p className="mt-0.5 text-xs text-[#607166]">{shortDate(request.submitted_at)}</p></div></div>)}</div> : <p className="mt-5 text-sm leading-6 text-[#607166]">Your recent updates will appear here.</p>}</Card>
    </div>

    <section className="flex flex-col justify-between gap-3 rounded-[20px] border border-[#c9e7d6] bg-[#eaf8ef] px-5 py-4 sm:flex-row sm:items-center sm:px-6"><div className="flex gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-[#176b50]"><CircleHelp size={19} /></span><div><p className="font-semibold text-[#173f2e]">Need help?</p><p className="text-sm text-[#527263]">Send your rental team a message.</p></div></div><button type="button" onClick={() => onNavigate('messages')} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#07533d] px-4 text-sm font-semibold text-white transition hover:bg-[#031011] focus:outline-none focus:ring-2 focus:ring-[#64b992] focus:ring-offset-2"><Send size={16} />Message the team</button></section>
  </div>
}
