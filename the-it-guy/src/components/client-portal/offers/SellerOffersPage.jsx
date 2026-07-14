import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Download,
  FileText,
  HelpCircle,
  MessageCircle,
  MoreVertical,
  ShieldCheck,
  Sparkles,
  Timer,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { buildSellerPortalOffersPayload } from '../../../services/sellerPortalOffersService'

const MONEY_FORMATTER = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

const DATE_FORMATTER = new Intl.DateTimeFormat('en-ZA', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const STATUS_META = {
  new: {
    label: 'New',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    action: 'Awaiting your review',
  },
  under_review: {
    label: 'Under Review',
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    action: 'With your agent',
  },
  conditionally_accepted: {
    label: 'Conditionally Accepted',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    action: 'Conditions in progress',
  },
  accepted: {
    label: 'Accepted',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    action: 'Accepted',
  },
  declined: {
    label: 'Declined',
    badge: 'border-rose-200 bg-rose-50 text-rose-700',
    action: 'No action needed',
  },
  expired: {
    label: 'Expired',
    badge: 'border-slate-200 bg-slate-50 text-slate-600',
    action: 'Expired',
  },
}

function formatMoney(value) {
  const amount = Number(value || 0)
  return amount > 0 ? MONEY_FORMATTER.format(amount) : 'Not available'
}

function formatDate(value, fallback = 'Not set') {
  const parsed = Date.parse(value || '')
  if (Number.isNaN(parsed)) return fallback
  return DATE_FORMATTER.format(new Date(parsed))
}

function getDaysUntil(value, now) {
  const parsed = Date.parse(value || '')
  if (Number.isNaN(parsed)) return ''
  const days = Math.ceil((parsed - now) / 86400000)
  if (days < 0) return 'expired'
  if (days === 0) return 'today'
  if (days === 1) return '1 day'
  return `${days} days`
}

function sortOffers(offers = [], sortMode = 'newest') {
  return [...offers].sort((left, right) => {
    if (sortMode === 'highest_offer') return Number(right.offerAmount || 0) - Number(left.offerAmount || 0)
    if (sortMode === 'expiring_soon') {
      const leftTime = Date.parse(left.expiryDate || '')
      const rightTime = Date.parse(right.expiryDate || '')
      return (Number.isNaN(leftTime) ? Number.MAX_SAFE_INTEGER : leftTime) - (Number.isNaN(rightTime) ? Number.MAX_SAFE_INTEGER : rightTime)
    }
    if (sortMode === 'status') return String(left.status || '').localeCompare(String(right.status || ''))

    const leftTime = Date.parse(left.offerDate || left.createdAt || '')
    const rightTime = Date.parse(right.offerDate || right.createdAt || '')
    return (Number.isNaN(rightTime) ? 0 : rightTime) - (Number.isNaN(leftTime) ? 0 : leftTime)
  })
}

function KpiIcon({ tone }) {
  const className = 'h-5 w-5'
  if (tone === 'violet') return <FileText className={className} />
  if (tone === 'amber') return <ShieldCheck className={className} />
  if (tone === 'green') return <CheckCircle2 className={className} />
  if (tone === 'rose') return <XCircle className={className} />
  return <Sparkles className={className} />
}

function getKpiToneClass(tone) {
  if (tone === 'violet') return 'bg-violet-50 text-violet-600'
  if (tone === 'amber') return 'bg-amber-50 text-amber-600'
  if (tone === 'green') return 'bg-emerald-50 text-emerald-600'
  if (tone === 'rose') return 'bg-rose-50 text-rose-600'
  return 'bg-emerald-50 text-emerald-600'
}

function OfferKpiCards({ summary }) {
  const cards = [
    { label: 'New Offers', value: summary.newCount, helper: summary.newCount ? 'Awaiting review' : 'No new offers', tone: 'emerald' },
    { label: 'Under Review', value: summary.underReviewCount, helper: summary.underReviewCount ? 'With your agent' : 'No offers', tone: 'violet' },
    { label: 'Conditionally Accepted', value: summary.conditionallyAcceptedCount, helper: summary.conditionallyAcceptedCount ? 'Conditions pending' : 'No offers', tone: 'amber' },
    { label: 'Accepted', value: summary.acceptedCount, helper: summary.acceptedCount ? 'Sale progressing' : 'No offers', tone: 'green' },
    { label: 'Declined', value: summary.declinedCount, helper: summary.declinedCount ? 'Not proceeding' : 'No offers', tone: 'rose' },
  ]

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <article key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-4">
            <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${getKpiToneClass(card.tone)}`}>
              <KpiIcon tone={card.tone} />
            </span>
            <div className="min-w-0">
              <strong className="block text-2xl font-semibold tracking-[-0.03em] text-[#0f2137]">{card.value}</strong>
              <span className="block text-sm font-medium text-[#4f6278]">{card.label}</span>
              <span className="mt-1 block text-xs font-medium text-[#6f8196]">{card.helper}</span>
            </div>
          </div>
        </article>
      ))}
    </section>
  )
}

function OfferCard({ offer, now }) {
  const meta = STATUS_META[offer.status] || STATUS_META.new
  const expiryDistance = getDaysUntil(offer.expiryDate, now)

  return (
    <article className={`rounded-2xl border p-5 shadow-sm ${offer.status === 'new' ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] ${meta.badge}`}>
          {meta.label}
        </span>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-amber-700">
            {meta.action}
          </span>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#708297] transition hover:border-slate-300 hover:text-[#0f2137]"
            title="Offer actions coming soon."
            disabled
          >
            <MoreVertical size={16} />
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1fr_1fr]">
        <div className="border-b border-slate-200 pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
          <span className="block text-xs font-medium text-[#60758c]">Offer Amount</span>
          <strong className="mt-1 block text-2xl font-semibold tracking-[-0.04em] text-[#0f2137]">{formatMoney(offer.offerAmount)}</strong>
          <div className="mt-5 space-y-3 text-sm">
            <div>
              <span className="block text-xs font-medium text-[#60758c]">Offer Date</span>
              <strong className="block font-semibold text-[#0f2137]">{formatDate(offer.offerDate, 'Awaiting date')}</strong>
            </div>
            <div>
              <span className="block text-xs font-medium text-[#60758c]">Expires</span>
              <strong className="block font-semibold text-[#0f2137]">
                {formatDate(offer.expiryDate, 'No expiry set')}
                {expiryDistance ? ` (${expiryDistance})` : ''}
              </strong>
            </div>
          </div>
        </div>

        <div className="space-y-4 border-b border-slate-200 pb-4 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-5">
          <div>
            <span className="block text-xs font-medium text-[#60758c]">Buyer</span>
            <strong className="mt-1 block text-sm font-semibold text-[#0f2137]">{offer.buyerName}</strong>
          </div>
          <div>
            <span className="block text-xs font-medium text-[#60758c]">Buyer Finance</span>
            <strong className="mt-1 block text-sm font-semibold text-[#0f2137]">{offer.financeStatus}</strong>
          </div>
          <div>
            <span className="block text-xs font-medium text-[#60758c]">Offer Type</span>
            <strong className="mt-1 block text-sm font-semibold text-[#0f2137]">{offer.offerType}</strong>
          </div>
          <div>
            <span className="block text-xs font-medium text-[#60758c]">Conditions</span>
            <strong className="mt-1 block text-sm font-semibold text-[#0f2137]">{offer.conditions}</strong>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-5">
          <div>
            <span className="block text-xs font-medium text-[#60758c]">Offer Notes</span>
            <p className="mt-1 text-sm leading-6 text-[#24384d]">{offer.notes}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#07966f] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#067e5f] disabled:cursor-not-allowed disabled:opacity-60"
              title="Offer review coming soon."
              disabled
            >
              Review offer
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function EmptyOffersState() {
  return (
    <article className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-6 py-10 text-center">
      <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0f7f64] shadow-sm">
        <CircleDollarSign size={24} />
      </span>
      <h3 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-[#0f2137]">No offers received yet</h3>
      <p className="mx-auto mt-2 max-w-[520px] text-sm leading-6 text-[#60758c]">
        When an offer is submitted for your property, it will appear here for review.
      </p>
    </article>
  )
}

function OffersSummaryPanel({ summary }) {
  const rows = [
    { label: 'Highest Offer', value: formatMoney(summary.highestOffer), tone: 'green' },
    { label: 'Average Offer', value: formatMoney(summary.averageOffer), tone: 'amber' },
    { label: 'Lowest Offer', value: formatMoney(summary.lowestOffer), tone: 'amber' },
    { label: 'Your Asking Price', value: formatMoney(summary.askingPrice), tone: 'rose' },
    { label: 'Offer to Asking %', value: summary.offerToAskingPercentage ? `${summary.offerToAskingPercentage}%` : 'Not available', tone: 'green' },
  ]

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold tracking-[-0.03em] text-[#0f2137]">Offers Summary</h3>
      <div className="mt-5 divide-y divide-slate-100">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 py-3 first:pt-0">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${row.tone === 'green' ? 'bg-emerald-50 text-emerald-600' : row.tone === 'rose' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                <CircleDollarSign size={15} />
              </span>
              <span className="text-sm font-medium text-[#526981]">{row.label}</span>
            </div>
            <strong className={`text-right text-sm font-semibold ${row.label === 'Offer to Asking %' ? 'text-[#07966f]' : 'text-[#0f2137]'}`}>{row.value}</strong>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="mt-4 inline-flex min-h-[42px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0f2137] transition hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
        title="Offer comparison coming soon."
        disabled
      >
        View comparison
      </button>
    </aside>
  )
}

function WhatHappensNextCard() {
  const steps = [
    ['Review offers', 'Compare the details and terms.'],
    ['Discuss with your agent', "We'll guide you on the best option."],
    ['Make a decision', 'Accept, counter or decline an offer.'],
    ['Finalise the sale', "We'll prepare the sale agreement."],
  ]

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold tracking-[-0.03em] text-[#0f2137]">What happens next?</h3>
      <div className="mt-5 space-y-5">
        {steps.map(([title, body], index) => (
          <div key={title} className="flex gap-3">
            <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${index === 0 ? 'bg-[#16b982] text-white' : 'bg-slate-100 text-[#526981]'}`}>
              {index + 1}
            </span>
            <div>
              <strong className="block text-sm font-semibold text-[#0f2137]">{title}</strong>
              <p className="mt-1 text-xs leading-5 text-[#60758c]">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}

function HelpCard({ agent }) {
  const href = agent?.email ? `mailto:${agent.email}` : ''

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex gap-4">
        <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <HelpCircle size={23} />
        </span>
        <div>
          <h3 className="text-base font-semibold tracking-[-0.03em] text-[#0f2137]">Need help understanding an offer?</h3>
          <p className="mt-2 text-sm leading-6 text-[#60758c]">
            {agent?.name || 'Your agent'} is here to help you review and compare offers.
          </p>
          {href ? (
            <a
              href={href}
              className="mt-4 inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0f2137] transition hover:border-slate-300"
            >
              <MessageCircle size={16} />
              Message your agent
            </a>
          ) : (
            <button
              type="button"
              className="mt-4 inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-[#0f2137] disabled:cursor-not-allowed disabled:opacity-60"
              title="Agent messaging coming soon."
              disabled
            >
              <MessageCircle size={16} />
              Message your agent
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

function CurrentOffersSection({ offers, sortMode, onSortChange, now }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.03em] text-[#0f2137]">Current Offers</h2>
          <p className="mt-1 text-sm text-[#60758c]">Review and compare offers received for your property.</p>
        </div>
        <label className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0f2137]">
          <span>Sort by:</span>
          <select
            value={sortMode}
            onChange={(event) => onSortChange(event.target.value)}
            className="appearance-none bg-transparent pr-6 text-sm font-semibold text-[#0f2137] outline-none"
          >
            <option value="newest">Newest</option>
            <option value="highest_offer">Highest offer</option>
            <option value="expiring_soon">Expiring soon</option>
            <option value="status">Status</option>
          </select>
          <ChevronDown size={15} className="-ml-6 pointer-events-none text-[#60758c]" />
        </label>
      </div>

      <div className="mt-5 space-y-3">
        {offers.length ? offers.map((offer) => <OfferCard key={offer.id} offer={offer} now={now} />) : <EmptyOffersState />}
        <article className="rounded-2xl border border-slate-200 bg-slate-50/70 px-5 py-4">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#60758c] shadow-sm">
              <Timer size={19} />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[#0f2137]">More offers will appear here</h3>
              <p className="mt-1 text-sm text-[#60758c]">We'll notify you as soon as new offers are received.</p>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}

function SellerOffersPage({ offers = [], askingPrice = 0, agent = {}, transactionId = '', propertyId = '' }) {
  const [sortMode, setSortMode] = useState('newest')
  const [now] = useState(() => Date.now())
  const payload = useMemo(
    () => buildSellerPortalOffersPayload(offers, { askingPrice, agent, transactionId, propertyId }),
    [agent, askingPrice, offers, propertyId, transactionId],
  )
  const sortedOffers = useMemo(() => sortOffers(payload.offers, sortMode), [payload.offers, sortMode])

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#0f2137]">Offers</h1>
          <p className="mt-2 text-sm leading-6 text-[#526981]">View and manage offers received for your property.</p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#0f2137] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#162c45] disabled:cursor-not-allowed disabled:opacity-60"
          title="Offer download coming soon."
          disabled
        >
          <Download size={16} />
          Download all offers
        </button>
      </header>

      <div className="space-y-6">
        <OfferKpiCards summary={payload.summary} />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <CurrentOffersSection offers={sortedOffers} sortMode={sortMode} onSortChange={setSortMode} now={now} />
          </div>
          <div className="space-y-5">
            <OffersSummaryPanel summary={payload.summary} />
            <WhatHappensNextCard />
            <HelpCard agent={payload.agent} />
          </div>
        </div>

        <footer className="flex items-center gap-2 text-xs text-[#60758c]">
          <ShieldCheck size={14} />
          Your information is secure and only shared with your transaction team.
          <ArrowRight size={14} className="hidden sm:inline" />
        </footer>
      </div>
    </div>
  )
}

export default SellerOffersPage
