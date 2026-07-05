import {
  Bell,
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  MapPin,
  MessageCircle,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Upload,
  UserRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const MODE_CONTENT = {
  buyer: {
    label: 'Buyer',
    greeting: 'Hello, Jordan',
    subtitle: 'Your purchase is moving through finance.',
    heroTitle: 'Finance pack ready for review',
    heroBody: '2 documents need attention before transfer can move.',
    stage: 'Finance Stage',
    progress: 62,
    accent: '#1f7a5a',
    soft: '#e8f6ef',
    panel: 'bg-[#10243a] text-white',
    cta: 'Review checklist',
    route: '/mobile-demo/transaction/demo-transaction',
    property: 'Unit 12, The Avenues',
    value: 'R2.85m',
    next: 'Upload buyer ID',
    nextBody: 'Unlocks finance approval and keeps transfer moving.',
    networkTitle: 'Buyer support room',
    networkBody: 'Agent, originator and attorney updates in one place.',
    quickActions: [
      { key: 'buyer-docs', label: 'Upload ID', icon: Upload, to: '/mobile-demo/transaction/demo-transaction' },
      { key: 'buyer-message', label: 'Ask Agent', icon: MessageCircle, to: '/mobile-demo/lead/demo-lead' },
      { key: 'buyer-finance', label: 'Finance', icon: CircleDollarSign, to: '/mobile-demo/application/demo-application' },
    ],
    portalCards: [
      { key: 'buyer-checklist', label: 'My Checklist', icon: ClipboardCheck, to: '/mobile-demo/transaction/demo-transaction' },
      { key: 'buyer-documents', label: 'Documents', icon: FileText, to: '/mobile-demo/transaction/demo-transaction' },
      { key: 'buyer-bond', label: 'Bond Progress', icon: CircleDollarSign, to: '/mobile-demo/application/demo-application' },
      { key: 'buyer-attorney', label: 'Attorney', icon: ShieldCheck, to: '/mobile-demo/matter/demo-matter' },
    ],
    activities: [
      { id: 'buyer-activity-1', title: 'Originator reviewed bank pack', meta: '12 min ago' },
      { id: 'buyer-activity-2', title: 'Buyer ID still outstanding', meta: 'Today' },
      { id: 'buyer-activity-3', title: 'Attorney opened transfer room', meta: 'Tomorrow' },
    ],
  },
  seller: {
    label: 'Seller',
    greeting: 'Hello, Morgan',
    subtitle: 'Your sale has buyer finance in progress.',
    heroTitle: 'Offer accepted, transfer preparing',
    heroBody: 'Track attorneys, documents and buyer milestones.',
    stage: 'Transfer Prep',
    progress: 48,
    accent: '#2563eb',
    soft: '#e8f1fb',
    panel: 'bg-[#12355b] text-white',
    cta: 'View sale room',
    route: '/mobile-demo/transaction/demo-transaction',
    property: '18 Hillcrest Road',
    value: 'R3.4m',
    next: 'Sign disclosure pack',
    nextBody: 'Confirms seller readiness before transfer instruction.',
    networkTitle: 'Seller command room',
    networkBody: 'Offer, compliance and transfer updates without chasing.',
    quickActions: [
      { key: 'seller-offer', label: 'Offer', icon: FileText, to: '/mobile-demo/transaction/demo-transaction' },
      { key: 'seller-message', label: 'Agent Chat', icon: MessageCircle, to: '/mobile-demo/lead/demo-lead' },
      { key: 'seller-disclosure', label: 'Disclosure', icon: ShieldCheck, to: '/mobile-demo/transaction/demo-transaction' },
    ],
    portalCards: [
      { key: 'seller-room', label: 'Sale Room', icon: BriefcaseBusiness, to: '/mobile-demo/transaction/demo-transaction' },
      { key: 'seller-disclosures', label: 'Disclosures', icon: ShieldCheck, to: '/mobile-demo/transaction/demo-transaction' },
      { key: 'seller-buyer', label: 'Buyer Finance', icon: CircleDollarSign, to: '/mobile-demo/application/demo-application' },
      { key: 'seller-transfer', label: 'Transfer Team', icon: Building2, to: '/mobile-demo/matter/demo-matter' },
    ],
    activities: [
      { id: 'seller-activity-1', title: 'Buyer finance moved to review', meta: 'Now' },
      { id: 'seller-activity-2', title: 'Disclosure pack ready to sign', meta: 'Today' },
      { id: 'seller-activity-3', title: 'Transfer attorney assigned', meta: 'Tomorrow' },
    ],
  },
}

function ModeToggle({ mode, setMode }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl border border-[#dce5ee] bg-white p-1 shadow-[0_10px_24px_rgba(15,23,42,0.05)]" aria-label="Portal mode">
      {Object.entries(MODE_CONTENT).map(([key, item]) => (
        <button
          key={key}
          type="button"
          className="min-h-11 rounded-xl text-sm font-semibold transition active:bg-[#f1f5f9]"
          style={mode === key ? { background: item.accent, color: '#ffffff', boxShadow: '0 8px 18px rgba(15,23,42,0.16)' } : { color: '#60758d' }}
          onClick={() => setMode(key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function PropertyVisual({ content }) {
  return (
    <div className="relative h-[138px] overflow-hidden rounded-[28px] bg-[#dfe9ef] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,#d9e9e1_0%,#f9faf6_42%,#b9cbd8_100%)]" />
      <div className="absolute left-4 top-4 h-16 w-24 rounded-2xl bg-white/70 shadow-[0_12px_24px_rgba(15,23,42,0.10)]" />
      <div className="absolute bottom-0 right-0 h-24 w-32 rounded-tl-[36px] bg-[#10243a]/90" />
      <div className="absolute bottom-4 right-4 h-14 w-20 rounded-2xl bg-white/90" />
      <div className="absolute bottom-4 left-4 rounded-2xl bg-white/92 px-3 py-2 shadow-[0_10px_22px_rgba(15,23,42,0.12)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#60758d]">Property</p>
        <p className="mt-1 max-w-[145px] truncate text-sm font-semibold text-[#10243a]">{content.property}</p>
      </div>
    </div>
  )
}

function HeroCard({ content }) {
  return (
    <section className={`overflow-hidden rounded-[32px] p-5 shadow-[0_22px_50px_rgba(15,23,42,0.18)] ${content.panel}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/70">{content.stage}</p>
          <h1 className="mt-2 max-w-[11ch] text-[31px] font-semibold leading-[1.04] text-white">{content.heroTitle}</h1>
          <p className="mt-3 max-w-[23ch] text-sm font-medium leading-6 text-white/80">{content.heroBody}</p>
        </div>
        <div className="flex h-[78px] w-[78px] shrink-0 items-center justify-center rounded-full bg-white text-[22px] font-bold text-[#10243a] shadow-[0_14px_30px_rgba(0,0,0,0.16)]">
          {content.progress}%
        </div>
      </div>
      <div className="mt-5">
        <PropertyVisual content={content} />
      </div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <Link to={content.route} className="inline-flex min-h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-[#10243a]">
          {content.cta}
        </Link>
        <span className="text-sm font-semibold text-white/80">{content.value}</span>
      </div>
    </section>
  )
}

function QuickAction({ action, content }) {
  const Icon = action.icon
  return (
    <Link to={action.to} className="min-h-[92px] rounded-[24px] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
      <span className="flex h-11 w-11 items-center justify-center rounded-[18px]" style={{ background: content.soft, color: content.accent }}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="mt-3 block text-sm font-semibold text-[#10243a]">{action.label}</span>
    </Link>
  )
}

function SectionHeader({ title, to = '' }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[20px] font-semibold text-[#10243a]">{title}</h2>
      {to ? (
        <Link to={to} className="text-[13px] font-semibold text-[#1f7a5a]">
          See all
        </Link>
      ) : null}
    </div>
  )
}

function ServiceCard({ item, content }) {
  const Icon = item.icon
  return (
    <Link to={item.to} className="flex min-h-[66px] items-center gap-3 rounded-[22px] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[17px]" style={{ background: content.soft, color: content.accent }}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#10243a]">{item.label}</span>
      <ChevronRight className="h-4 w-4 text-[#94a3b8]" />
    </Link>
  )
}

export default function MobileDemoHomePage() {
  const [mode, setMode] = useState('buyer')
  const content = MODE_CONTENT[mode] || MODE_CONTENT.buyer
  const quickActions = useMemo(() => content.quickActions || [], [content])
  const portalCards = useMemo(() => content.portalCards || [], [content])
  const activities = useMemo(() => content.activities || [], [content])

  return (
    <div className="space-y-6 pb-2" data-mobile-demo-home>
      <section className="space-y-4 pt-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#10243a] text-white shadow-[0_12px_26px_rgba(15,23,42,0.18)]">
              <UserRound className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold text-[#10243a]">{content.greeting}</p>
              <p className="mt-0.5 truncate text-[13px] text-[#60758d]">{content.subtitle}</p>
            </div>
          </div>
          <Link to="/mobile-demo/search" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-[#10243a] shadow-[0_10px_24px_rgba(15,23,42,0.06)]" aria-label="Search demo">
            <Bell className="h-5 w-5" />
          </Link>
        </div>

        <div className="flex min-h-14 items-center gap-2 rounded-2xl bg-white px-3 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <Search className="h-5 w-5 shrink-0 text-[#60758d]" />
          <Link to="/mobile-demo/search" className="min-w-0 flex-1 text-sm font-medium text-[#8b9aac]">
            Search transaction, docs, people
          </Link>
          <Link to="/mobile-demo/search" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#10243a] text-white" aria-label="Open filters">
            <Settings2 className="h-5 w-5" />
          </Link>
        </div>

        <ModeToggle mode={mode} setMode={setMode} />
      </section>

      <HeroCard content={content} />

      <section className="grid grid-cols-3 gap-3">
        {quickActions.map((action) => <QuickAction key={action.key} action={action} content={content} />)}
      </section>

      <section>
        <SectionHeader title="Your Portal" to="/mobile-demo/search" />
        <div className="grid grid-cols-2 gap-3">
          {portalCards.map((item) => <ServiceCard key={item.key} item={item} content={content} />)}
        </div>
      </section>

      <section>
        <SectionHeader title="Next Best Action" />
        <Link to={content.route} className="flex items-center gap-4 rounded-[26px] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px]" style={{ background: content.soft, color: content.accent }}>
            <ClipboardCheck className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold text-[#10243a]">{content.next}</span>
            <span className="mt-1 block truncate text-[13px] text-[#60758d]">{content.nextBody}</span>
          </span>
          <ChevronRight className="h-5 w-5 text-[#94a3b8]" />
        </Link>
      </section>

      <section>
        <SectionHeader title="Live Updates" />
        <div className="space-y-3">
          {activities.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-[22px] bg-white p-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)]">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px]" style={{ background: content.soft, color: content.accent }}>
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[#10243a]">{item.title}</span>
                <span className="mt-0.5 block text-xs font-semibold text-[#94a3b8]">{item.meta}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] bg-[#eef4f8] p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-white" style={{ color: content.accent }}>
            <MapPin className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[#10243a]">{content.networkTitle}</p>
            <p className="mt-1 truncate text-xs text-[#60758d]">{content.networkBody}</p>
          </div>
          <Building2 className="h-5 w-5 text-[#60758d]" />
        </div>
      </section>
    </div>
  )
}
