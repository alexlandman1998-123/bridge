import { Bell, CalendarDays, CheckCircle2, ChevronRight, CircleHelp, Clock3, FileUp, House, MessageCircle, ReceiptText, Send, Wrench } from 'lucide-react'

const money = (value) => Number.isFinite(Number(value))
  ? new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(value)).replace('ZAR', 'R')
  : 'Not available'
const longDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not available'
const shortDate = (value) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }) : ''
const dateTile = (value) => {
  if (!value) return null
  const valueDate = new Date(`${value}T12:00:00`)
  return <><span className="text-sm leading-none">{valueDate.getDate()}</span><span className="mt-0.5 text-[0.65rem] uppercase leading-none">{valueDate.toLocaleDateString('en-ZA', { month: 'short' })}</span></>
}

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

function Card({ children, className = '', style }) {
  return <section style={style} className={`rounded-[16px] border border-[#e5e7eb] bg-white p-4 shadow-[0_6px_18px_rgba(15,23,42,.045)] sm:p-5 ${className}`.trim()}>{children}</section>
}

function CardHeading({ icon: Icon, title, action, tone = 'green' }) {
  const iconStyle = tone === 'amber' ? { backgroundColor: '#fff2df', color: '#9d5a0c' } : { backgroundColor: 'color-mix(in srgb, var(--tenant-accent) 18%, white)', color: 'var(--tenant-primary)' }
  return <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-3"><span style={iconStyle} className="grid h-9 w-9 place-items-center rounded-full"><Icon size={17} /></span><h2 className="text-base font-semibold tracking-[-.025em] text-[#15231e]">{title}</h2></div>{action}</div>
}

function TextAction({ children, onClick, disabled = false }) {
  return <button type="button" disabled={disabled} onClick={onClick} style={{ color: 'var(--tenant-primary)', textDecorationColor: 'var(--tenant-accent)' }} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-1.5 text-sm font-semibold underline underline-offset-4 transition focus:outline-none focus:ring-2 focus:ring-[var(--tenant-accent)] disabled:cursor-not-allowed disabled:text-[#8b938e] disabled:no-underline">{children}<ChevronRight size={16} /></button>
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
  const payment = data.payment || null
  const attention = data.attention || []
  const events = data.events || []
  const activity = data.activity || [...requests].slice(0, 3)
  const themeStyle = { '--tenant-primary': branding.primaryColour || '#071E1A', '--tenant-secondary': branding.secondaryColour || branding.primaryColour || '#031011', '--tenant-accent': branding.accentColour || '#64B992' }

  return <div style={themeStyle} className="mx-auto max-w-[1440px] space-y-4 pb-3 sm:space-y-5">
    <header className="flex items-start justify-between gap-4 pt-1 sm:items-center">
      <div><h1 style={{ color: 'var(--tenant-primary)' }} className="text-3xl font-semibold tracking-[-.045em] sm:text-[2.4rem]">{greeting(name)}</h1><p className="mt-1 text-base text-[#606761] sm:text-lg">Here’s what’s happening with your home.</p></div>
      <button type="button" aria-label="Notifications" style={{ color: 'var(--tenant-primary)' }} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#e5e7eb] bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--tenant-accent)]"><Bell size={18} /></button>
    </header>

    <Card className="overflow-hidden p-0">
      <div className="grid lg:grid-cols-[minmax(250px,.72fr)_minmax(0,1.5fr)]">
        <div style={{ background: 'color-mix(in srgb, var(--tenant-accent) 16%, #f5f5f5)' }} className="min-h-[175px]">{image ? <img src={image} alt={propertyTitle} className="h-full min-h-[175px] w-full object-cover" /> : <div className="flex h-full min-h-[175px] items-end p-5"><House style={{ color: 'var(--tenant-primary)' }} size={34} /><span style={{ color: 'var(--tenant-primary)' }} className="ml-3 text-sm font-semibold">Your rental home</span></div>}</div>
        <div className="flex flex-col justify-between gap-4 p-5 sm:p-6"><div><h2 style={{ color: 'var(--tenant-primary)' }} className="text-2xl font-semibold tracking-[-.035em]">{propertyTitle}</h2><p className="mt-1.5 text-sm text-[#606761] sm:text-base">{address || 'Your property address will appear here.'}</p></div><div className="grid gap-3 border-t border-[#eceff0] pt-3 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-end"><div><p className="text-xs font-medium text-[#6a736c]">Lease status</p><span style={{ backgroundColor: 'color-mix(in srgb, var(--tenant-accent) 18%, white)', color: 'var(--tenant-primary)' }} className="mt-1.5 inline-flex rounded-full px-3 py-1 text-sm font-semibold">{status}</span></div><div><p className="text-xs font-medium text-[#6a736c]">Lease dates</p><p className="mt-1.5 text-sm font-semibold text-[#1f2a25]">{longDate(lease.startsOn)} – {longDate(lease.endsOn)}</p></div><TextAction onClick={() => onNavigate('lease')}>View my home</TextAction></div></div>
      </div>
    </Card>

    <div className="grid gap-4 lg:grid-cols-10">
      <Card style={{ backgroundColor: 'color-mix(in srgb, var(--tenant-accent) 12%, white)' }} className="order-2 lg:order-1 lg:col-span-3"><CardHeading icon={ReceiptText} title="September rent" /><p className="mt-5 text-sm font-medium text-[#53645a]">Monthly rent</p><div className="mt-1 flex items-center justify-between gap-3"><p style={{ color: 'var(--tenant-primary)' }} className="text-4xl font-semibold tracking-[-.05em] tabular-nums">{money(payment?.amount || lease.monthlyRent)}</p>{payment?.status === 'paid' ? <span style={{ backgroundColor: 'color-mix(in srgb, var(--tenant-accent) 24%, white)', color: 'var(--tenant-primary)' }} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold"><CheckCircle2 size={15} />Paid</span> : null}</div>{payment ? <><p className="mt-1.5 text-sm text-[#607166]">Paid on {longDate(payment.paidOn)}</p><div className="mt-4 border-t border-black/10 pt-3"><p className="text-xs text-[#607166]">Next payment</p><p className="mt-1 text-sm font-semibold text-[#26362e]">{money(payment.nextAmount)} due {shortDate(payment.nextDueOn)}</p></div></> : <div className="mt-4 border-t border-black/10 pt-3"><p className="text-sm font-medium text-[#334a3d]">Payment records are not connected yet.</p><p className="mt-1 text-xs leading-5 text-[#607166]">Please use the payment instructions supplied by your rental team.</p></div>}</Card>
      <Card className="order-1 lg:order-2 lg:col-span-4"><CardHeading icon={Clock3} title="Needs your attention" tone={attention.length || latestRequest ? 'amber' : 'green'} action={attention.length ? <TextAction onClick={() => onNavigate('inspections')}>View all</TextAction> : latestRequest ? <TextAction onClick={() => onNavigate('maintenance')}>View request</TextAction> : null} />{attention[0] ? <div className="mt-4 rounded-xl bg-[#fafafa] p-3.5"><p className="font-semibold text-[#252b27]">{attention[0].title}</p><p className="mt-1 text-sm text-[#5d665f]">{shortDate(attention[0].date)}{attention[0].time ? `, ${attention[0].time}` : ''}</p><p className="mt-1 text-sm text-[#6c746e]">{attention[0].detail}</p><div className="mt-3 flex gap-2"><button onClick={() => onNavigate('inspections')} type="button" style={{ backgroundColor: 'var(--tenant-primary)' }} className="min-h-10 rounded-lg px-4 text-sm font-semibold text-white">Confirm</button><button onClick={() => onNavigate('inspections')} type="button" style={{ borderColor: 'var(--tenant-primary)', color: 'var(--tenant-primary)' }} className="min-h-10 rounded-lg border px-4 text-sm font-semibold">Request another time</button></div></div> : latestRequest ? <div className="mt-4 rounded-xl bg-[#fafafa] p-3.5"><p className="font-semibold text-[#31271b]">Your {String(latestRequest.request_type || 'support').replaceAll('_', ' ')} request is {String(latestRequest.status || 'submitted').replaceAll('_', ' ')}.</p><p className="mt-1 text-sm text-[#6e6457]">Submitted {shortDate(latestRequest.submitted_at)}. Your rental team will update you here.</p></div> : <div className="mt-4 flex gap-3 rounded-xl bg-[#fafafa] p-3.5"><CheckCircle2 style={{ color: 'var(--tenant-primary)' }} className="mt-0.5 shrink-0" size={20} /><div><p className="font-semibold text-[#28352e]">You’re all caught up</p><p className="mt-1 text-sm text-[#66716a]">There’s nothing requiring your attention.</p></div></div>}</Card>
      <Card className="order-3 lg:col-span-3"><CardHeading icon={Wrench} title="Quick actions" /><div className="mt-4 grid grid-cols-3 gap-2"><button onClick={() => onNavigate('maintenance')} type="button" className="min-h-[105px] rounded-xl border border-[#e5e7eb] p-3 text-center text-sm font-semibold text-[#28352e] focus:outline-none focus:ring-2 focus:ring-[var(--tenant-accent)]"><Wrench style={{ color: 'var(--tenant-primary)' }} className="mx-auto mb-3" size={21} />Report an issue</button><button onClick={() => onNavigate('messages')} type="button" className="min-h-[105px] rounded-xl border border-[#e5e7eb] p-3 text-center text-sm font-semibold text-[#28352e] focus:outline-none focus:ring-2 focus:ring-[var(--tenant-accent)]"><MessageCircle style={{ color: 'var(--tenant-primary)' }} className="mx-auto mb-3" size={21} />Send a message</button><button onClick={() => onNavigate('documents')} type="button" className="min-h-[105px] rounded-xl border border-[#e5e7eb] p-3 text-center text-sm font-semibold text-[#28352e] focus:outline-none focus:ring-2 focus:ring-[var(--tenant-accent)]"><FileUp style={{ color: 'var(--tenant-primary)' }} className="mx-auto mb-3" size={21} />View documents</button></div></Card>
    </div>

    <div className="grid gap-4 lg:grid-cols-3">
      <Card><CardHeading icon={Wrench} title="Maintenance" action={<TextAction onClick={() => onNavigate('maintenance')}>{latestRequest ? 'View request' : 'Report an issue'}</TextAction>} />{latestRequest ? <div className="mt-4"><p className="text-xs font-medium text-[#6a736c]">Latest request</p><p className="mt-1 font-semibold text-[#14241d]">{latestRequest.message || 'Maintenance request'}</p><div className="mt-3 h-1.5 rounded-full bg-[#e9ecea]"><div style={{ backgroundColor: 'var(--tenant-accent)' }} className="h-full w-2/3 rounded-full" /></div><p className="mt-2 text-xs text-[#607166]">{String(latestRequest.status || 'Submitted').replaceAll('_', ' ')}</p></div> : <p className="mt-4 text-sm leading-6 text-[#607166]">No open maintenance requests. If something needs attention, let your rental team know.</p>}</Card>
      <Card><CardHeading icon={CalendarDays} title="Upcoming" />{events.length ? <div className="mt-3 divide-y divide-[#edf0ee]">{events.slice(0, 3).map((event) => <div key={event.id} className="flex gap-3 py-2.5"><span style={{ backgroundColor: 'color-mix(in srgb, var(--tenant-accent) 16%, white)', color: 'var(--tenant-primary)' }} className="flex h-11 w-12 shrink-0 flex-col items-center justify-center rounded-lg text-center font-semibold">{dateTile(event.date)}</span><div className="min-w-0"><p className="text-sm font-semibold text-[#1b2922]">{event.type}</p><p className="truncate text-xs text-[#68716b]">{event.detail}{event.time ? ` · ${event.time}` : ''}</p></div></div>)}</div> : lease.endsOn ? <div className="mt-4 flex gap-3 rounded-xl bg-[#fafafa] p-3.5"><span style={{ color: 'var(--tenant-primary)' }} className="text-sm font-semibold">{shortDate(lease.endsOn)}</span><div><p className="font-semibold text-[#1b2922]">Lease end date</p><p className="mt-1 text-sm text-[#607166]">Your current lease ends on {longDate(lease.endsOn)}.</p></div></div> : <p className="mt-4 text-sm leading-6 text-[#607166]">There are no upcoming dates available yet.</p>}</Card>
      <Card><CardHeading icon={ReceiptText} title="Recent activity" />{activity.length ? <div className="mt-3 divide-y divide-[#edf0ee]">{activity.slice(0, 3).map((item) => <div key={item.id} className="flex gap-3 py-2.5"><span style={{ backgroundColor: 'color-mix(in srgb, var(--tenant-accent) 16%, white)', color: 'var(--tenant-primary)' }} className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full"><ReceiptText size={14} /></span><div><p className="text-sm font-semibold text-[#1b2922]">{item.type || `Request ${String(item.status || 'submitted').replaceAll('_', ' ')}`}</p><p className="mt-0.5 text-xs text-[#607166]">{item.detail || shortDate(item.occurredAt || item.submitted_at)}</p></div></div>)}</div> : <p className="mt-4 text-sm leading-6 text-[#607166]">Your recent updates will appear here.</p>}</Card>
    </div>

    <section style={{ backgroundColor: 'color-mix(in srgb, var(--tenant-accent) 13%, white)', borderColor: 'color-mix(in srgb, var(--tenant-accent) 35%, white)' }} className="flex flex-col justify-between gap-3 rounded-[14px] border px-4 py-3 sm:flex-row sm:items-center sm:px-5"><div className="flex gap-3"><span style={{ color: 'var(--tenant-primary)' }} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white"><CircleHelp size={18} /></span><div><p className="font-semibold text-[#1f3329]">Need help?</p><p className="text-sm text-[#527263]">Send your rental team a message.</p></div></div><button type="button" onClick={() => onNavigate('messages')} style={{ backgroundColor: 'var(--tenant-primary)' }} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[var(--tenant-accent)] focus:ring-offset-2"><Send size={16} />Message the team</button></section>
  </div>
}
