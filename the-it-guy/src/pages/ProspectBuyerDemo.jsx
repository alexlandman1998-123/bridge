import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileText,
  HandCoins,
  Home,
  MessageCircle,
  PhoneCall,
  ShieldCheck,
  UploadCloud,
  Users,
} from 'lucide-react'
import { resolveProspectDemoConfig } from '../lib/prospectDemoConfig'

const DEFAULT_BRAND = {
  agencyName: 'Demo Agency',
  logoDarkUrl: '/brand/produktive-realty-logo-white.svg',
  logoLightUrl: '/brand/produktive-realty-logo-white.svg',
  primaryColour: '#152432',
  secondaryColour: '#233d53',
  accentColour: '#d1ad61',
  samplePropertyImageUrl: '/brand/agency-intake-buy.webp',
  samplePropertyAddress: '2 Pine Avenue, Unit 4, Sea Point, Cape Town',
}

const DEMO_NAV = [
  { key: 'overview', label: 'Overview', icon: Home },
  { key: 'progress', label: 'Transfer Journey', icon: CheckCircle2 },
  { key: 'documents', label: 'Sale Documents', icon: FileText },
  { key: 'finance', label: 'Finance', icon: HandCoins },
  { key: 'team', label: 'Agent & Legal Team', icon: Users },
]

const DEMO_STAGES = [
  { label: 'Offer Accepted', status: 'complete' },
  { label: 'OTP Signed', status: 'complete' },
  { label: 'Finance', status: 'current' },
  { label: 'Transfer Prep', status: 'next' },
  { label: 'Registration', status: 'pending' },
]

const DEMO_DOCUMENTS = [
  { title: 'Buyer ID Document', group: 'FICA', status: 'Approved', tone: 'complete' },
  { title: 'Bank Statements', group: 'Finance', status: 'Received', tone: 'complete' },
  { title: 'Latest Payslip', group: 'Finance', status: 'Action needed', tone: 'action' },
  { title: 'Signed Offer to Purchase', group: 'Sale Pack', status: 'Shared', tone: 'info' },
]

const DEMO_UPDATES = [
  'Your offer has been accepted and the sale is moving into finance confirmation.',
  'The draft Offer to Purchase has been shared in your documents area.',
  'Your transfer attorney has opened the file and will confirm next steps shortly.',
]

function normalizeHex(value = '', fallback = '#152432') {
  const normalized = String(value || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : fallback
}

function hexToRgba(hex = '#152432', alpha = 1) {
  const safeHex = normalizeHex(hex).slice(1)
  const r = parseInt(safeHex.slice(0, 2), 16)
  const g = parseInt(safeHex.slice(2, 4), 16)
  const b = parseInt(safeHex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getDemoPath(token = '', section = 'overview') {
  const safeSection = section && section !== 'overview' ? `/${section}` : ''
  return `/demo/${token}/buyer${safeSection}`
}

function statusClasses(tone = 'info') {
  if (tone === 'complete') return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (tone === 'action') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-sky-200 bg-sky-50 text-sky-700'
}

export default function ProspectBuyerDemo() {
  const { token = '', section = 'overview' } = useParams()
  const activeSection = ['overview', 'progress', 'documents', 'finance', 'team'].includes(section) ? section : 'overview'
  const [config, setConfig] = useState(DEFAULT_BRAND)
  const [loading, setLoading] = useState(true)
  const [demoUploadComplete, setDemoUploadComplete] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadConfig() {
      setLoading(true)
      const resolved = await resolveProspectDemoConfig(token)
      if (cancelled) return
      setConfig({
        ...DEFAULT_BRAND,
        ...resolved,
        agencyName: resolved.agencyName || DEFAULT_BRAND.agencyName,
        logoDarkUrl: resolved.logoDarkUrl || resolved.logoUrl || DEFAULT_BRAND.logoDarkUrl,
        logoLightUrl: resolved.logoLightUrl || resolved.logoUrl || resolved.logoDarkUrl || DEFAULT_BRAND.logoLightUrl,
        primaryColour: resolved.primaryColour || DEFAULT_BRAND.primaryColour,
        secondaryColour: resolved.secondaryColour || resolved.primaryColour || DEFAULT_BRAND.secondaryColour,
        accentColour: resolved.accentColour || DEFAULT_BRAND.accentColour,
        samplePropertyImageUrl: resolved.samplePropertyImageUrl || DEFAULT_BRAND.samplePropertyImageUrl,
        samplePropertyAddress: resolved.samplePropertyAddress || DEFAULT_BRAND.samplePropertyAddress,
      })
      setLoading(false)
    }
    void loadConfig()
    return () => {
      cancelled = true
    }
  }, [token])

  const brand = useMemo(() => {
    const primary = normalizeHex(config.primaryColour, DEFAULT_BRAND.primaryColour)
    const secondary = normalizeHex(config.secondaryColour, primary)
    const accent = normalizeHex(config.accentColour, DEFAULT_BRAND.accentColour)
    return { primary, secondary, accent }
  }, [config.accentColour, config.primaryColour, config.secondaryColour])

  if (!token) return <Navigate to="/" replace />

  const sidebarStyle = {
    background: `radial-gradient(circle at 18% -6%, ${hexToRgba(brand.accent, 0.24)} 0%, transparent 34%), linear-gradient(180deg, ${brand.primary} 0%, ${brand.secondary} 100%)`,
  }
  const heroOverlayStyle = {
    background: `linear-gradient(135deg, ${hexToRgba(brand.primary, 0.9)} 0%, ${hexToRgba(brand.primary, 0.7)} 48%, ${hexToRgba(brand.secondary, 0.88)} 100%)`,
  }

  const documentRows = DEMO_DOCUMENTS.map((document) =>
    document.title === 'Latest Payslip' && demoUploadComplete
      ? { ...document, status: 'Uploaded for review', tone: 'info' }
      : document,
  )

  return (
    <main className="min-h-screen bg-[#f3f6fb] text-[#142132]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] flex-col overflow-y-auto px-5 py-5 text-white lg:flex" style={sidebarStyle}>
        <div className="border-b border-white/10 pb-5">
          {config.logoDarkUrl ? (
            <img src={config.logoDarkUrl} alt={`${config.agencyName} logo`} className="max-h-14 max-w-[210px] object-contain object-left" />
          ) : (
            <h1 className="text-2xl font-semibold tracking-[-0.04em]">{config.agencyName}</h1>
          )}
          <p className="mt-3 text-sm font-medium text-white/70">Buyer Portal Demo</p>
        </div>

        <nav className="mt-6 grid gap-2">
          {DEMO_NAV.map((item) => {
            const Icon = item.icon
            const active = item.key === activeSection
            return (
              <Link
                key={item.key}
                to={getDemoPath(token, item.key)}
                className={`flex min-h-[46px] items-center gap-3 rounded-[12px] border px-3 text-sm font-semibold transition ${
                  active ? 'border-white/30 bg-white/15 text-white shadow-[inset_3px_0_0_rgba(255,255,255,0.8)]' : 'border-transparent text-white/72 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={17} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto rounded-[18px] border border-white/12 bg-black/20 p-4">
          <p className="text-sm font-semibold">Need help?</p>
          <p className="mt-1 text-xs leading-5 text-white/70">Sarah Williams from {config.agencyName} is here to help.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <a href="mailto:sarah.demo@arch9.co.za" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] bg-white/15 text-xs font-semibold">
              <MessageCircle size={14} />
              Email
            </a>
            <a href="tel:+27215550100" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-white/15 text-xs font-semibold">
              <PhoneCall size={14} />
              Call
            </a>
          </div>
        </div>
      </aside>

      <section className="lg:hidden">
        <div className="mx-auto max-w-[430px] px-4 pb-28 pt-5">
          <header className="flex min-h-11 items-center justify-between gap-3">
            {config.logoDarkUrl ? (
              <img src={config.logoDarkUrl} alt={`${config.agencyName} logo`} className="max-h-10 max-w-[170px] object-contain object-left" />
            ) : (
              <strong>{config.agencyName}</strong>
            )}
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold shadow-sm">M</span>
          </header>
          <DemoContent
            activeSection={activeSection}
            brand={brand}
            config={config}
            heroOverlayStyle={heroOverlayStyle}
            loading={loading}
            documentRows={documentRows}
            demoUploadComplete={demoUploadComplete}
            onCompleteUpload={() => setDemoUploadComplete(true)}
          />
        </div>
        <nav className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-[430px] rounded-[22px] border border-[#dfe7ee] bg-white/95 px-1.5 py-1 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur">
          <div className="grid grid-cols-5 gap-1">
            {DEMO_NAV.map((item) => {
              const Icon = item.icon
              const active = item.key === activeSection
              return (
                <Link
                  key={item.key}
                  to={getDemoPath(token, item.key)}
                  className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-[16px] text-[0.64rem] font-semibold transition"
                  style={active ? { backgroundColor: hexToRgba(brand.primary, 0.1), color: brand.primary } : { color: '#667085' }}
                >
                  <Icon size={17} />
                  <span>{item.key === 'progress' ? 'Journey' : item.label.split(' ')[0]}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      </section>

      <section className="hidden min-h-screen lg:block lg:pl-[280px]">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <DemoContent
            activeSection={activeSection}
            brand={brand}
            config={config}
            heroOverlayStyle={heroOverlayStyle}
            loading={loading}
            documentRows={documentRows}
            demoUploadComplete={demoUploadComplete}
            onCompleteUpload={() => setDemoUploadComplete(true)}
          />
        </div>
      </section>
    </main>
  )
}

function DemoContent({ activeSection, brand, config, heroOverlayStyle, loading, documentRows, demoUploadComplete, onCompleteUpload }) {
  return (
    <div className="space-y-5">
      <section className="relative mt-5 overflow-hidden rounded-[28px] border border-white/70 bg-slate-900 text-white shadow-[0_22px_54px_rgba(15,23,42,0.16)] lg:mt-0">
        <img src={config.samplePropertyImageUrl} alt={config.samplePropertyAddress} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={heroOverlayStyle} />
        <div className="relative grid min-h-[310px] gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-8">
          <div className="flex flex-col justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/70">{loading ? 'Loading demo' : 'Your purchase'}</p>
              <h1 className="mt-4 max-w-2xl text-[2.35rem] font-semibold leading-[0.98] tracking-[-0.06em] lg:text-[3.5rem]">
                {config.samplePropertyAddress}
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/78">
                A personalised buyer workspace showing next steps, documents, finance status, legal updates, and your transaction team.
              </p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <HeroMetric label="Buyer" value="Mia Khumalo" />
              <HeroMetric label="Purchase price" value="R 2 850 000" />
              <HeroMetric label="Current stage" value="Finance" />
            </div>
          </div>
          <div className="rounded-[24px] border border-white/18 bg-white/12 p-5 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/62">Progress</p>
            <div className="mt-5 flex items-center justify-center">
              <div className="relative flex h-36 w-36 items-center justify-center rounded-full" style={{ background: `conic-gradient(${brand.accent} 180deg, rgba(255,255,255,0.24) 0deg)` }}>
                <span className="absolute inset-3 rounded-full bg-slate-950/70" />
                <span className="relative text-center">
                  <strong className="block text-4xl tracking-[-0.05em]">50%</strong>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Complete</span>
                </span>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-white/78">Next: transfer attorney prepares guarantees and lodgement documents.</p>
          </div>
        </div>
      </section>

      {activeSection === 'overview' ? (
        <OverviewSection brand={brand} documentRows={documentRows} onCompleteUpload={onCompleteUpload} demoUploadComplete={demoUploadComplete} />
      ) : null}
      {activeSection === 'progress' ? <ProgressSection brand={brand} /> : null}
      {activeSection === 'documents' ? <DocumentsSection brand={brand} documentRows={documentRows} onCompleteUpload={onCompleteUpload} demoUploadComplete={demoUploadComplete} /> : null}
      {activeSection === 'finance' ? <FinanceSection brand={brand} /> : null}
      {activeSection === 'team' ? <TeamSection config={config} /> : null}
    </div>
  )
}

function HeroMetric({ label, value }) {
  return (
    <article className="rounded-[18px] border border-white/16 bg-white/12 px-4 py-3 backdrop-blur">
      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-white/62">{label}</span>
      <strong className="mt-1 block text-sm font-semibold text-white">{value}</strong>
    </article>
  )
}

function OverviewSection({ brand, documentRows, demoUploadComplete, onCompleteUpload }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Needs your attention</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em]">Upload the latest payslip</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">Your bond originator needs one updated payslip before the application pack is sent to the banks.</p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${demoUploadComplete ? statusClasses('info') : statusClasses('action')}`}>
            {demoUploadComplete ? 'Uploaded' : 'Action needed'}
          </span>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={onCompleteUpload} className="inline-flex min-h-11 items-center gap-2 rounded-[14px] px-4 text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }}>
            <UploadCloud size={17} />
            {demoUploadComplete ? 'Uploaded for review' : 'Upload latest payslip'}
          </button>
          <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-[14px] border px-4 text-sm font-semibold" style={{ borderColor: hexToRgba(brand.primary, 0.22), color: brand.primary }}>
            View sale documents
          </button>
        </div>
      </section>
      <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <h3 className="text-lg font-semibold tracking-[-0.04em]">Recent updates</h3>
        <div className="mt-4 space-y-4">
          {DEMO_UPDATES.map((update, index) => (
            <div key={update} className="grid grid-cols-[34px_minmax(0,1fr)] gap-3">
              <span className="mt-1 flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ backgroundColor: index === 0 ? brand.primary : '#9aa8b6' }}>
                <Bell size={14} />
              </span>
              <p className="text-sm leading-6 text-[#52657b]">{update}</p>
            </div>
          ))}
        </div>
      </section>
      <DocumentsSection brand={brand} documentRows={documentRows} compact onCompleteUpload={onCompleteUpload} demoUploadComplete={demoUploadComplete} />
    </div>
  )
}

function ProgressSection({ brand }) {
  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
      <h2 className="text-2xl font-semibold tracking-[-0.05em]">Transfer journey</h2>
      <div className="mt-6 grid gap-4">
        {DEMO_STAGES.map((stage, index) => (
          <article key={stage.label} className="grid grid-cols-[42px_minmax(0,1fr)] gap-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ backgroundColor: stage.status === 'pending' ? '#c7d1dc' : brand.primary }}>
              {stage.status === 'complete' ? <CheckCircle2 size={18} /> : index + 1}
            </span>
            <div className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
              <strong className="text-sm text-[#142132]">{stage.label}</strong>
              <p className="mt-1 text-sm text-[#667085]">{stage.status === 'current' ? 'In progress now' : stage.status === 'complete' ? 'Completed' : 'Coming up next'}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function DocumentsSection({ brand, documentRows, compact = false, demoUploadComplete, onCompleteUpload }) {
  return (
    <section className={`rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] ${compact ? 'xl:col-span-2' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.05em]">Sale documents</h2>
          <p className="mt-1 text-sm text-[#667085]">A simple view of what has been received and what still needs attention.</p>
        </div>
        <span className="rounded-full bg-[#f2f4f7] px-3 py-1 text-xs font-semibold text-[#667085]">3 of 4 ready</span>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {documentRows.map((document) => (
          <article key={document.title} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8a98a8]">{document.group}</p>
                <h3 className="mt-1 text-base font-semibold text-[#142132]">{document.title}</h3>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusClasses(document.tone)}`}>{document.status}</span>
            </div>
            {document.title === 'Latest Payslip' ? (
              <button type="button" onClick={onCompleteUpload} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[12px] text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }}>
                <UploadCloud size={16} />
                {demoUploadComplete ? 'Uploaded for review' : 'Upload latest payslip'}
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}

function FinanceSection({ brand }) {
  return (
    <section className="grid gap-5 lg:grid-cols-3">
      {[
        ['Bond status', 'Documents requested', 'Latest payslip needed before submission.'],
        ['Deposit', 'Proof received', 'Reservation deposit proof is safely stored.'],
        ['Bank submission', 'Preparing', 'Your originator is preparing the application pack.'],
      ].map(([label, value, helper]) => (
        <article key={label} className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] text-white" style={{ backgroundColor: brand.primary }}>
            <HandCoins size={20} />
          </span>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">{label}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em]">{value}</h2>
          <p className="mt-2 text-sm leading-6 text-[#667085]">{helper}</p>
        </article>
      ))}
    </section>
  )
}

function TeamSection({ config }) {
  return (
    <section className="grid gap-5 lg:grid-cols-3">
      {[
        ['Sarah Williams', `${config.agencyName} Agent`, 'Coordinates the buyer relationship and keeps everyone aligned.'],
        ['Jacobs Transfer Attorneys', 'Transfer Attorney', 'Prepares transfer documents and registration milestones.'],
        ['BetterBond Demo Desk', 'Bond Originator', 'Supports finance approvals and lender feedback.'],
      ].map(([name, role, detail]) => (
        <article key={name} className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eef4fb] text-sm font-semibold text-[#35546c]">{name.charAt(0)}</span>
          <h2 className="mt-4 text-lg font-semibold tracking-[-0.04em]">{name}</h2>
          <p className="mt-1 text-sm font-semibold text-[#667085]">{role}</p>
          <p className="mt-3 text-sm leading-6 text-[#667085]">{detail}</p>
        </article>
      ))}
    </section>
  )
}
