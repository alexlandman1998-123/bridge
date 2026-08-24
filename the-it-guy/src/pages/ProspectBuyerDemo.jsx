import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileText,
  FileSignature,
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
  { title: 'Buyer ID Document', group: 'FICA documents', status: 'Approved', tone: 'complete', description: 'Verified copy of the buyer identity document.' },
  { title: 'Proof of Residential Address', group: 'FICA documents', status: 'Received', tone: 'complete', description: 'Utility bill or bank statement confirming residential address.' },
  { title: 'Signed Offer to Purchase', group: 'Sale documents', status: 'Shared', tone: 'info', description: 'Signed OTP available for the buyer and transfer team.' },
  { title: 'Sale Agreement Addendum', group: 'Sale documents', status: 'Drafting', tone: 'info', description: 'Prepared if the attorneys need updated purchase terms.' },
  { title: 'Rates Clearance Information', group: 'Property documents', status: 'Requested', tone: 'action', description: 'Property supporting document requested from the seller side.' },
  { title: 'Sectional Title Conduct Rules', group: 'Property documents', status: 'Shared', tone: 'info', description: 'Scheme conduct rules for the purchased unit.' },
  { title: 'Bank Statements', group: 'Bond documents', status: 'Received', tone: 'complete', description: 'Latest three months bank statements received.' },
  { title: 'Latest Payslip', group: 'Bond documents', status: 'Action needed', tone: 'action', description: 'Required before the bond application pack goes to banks.' },
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[300px] flex-col overflow-y-auto px-6 py-6 text-white lg:flex" style={sidebarStyle}>
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
                  active ? 'border-white/30 bg-white/15 text-white shadow-[inset_3px_0_0_rgba(255,255,255,0.8)]' : 'border-transparent text-white/78 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={17} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto rounded-[18px] border border-white/18 bg-white/10 p-4 text-white">
          <p className="text-sm font-semibold text-white">Need help?</p>
          <p className="mt-1 text-xs leading-5 text-white/75">Sarah Williams from {config.agencyName} is here to help.</p>
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

      <section className="hidden min-h-screen lg:block lg:pl-[300px]">
        <div className="w-full px-8 py-8 2xl:px-12">
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
    <div className="space-y-6">
      <section className="relative mt-5 overflow-hidden rounded-[28px] border border-white/70 bg-slate-900 text-white shadow-[0_22px_54px_rgba(15,23,42,0.16)] lg:mt-0">
        <img src={config.samplePropertyImageUrl} alt={config.samplePropertyAddress} className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0" style={heroOverlayStyle} />
        <div className="relative grid min-h-[310px] gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:p-8">
          <div className="flex flex-col justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-white/75">{loading ? 'Loading demo' : 'Your purchase'}</p>
              <h1 className="mt-4 max-w-5xl text-[2.35rem] font-semibold leading-[0.98] tracking-[-0.06em] text-white lg:text-[3.5rem] 2xl:text-[4.15rem]">
                {config.samplePropertyAddress}
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-white/80">
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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Progress</p>
            <div className="mt-5 flex items-center justify-center">
              <div className="relative flex h-36 w-36 items-center justify-center rounded-full" style={{ background: `conic-gradient(${brand.accent} 180deg, rgba(255,255,255,0.24) 0deg)` }}>
                <span className="absolute inset-3 rounded-full bg-slate-950/70" />
                <span className="relative text-center">
                  <strong className="block text-4xl tracking-[-0.05em]">50%</strong>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/70">Complete</span>
                </span>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-white/80">Next: transfer attorney prepares guarantees and lodgement documents.</p>
          </div>
        </div>
      </section>

      <TransactionBanner brand={brand} config={config} />

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

function TransactionBanner({ brand, config }) {
  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-5">
      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr_0.9fr_1fr]">
        {[
          ['Transaction', 'Normal resale purchase', config.samplePropertyAddress],
          ['Finance route', 'Bond application', 'Application pack being prepared'],
          ['Next milestone', 'Guarantees', 'Transfer attorney to request guarantee wording'],
          ['Key date', 'Target registration', 'Estimated 8 to 10 weeks'],
        ].map(([kicker, title, detail]) => (
          <article key={kicker} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] px-4 py-3">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">{kicker}</p>
            <h3 className="mt-1 text-sm font-semibold text-[#142132]">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-[#667085]">{detail}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function HeroMetric({ label, value }) {
  return (
    <article className="rounded-[18px] border border-white/16 bg-white/12 px-4 py-3 backdrop-blur">
      <span className="block text-[0.66rem] font-semibold uppercase tracking-[0.14em] text-white/70">{label}</span>
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
  const groupedDocuments = documentRows.reduce((groups, document) => {
    const key = document.group || 'Additional documents'
    groups[key] = [...(groups[key] || []), document]
    return groups
  }, {})
  const readyCount = documentRows.filter((document) => document.tone === 'complete' || document.status === 'Shared' || (document.title === 'Latest Payslip' && demoUploadComplete)).length

  return (
    <section className={`rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] ${compact ? 'xl:col-span-2' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-[-0.05em]">Sale documents</h2>
          <p className="mt-1 text-sm text-[#667085]">Grouped the same way a buyer sees the live journey: FICA, sale pack, bond, property, and additional items.</p>
        </div>
        <span className="rounded-full bg-[#f2f4f7] px-3 py-1 text-xs font-semibold text-[#667085]">{readyCount} of {documentRows.length} ready</span>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {Object.entries(groupedDocuments).map(([group, documents]) => (
          <div key={group} className="rounded-[20px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#65758a]">{group}</h3>
              <span className="rounded-full bg-white px-2.5 py-1 text-[0.68rem] font-semibold text-[#667085]">{documents.length} items</span>
            </div>
            <div className="mt-3 grid gap-3">
              {documents.map((document) => {
                const status = document.title === 'Latest Payslip' && demoUploadComplete ? 'Uploaded for review' : document.status
                const tone = document.title === 'Latest Payslip' && demoUploadComplete ? 'info' : document.tone
                return (
                  <article key={document.title} className="rounded-[16px] border border-[#e4ebf3] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-base font-semibold text-[#142132]">{document.title}</h4>
                        <p className="mt-1 text-sm leading-6 text-[#667085]">{document.description}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${statusClasses(tone)}`}>{status}</span>
                    </div>
                    {document.title === 'Latest Payslip' ? (
                      <button type="button" onClick={onCompleteUpload} className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-[12px] text-sm font-semibold text-white" style={{ backgroundColor: brand.primary }}>
                        <UploadCloud size={16} />
                        {demoUploadComplete ? 'Uploaded for review' : 'Upload latest payslip'}
                      </button>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function FinanceSection({ brand }) {
  return (
    <section className="grid gap-5 xl:grid-cols-[0.95fr_1.4fr]">
      <div className="grid gap-5">
        {[
          ['Bond status', 'Application in progress', 'Latest payslip needed before submission.'],
          ['Requested amount', 'R 2 280 000', '80% loan-to-value on the purchase price.'],
          ['Bank submission', 'Preparing', 'Originator is packaging the application for bank submission.'],
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
      </div>
      <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7b8ca2]">Bond application</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.05em]">Application form preview</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">A read-only version of the guided bond application workspace buyers complete in the normal portal.</p>
          </div>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">72% complete</span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            ['Applicant details', 'Mia Khumalo', 'Confirmed from onboarding'],
            ['Employment', 'Full-time employed', 'Needs latest payslip'],
            ['Income', 'R 82 000 gross monthly', 'Verified against bank statements'],
            ['Expenses', 'R 24 500 monthly commitments', 'Captured for affordability'],
            ['Requested bond', 'R 2 280 000', 'Submitted through BetterBond Demo Desk'],
            ['Co-applicant', 'Not applicable', 'Single buyer application'],
          ].map(([label, value, helper]) => (
            <article key={label} className="rounded-[16px] border border-[#e4ebf3] bg-[#fbfdff] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.13em] text-[#7b8ca2]">{label}</p>
              <h3 className="mt-1 text-base font-semibold text-[#142132]">{value}</h3>
              <p className="mt-1 text-sm leading-5 text-[#667085]">{helper}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 rounded-[18px] border border-[#e4ebf3] bg-[#fbfdff] p-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[13px] text-white" style={{ backgroundColor: brand.primary }}>
              <FileSignature size={18} />
            </span>
            <div>
              <h3 className="text-base font-semibold text-[#142132]">Next buyer action</h3>
              <p className="mt-1 text-sm leading-6 text-[#667085]">Upload latest payslip so the originator can submit to banks.</p>
            </div>
          </div>
        </div>
      </section>
    </section>
  )
}

function TeamSection({ config }) {
  const team = [
    ['Sarah Williams', `${config.agencyName} Agent`, 'Coordinates the buyer relationship and keeps everyone aligned.', 'SW', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80'],
    ['Daniel Jacobs', 'Transfer Attorney', 'Prepares transfer documents, guarantees, and registration milestones.', 'DJ', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80'],
    ['Priya Naidoo', 'Bond Originator', 'Packages the bond application and manages lender feedback.', 'PN', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=240&q=80'],
    ['Lerato Mokoena', 'Conveyancing Secretary', 'Keeps lodgement documents and attorney admin moving.', 'LM', 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=240&q=80'],
  ]

  return (
    <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
      {team.map(([name, role, detail, initials, image]) => (
        <article key={name} className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
          <div className="flex items-center gap-3">
            <img src={image} alt={name} className="h-14 w-14 rounded-full object-cover" />
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eef4fb] text-xs font-semibold text-[#35546c]">{initials}</span>
          </div>
          <h2 className="mt-4 text-lg font-semibold tracking-[-0.04em]">{name}</h2>
          <p className="mt-1 text-sm font-semibold text-[#667085]">{role}</p>
          <p className="mt-3 text-sm leading-6 text-[#667085]">{detail}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button type="button" className="min-h-10 rounded-[12px] bg-[#f2f4f7] text-xs font-semibold text-[#344054]">Message</button>
            <button type="button" className="min-h-10 rounded-[12px] border border-[#dbe5ef] text-xs font-semibold text-[#344054]">Call</button>
          </div>
        </article>
      ))}
    </section>
  )
}
