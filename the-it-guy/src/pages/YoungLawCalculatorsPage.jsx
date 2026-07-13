import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  FileText,
  Home,
  Landmark,
  Mail,
  Percent,
  Phone,
  ReceiptText,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  calculateDeceasedEstateCosts,
  calculateSellerNetProceeds,
  calculateYoungLawTransfer,
  DEFAULT_DECEASED_ESTATE_INPUT,
  DEFAULT_SELLER_PROCEEDS_INPUT,
  DEFAULT_YOUNG_LAW_TRANSFER_INPUT,
  getQuoteLeadMessage,
  SARS_CGT_SOURCE_URL,
  SARS_ESTATE_DUTY_SOURCE_URL,
  YOUNG_LAW_ACCENT,
  YOUNG_LAW_WEBSITE_URL,
} from '../services/youngLawCalculatorService'
import {
  formatZar,
  SARS_TRANSFER_DUTY_SOURCE_URL,
  TRANSFER_DUTY_TABLE_EFFECTIVE,
} from '../services/conveyancingCostCalculator'

const LOGO_SRC = '/brand/young-law-logo.jpg'
const CONTACT_EMAIL = 'info@younglaw.co.za'
const CONTACT_PHONE = '010 446 7675'

const calcCards = [
  {
    key: 'transfer',
    title: 'Transfer Cost',
    kicker: 'Buying',
    description: 'Transfer, bond and lodgement estimate.',
    icon: Home,
  },
  {
    key: 'seller',
    title: 'Seller Net Proceeds',
    kicker: 'Selling',
    description: 'Sale proceeds after expected deductions.',
    icon: WalletCards,
  },
  {
    key: 'estate',
    title: 'Deceased Estate',
    kicker: 'Estates',
    description: 'Duty, executor fee and cash pressure.',
    icon: Scale,
  },
]

function clampMoney(value, min, max) {
  return Math.min(Math.max(Number(value || 0), min), max)
}

function parseEditableNumber(rawValue) {
  const cleaned = String(rawValue ?? '').replace(/[^\d.-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return Number.NaN
  return Number(cleaned)
}

function snapToStep(value, min, step) {
  const numericStep = Number(step || 0)
  if (!numericStep) return value
  const snapped = Math.round((value - min) / numericStep) * numericStep + min
  return Number(snapped.toFixed(4))
}

function normaliseSliderValue(value, min, max, step) {
  const safeMin = Number(min)
  const safeMax = Math.max(Number(max), safeMin)
  const clamped = Math.min(Math.max(Number(value || 0), safeMin), safeMax)
  return Math.min(Math.max(snapToStep(clamped, safeMin, step), safeMin), safeMax)
}

function formatEditableValue(value, formatter) {
  return formatter(value).replace(/\u00a0/g, ' ')
}

function roundToStep(value, step = 50000) {
  return Math.round(Number(value || 0) / step) * step
}

function formatScenarioDelta(delta) {
  if (!delta) return 'No change'
  return `${delta > 0 ? '+' : '-'}${formatZar(Math.abs(delta), { compact: true })}`
}

function getScenarioTone(delta, positiveDirection = 'lower') {
  if (!delta) return 'neutral'
  const isPositive = positiveDirection === 'higher' ? delta > 0 : delta < 0
  return isPositive ? 'good' : 'alert'
}

function getScenarioToneClass(tone) {
  if (tone === 'good') return 'bg-[#eaf4ee] text-[#16633f]'
  if (tone === 'alert') return 'bg-[#f9ece8] text-[#9f2727]'
  return 'bg-[#f8f7f2] text-[#5f5a51]'
}

function getQuoteSummary(type, result) {
  if (type === 'seller') {
    return {
      title: 'Seller Net Proceeds',
      eyebrow: 'Sale proceeds',
      label: 'Estimated seller payout',
      value: formatZar(result.summary.netProceeds),
      detail: `Sale price ${formatZar(result.summary.salePrice)} with ${formatZar(result.summary.totalCosts)} in selected deductions.`,
    }
  }

  if (type === 'estate') {
    return {
      title: 'Deceased Estate',
      eyebrow: 'Estate administration',
      label: 'Estate duty estimate',
      value: formatZar(result.summary.estateDuty),
      detail: `Administration costs ${formatZar(result.summary.totalAdministrationCosts)} with liquidity position ${formatZar(result.summary.liquidityPosition)}.`,
    }
  }

  return {
    title: 'Transfer Cost',
    eyebrow: 'Buyer transfer estimate',
    label: 'Cash needed before lodgement',
    value: result.primaryMetric.display,
    detail: `Purchase price ${formatZar(result.input.purchasePrice)} with bond amount ${formatZar(result.input.bondAmount)}.`,
  }
}

function getEstimatePack(type, result) {
  if (type === 'seller') {
    const isShortfall = result.summary.netProceeds < 0
    return {
      signal: isShortfall ? 'Shortfall risk' : 'Payout looks positive',
      tone: isShortfall ? 'alert' : 'dark',
      narrative: isShortfall
        ? 'The selected settlement and selling costs currently exceed the expected sale proceeds.'
        : 'The estimate leaves a positive seller payout after the selected settlement and selling costs.',
      assumptions: [
        `Sale price: ${formatZar(result.summary.salePrice)}`,
        `Bond settlement: ${formatZar(result.summary.settlement)}`,
        `Agent commission: ${formatZar(result.summary.commission)}`,
        `Clearance and handover costs: ${formatZar(result.summary.clearanceTotal)}`,
      ],
      nextSteps: [
        'Confirm the bank settlement figure and notice timing.',
        'Request municipal and levy clearance figures before transfer.',
        'Decide whether a CGT planning signal should be included.',
      ],
    }
  }

  if (type === 'estate') {
    const hasLiquidityGap = result.summary.liquidityPosition < 0
    return {
      signal: hasLiquidityGap ? 'Liquidity gap' : 'Liquidity covered',
      tone: hasLiquidityGap ? 'alert' : 'dark',
      narrative: hasLiquidityGap
        ? 'The available cash may not cover the current estate duty and administration estimate.'
        : 'The available estate cash covers the current duty and administration estimate.',
      assumptions: [
        `Gross estate: ${formatZar(result.summary.grossEstate)}`,
        `Dutiable estate: ${formatZar(result.summary.dutiableEstate)}`,
        `Admin costs: ${formatZar(result.summary.totalAdministrationCosts)}`,
        `Cash position: ${formatZar(result.summary.liquidityPosition)}`,
      ],
      nextSteps: [
        'Confirm the asset inventory, liabilities and spouse deductions.',
        'Check whether immovable-property transfer work is required.',
        'Prepare a liquidity plan before finalising estate administration.',
      ],
    }
  }

  const bondAmount = Number(result.input.bondAmount || 0)
  const purchasePrice = Number(result.input.purchasePrice || 0)
  const bondRatio = purchasePrice > 0 ? Math.round((bondAmount / purchasePrice) * 100) : 0

  return {
    signal: bondAmount > 0 ? `${bondRatio}% bond scenario` : 'Cash purchase scenario',
    tone: 'dark',
    narrative: 'The estimate combines transfer duty, attorney fees, bond registration where selected, disbursements and VAT.',
    assumptions: [
      `Purchase price: ${formatZar(purchasePrice)}`,
      `Bond amount: ${formatZar(bondAmount)}`,
      `Matter type: ${result.input.transactionBasis === 'vat' ? 'VAT sale' : 'Resale'}`,
      `Buyer cash needed: ${result.primaryMetric.display}`,
    ],
    nextSteps: [
      'Confirm whether the transaction is a resale or VAT-inclusive sale.',
      'Check the final bond amount before issuing a formal quote.',
      'Prepare FICA, offer-to-purchase and property description details.',
    ],
  }
}

function buildEstimatePackText(type, result) {
  const summary = getQuoteSummary(type, result)
  const pack = getEstimatePack(type, result)
  return [
    `${summary.title} estimate`,
    `${summary.label}: ${summary.value}`,
    summary.detail,
    '',
    pack.signal,
    pack.narrative,
    '',
    'Assumptions',
    ...pack.assumptions.map((item) => `- ${item}`),
    '',
    'Next steps',
    ...pack.nextSteps.map((item) => `- ${item}`),
  ].join('\n')
}

function buildQuoteRequestMailto(type, result, draft = {}) {
  const summary = getQuoteSummary(type, result)
  const pack = getEstimatePack(type, result)
  const subject = encodeURIComponent(`Young Law quote request - ${summary.title}`)
  const lines = [
    `Quote request: ${summary.title}`,
    `${summary.label}: ${summary.value}`,
    summary.detail,
    '',
    `Signal: ${pack.signal}`,
    pack.narrative,
    '',
    'Assumptions',
    ...pack.assumptions.map((item) => `- ${item}`),
    '',
    'Likely next steps',
    ...pack.nextSteps.map((item) => `- ${item}`),
    '',
    getQuoteLeadMessage(type, result),
    '',
    'Client details',
    `Name: ${draft.name || 'Not provided'}`,
    `Phone: ${draft.phone || 'Not provided'}`,
    `Email: ${draft.email || 'Not provided'}`,
    `Preferred contact: ${draft.preference || 'Call me'}`,
    '',
    'Notes',
    draft.notes || 'Please contact me with a formal quote.',
  ]

  return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${encodeURIComponent(lines.join('\n'))}`
}

function LogoMark({ compact = false }) {
  return (
    <img
      src={LOGO_SRC}
      alt="Young Law Inc."
      className={`${compact ? 'h-11 w-24' : 'h-[4.25rem] w-[9.4rem]'} object-contain object-left mix-blend-darken`}
    />
  )
}

function IconBadge({ icon: Icon, dark = false }) {
  return (
    <span
      className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
        dark ? 'border-white/15 bg-white/10 text-white' : 'border-[#d8d2c5] bg-[#f8f7f2] text-[#191715]'
      }`}
    >
      <Icon size={18} />
    </span>
  )
}

function NumberDisplay({ label, value, tone = 'dark' }) {
  const toneClass = tone === 'gold' ? 'text-[#6f5609]' : tone === 'alert' ? 'text-[#9f2727]' : 'text-[#111111]'
  return (
    <div className="min-h-[86px] rounded-lg border border-[#d9d5ca] bg-white p-3 shadow-[0_8px_22px_rgba(32,27,20,0.035)]">
      <p className="text-[0.68rem] font-medium uppercase tracking-[0.14em] text-[#626766]">{label}</p>
      <strong className={`mt-2 block whitespace-nowrap text-[1.05rem] font-normal leading-tight sm:text-xl ${toneClass}`}>{value}</strong>
    </div>
  )
}

function SliderField({ label, value, min, max, step, onChange, format = formatZar, hint = '', inputMode = 'decimal' }) {
  const inputRef = useRef(null)
  const [draftValue, setDraftValue] = useState(() => formatEditableValue(value, format))
  const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0
  const inputId = useMemo(() => `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-exact-value`, [label])

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setDraftValue(formatEditableValue(value, format))
    }
  }, [format, value])

  function commitValue(rawValue) {
    const parsed = parseEditableNumber(rawValue)
    if (!Number.isFinite(parsed)) {
      setDraftValue(formatEditableValue(value, format))
      return
    }
    const nextValue = normaliseSliderValue(parsed, min, max, step)
    onChange(nextValue)
    setDraftValue(formatEditableValue(nextValue, format))
  }

  function handleInputChange(event) {
    const nextDraft = event.target.value
    setDraftValue(nextDraft)
    const parsed = parseEditableNumber(nextDraft)
    if (Number.isFinite(parsed) && parsed >= Number(min) && parsed <= Number(max)) {
      onChange(normaliseSliderValue(parsed, min, max, step))
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-[#d9d5ca] bg-white p-4 shadow-[0_8px_22px_rgba(32,27,20,0.035)]">
      <span className="grid grid-cols-[minmax(0,1fr)_minmax(118px,150px)] items-start gap-3">
        <label htmlFor={inputId} className="min-w-0 text-sm font-medium leading-5 text-[#171717]">{label}</label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode={inputMode}
          value={draftValue}
          onChange={handleInputChange}
          onBlur={(event) => commitValue(event.target.value)}
          onFocus={(event) => event.target.select()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.currentTarget.blur()
            }
            if (event.key === 'Escape') {
              setDraftValue(formatEditableValue(value, format))
              event.currentTarget.blur()
            }
          }}
          aria-label={`${label} exact value`}
          className="min-h-10 w-full rounded-lg border border-[#d9d5ca] bg-[#f8f7f2] px-3 text-right text-sm font-medium text-[#171717] outline-none transition focus:border-[#8a6b0b] focus:bg-white focus:ring-2 focus:ring-[#edc446]/35"
        />
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full appearance-none rounded-lg bg-[#dedbd1] outline-none"
        style={{
          accentColor: YOUNG_LAW_ACCENT,
          background: `linear-gradient(90deg, ${YOUNG_LAW_ACCENT} 0%, ${YOUNG_LAW_ACCENT} ${percentage}%, #dedbd1 ${percentage}%, #dedbd1 100%)`,
        }}
      />
      {hint ? <span className="text-xs font-normal leading-5 text-[#626766]">{hint}</span> : null}
    </div>
  )
}

function ToggleButton({ label, active, onClick, icon: Icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${
        active
          ? 'border-[#191715] bg-[#191715] text-white shadow-[0_8px_20px_rgba(0,0,0,0.1)]'
          : 'border-[#1d1d1d]/10 bg-white text-[#333333]'
      }`}
    >
      <Icon size={15} />
      <span className="truncate">{label}</span>
    </button>
  )
}

function SourceStrip({ links }) {
  if (!links?.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#1d1d1d]/10 bg-white px-3 text-xs font-medium text-[#464a49]"
        >
          <Landmark size={14} />
          {link.label}
        </a>
      ))}
    </div>
  )
}

function BreakdownList({ items }) {
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div key={item.key} className="grid grid-cols-[1fr_auto] gap-3 border-b border-[#1d1d1d]/10 py-3 last:border-b-0">
          <div className="min-w-0">
            <p className="text-sm font-medium text-[#191919]">{item.label}</p>
            {item.note ? <p className="mt-1 text-xs font-normal leading-5 text-[#626766]">{item.note}</p> : null}
          </div>
          <strong className="text-right text-sm font-medium text-[#111111]">{formatZar(item.amount)}</strong>
        </div>
      ))}
    </div>
  )
}

function QuoteCta({ type, result, onQuote }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-5 border-t border-[#d9d5ca] bg-[#f7f6f1]/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-lg sm:border sm:bg-white">
      <button
        type="button"
        onClick={() => onQuote(type, result)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#171412] px-4 text-sm font-medium text-white shadow-[0_10px_24px_rgba(0,0,0,0.14)]"
      >
        <Mail size={17} />
        Get a quote
      </button>
    </div>
  )
}

function StickyResultBar({ label, value, type, result, tone = 'dark', onQuote }) {
  const sentinelRef = useRef(null)
  const [isDocked, setIsDocked] = useState(false)
  const toneClass = tone === 'alert' ? 'text-[#9f2727]' : tone === 'gold' ? 'text-[#6f5609]' : 'text-[#141210]'
  const shellClass = isDocked
    ? 'fixed left-1/2 top-0 z-40 w-full max-w-[480px] -translate-x-1/2 bg-[#f7f6f1]/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-[#f7f6f1]/85'
    : 'relative bg-[#f7f6f1]/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-[#f7f6f1]/85'

  useEffect(() => {
    function updateDock() {
      const top = sentinelRef.current?.getBoundingClientRect().top ?? 1
      setIsDocked(top <= 0)
    }

    updateDock()
    window.addEventListener('scroll', updateDock, { passive: true })
    window.addEventListener('resize', updateDock)
    return () => {
      window.removeEventListener('scroll', updateDock)
      window.removeEventListener('resize', updateDock)
    }
  }, [])

  return (
    <div className="-mx-4">
      <div ref={sentinelRef} className="h-px" aria-hidden="true" />
      {isDocked ? <div className="h-[88px]" aria-hidden="true" /> : null}
      <div className={shellClass} data-young-law-result-shell={label.toLowerCase()}>
        <div className="grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[#d8d2c5] bg-white p-3 shadow-[0_12px_26px_rgba(32,27,20,0.08)]">
          <div className="min-w-0">
            <p className="text-[0.66rem] font-medium uppercase tracking-[0.14em] text-[#626766]">{label}</p>
            <strong aria-live="polite" className={`mt-1 block break-words font-serif text-xl font-normal leading-none ${toneClass}`}>
              {value}
            </strong>
          </div>
          <button
            type="button"
            onClick={() => onQuote(type, result)}
            aria-label={`Get a quote for ${label.toLowerCase()}`}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#171412] px-3 text-xs font-medium text-white shadow-[0_8px_18px_rgba(0,0,0,0.12)]"
          >
            <Mail size={15} />
            Quote
          </button>
        </div>
      </div>
    </div>
  )
}

function EstimatePack({ type, result }) {
  const [activeTab, setActiveTab] = useState('snapshot')
  const [copyState, setCopyState] = useState('idle')
  const [manualCopyText, setManualCopyText] = useState('')
  const summary = getQuoteSummary(type, result)
  const pack = getEstimatePack(type, result)
  const toneClass = pack.tone === 'alert' ? 'text-[#9f2727]' : 'text-[#141210]'

  useEffect(() => {
    setActiveTab('snapshot')
  }, [type])

  useEffect(() => {
    setCopyState('idle')
    setManualCopyText('')
  }, [type, summary.value, pack.signal])

  async function copyEstimate() {
    const text = buildEstimatePackText(type, result)
    let copied = false

    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text)
          copied = true
        } catch {
          copied = false
        }
      }

      if (!copied) {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.top = '0'
        textarea.style.left = '-9999px'
        textarea.style.fontSize = '16px'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        textarea.setSelectionRange(0, textarea.value.length)
        copied = document.execCommand('copy')
        document.body.removeChild(textarea)
      }

      if (!copied) {
        setManualCopyText(text)
        setCopyState('manual')
        return
      }

      setManualCopyText('')
      setCopyState('copied')
    } catch {
      setManualCopyText(text)
      setCopyState('manual')
    }
  }

  return (
    <section className="grid gap-3 rounded-lg border border-[#d8d2c5] bg-white p-4 shadow-[0_8px_24px_rgba(32,27,20,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#8a6b0b]">Estimate pack</p>
          <h2 className="mt-1 text-base font-medium text-[#141210]">{summary.title}</h2>
        </div>
        <button
          type="button"
          onClick={copyEstimate}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#d8d2c5] bg-[#f8f7f2] px-3 text-xs font-medium text-[#171412]"
        >
          <ClipboardCheck size={15} />
          {copyState === 'copied' ? 'Copied' : copyState === 'manual' ? 'Select text' : 'Copy'}
        </button>
      </div>

      {manualCopyText ? (
        <label className="grid gap-2 rounded-lg border border-[#d8d2c5] bg-[#f8f7f2] p-3">
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#626766]">Estimate summary</span>
          <textarea
            readOnly
            rows={5}
            value={manualCopyText}
            onFocus={(event) => event.target.select()}
            onClick={(event) => event.currentTarget.select()}
            aria-label="Estimate summary text"
            className="min-h-28 resize-none rounded-lg border border-[#d9d5ca] bg-white px-3 py-3 text-sm font-normal leading-6 text-[#171717] outline-none focus:border-[#8a6b0b] focus:ring-2 focus:ring-[#edc446]/35"
          />
        </label>
      ) : null}

      <div className="grid grid-cols-3 gap-2 rounded-lg bg-[#f8f7f2] p-1">
        {[
          ['snapshot', 'Snapshot'],
          ['assumptions', 'Assumptions'],
          ['next', 'Next'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            aria-pressed={activeTab === key}
            className={`min-h-9 rounded-md px-2 text-xs font-medium transition ${
              activeTab === key ? 'bg-white text-[#141210] shadow-[0_6px_14px_rgba(32,27,20,0.08)]' : 'text-[#626766]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'snapshot' ? (
        <div className="grid gap-3">
          <div className="rounded-lg border border-[#d9d5ca] bg-[#f8f7f2] p-3">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#626766]">{summary.label}</p>
            <strong className="mt-1 block break-words font-serif text-[1.7rem] font-normal leading-none text-[#141210]">{summary.value}</strong>
          </div>
          <div>
            <p className={`text-sm font-medium ${toneClass}`}>{pack.signal}</p>
            <p className="mt-1 text-sm font-normal leading-6 text-[#626766]">{pack.narrative}</p>
          </div>
        </div>
      ) : null}

      {activeTab === 'assumptions' ? (
        <div className="grid gap-2">
          {pack.assumptions.map((item) => (
            <div key={item} className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-[#d9d5ca] bg-[#f8f7f2] p-3">
              <ShieldCheck size={16} className="mt-0.5 text-[#6f5609]" />
              <p className="text-sm font-medium leading-6 text-[#171717]">{item}</p>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === 'next' ? (
        <div className="grid gap-2">
          {pack.nextSteps.map((item, index) => (
            <div key={item} className="grid grid-cols-[auto_1fr] gap-3 rounded-lg border border-[#d9d5ca] bg-[#f8f7f2] p-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-[#171412] text-xs font-medium text-white">{index + 1}</span>
              <p className="text-sm font-medium leading-6 text-[#171717]">{item}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function ScenarioStudio({ metricLabel, scenarios, positiveDirection = 'lower', formatValue = formatZar, onApply }) {
  if (!scenarios?.length) return null

  return (
    <section className="rounded-lg border border-[#d8d2c5] bg-white p-4 shadow-[0_8px_24px_rgba(32,27,20,0.04)]">
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={17} className="text-[#6f5609]" />
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#8a6b0b]">What-if</p>
          <h2 className="mt-1 text-base font-medium text-[#141210]">Scenario studio</h2>
        </div>
      </div>

      <div className="mt-3 divide-y divide-[#d9d5ca]">
        {scenarios.map((scenario) => {
          const tone = getScenarioTone(scenario.delta, positiveDirection)
          return (
            <div key={scenario.key} className="grid gap-3 py-3 first:pt-0 last:pb-0">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#171717]">{scenario.label}</p>
                  <p className="mt-1 text-xs font-normal leading-5 text-[#626766]">{scenario.caption}</p>
                </div>
                <div className="text-right">
                  <p className="text-[0.66rem] font-medium uppercase tracking-[0.14em] text-[#626766]">{metricLabel}</p>
                  <strong className="mt-1 block whitespace-nowrap text-sm font-medium text-[#141210]">{formatValue(scenario.value)}</strong>
                  <span className={`mt-1 inline-flex min-h-6 items-center rounded-full px-2 text-[0.68rem] font-medium ${getScenarioToneClass(tone)}`}>
                    {formatScenarioDelta(scenario.delta)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onApply(scenario.input)}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-[#d8d2c5] bg-[#f8f7f2] px-3 text-xs font-medium text-[#171412] transition active:scale-[0.99]"
                aria-label={`Apply ${scenario.label}`}
              >
                Apply
                <ArrowRight size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function QuoteInput({ label, value, onChange, type = 'text', inputMode = 'text', placeholder = '' }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#626766]">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-11 rounded-lg border border-[#d9d5ca] bg-[#f8f7f2] px-3 text-sm font-medium text-[#171717] outline-none transition placeholder:text-[#8d8a82] focus:border-[#8a6b0b] focus:bg-white focus:ring-2 focus:ring-[#edc446]/35"
      />
    </label>
  )
}

function QuotePreferenceButton({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-10 rounded-lg border px-3 text-xs font-medium transition ${
        active
          ? 'border-[#171412] bg-[#171412] text-white'
          : 'border-[#d9d5ca] bg-white text-[#333333]'
      }`}
    >
      {label}
    </button>
  )
}

function QuoteRequestSheet({ request, onClose }) {
  const [draft, setDraft] = useState({
    name: '',
    phone: '',
    email: '',
    preference: 'Call me',
    notes: '',
  })

  const summary = request ? getQuoteSummary(request.type, request.result) : null

  useEffect(() => {
    if (!request) return

    setDraft((previous) => ({
      ...previous,
      notes: previous.notes || 'Please contact me with a formal quote.',
    }))

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [request])

  if (!request || !summary) return null

  const mailto = buildQuoteRequestMailto(request.type, request.result, draft)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#171412]/42 px-3 pb-3 pt-12 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="young-law-quote-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close quote request" onClick={onClose} />
      <section className="relative grid max-h-[calc(100dvh-3rem)] w-full max-w-[480px] overflow-hidden rounded-lg border border-[#d8d2c5] bg-[#f7f6f1] shadow-[0_24px_70px_rgba(0,0,0,0.24)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#d9d5ca] bg-[#f7f6f1] px-4 py-3">
          <LogoMark compact />
          <button type="button" onClick={onClose} className="flex size-10 items-center justify-center rounded-lg border border-[#d8d2c5] bg-white text-[#171412]" aria-label="Close quote request">
            <X size={17} />
          </button>
        </div>

        <div className="grid gap-4 overflow-y-auto px-4 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#8a6b0b]">{summary.eyebrow}</p>
            <h2 id="young-law-quote-title" className="mt-1 font-serif text-[1.65rem] font-normal leading-tight text-[#141210]">Request a formal quote</h2>
            <p className="mt-2 text-sm font-normal leading-6 text-[#626766]">Send Young Law a clean snapshot of this estimate and your preferred contact details.</p>
          </div>

          <div className="rounded-lg border border-[#211d19]/10 bg-[#171412] p-4 text-white shadow-[0_12px_28px_rgba(0,0,0,0.14)]">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/60">{summary.title}</p>
            <strong className="mt-2 block break-words font-serif text-[2rem] font-normal leading-none text-white">{summary.value}</strong>
            <p className="mt-3 text-xs font-normal leading-5 text-white/70">{summary.detail}</p>
          </div>

          <div className="grid gap-3 rounded-lg border border-[#d8d2c5] bg-white p-4 shadow-[0_8px_22px_rgba(32,27,20,0.035)]">
            <QuoteInput label="Full name" value={draft.name} placeholder="Your name" onChange={(value) => setDraft((previous) => ({ ...previous, name: value }))} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <QuoteInput label="Phone" value={draft.phone} inputMode="tel" placeholder="Contact number" onChange={(value) => setDraft((previous) => ({ ...previous, phone: value }))} />
              <QuoteInput label="Email" value={draft.email} type="email" inputMode="email" placeholder="Email address" onChange={(value) => setDraft((previous) => ({ ...previous, email: value }))} />
            </div>

            <div className="grid gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#626766]">Preferred contact</p>
              <div className="grid grid-cols-3 gap-2">
                {['Call me', 'Email me', 'Either'].map((option) => (
                  <QuotePreferenceButton
                    key={option}
                    label={option}
                    active={draft.preference === option}
                    onClick={() => setDraft((previous) => ({ ...previous, preference: option }))}
                  />
                ))}
              </div>
            </div>

            <label className="grid gap-2">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-[#626766]">Notes</span>
              <textarea
                value={draft.notes}
                onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))}
                rows={3}
                className="min-h-24 rounded-lg border border-[#d9d5ca] bg-[#f8f7f2] px-3 py-3 text-sm font-normal leading-6 text-[#171717] outline-none transition placeholder:text-[#8d8a82] focus:border-[#8a6b0b] focus:bg-white focus:ring-2 focus:ring-[#edc446]/35"
              />
            </label>
          </div>
        </div>

        <div className="grid gap-2 border-t border-[#d9d5ca] bg-[#f7f6f1]/95 px-4 py-3 backdrop-blur">
          <a href={mailto} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#171412] px-4 text-sm font-medium text-white shadow-[0_10px_24px_rgba(0,0,0,0.14)]">
            <Mail size={17} />
            Email Young Law
          </a>
          <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#d8d2c5] bg-white px-4 text-sm font-medium text-[#171412]">
            <Phone size={16} />
            Call {CONTACT_PHONE}
          </a>
        </div>
      </section>
    </div>
  )
}

function Landing({ onSelect }) {
  return (
    <section className="relative grid min-h-[100dvh] content-between gap-6 overflow-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.9rem,env(safe-area-inset-top))]">
      <img src={LOGO_SRC} alt="" aria-hidden="true" className="pointer-events-none absolute -right-24 top-24 w-[23rem] opacity-[0.025] mix-blend-darken" />
      <div className="relative z-10">
        <div className="flex items-center justify-between gap-4">
          <LogoMark />
          <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#d8d2c5] bg-white px-3 text-xs font-medium text-[#171412] shadow-[0_8px_20px_rgba(32,27,20,0.04)]" aria-label={`Call Young Law on ${CONTACT_PHONE}`}>
            <Phone size={17} />
            <span>{CONTACT_PHONE}</span>
          </a>
        </div>

        <div className="mt-8">
          <h1 className="max-w-[11ch] font-serif text-[2.35rem] font-normal leading-[1.08] text-[#191715]">
            Clear costs before the call.
          </h1>
          <p className="mt-4 max-w-[28rem] text-[0.96rem] font-normal leading-7 text-[#505655]">
            Estimate a transfer, sale or estate matter, then ask Young Law for a formal quote.
          </p>
        </div>

        <div className="mt-7 grid gap-2.5">
          {calcCards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => onSelect(card.key)}
                className="grid min-h-[92px] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-[#d8d2c5] bg-white/96 p-3.5 text-left shadow-[0_8px_24px_rgba(32,27,20,0.04)] backdrop-blur transition active:scale-[0.99]"
              >
                <IconBadge icon={Icon} />
                <span className="min-w-0">
                  <span className="block text-xs font-medium uppercase tracking-[0.16em] text-[#8a6b0b]">{card.kicker}</span>
                  <span className="mt-1 block text-lg font-medium text-[#141210]">{card.title}</span>
                  <span className="mt-1 block text-xs font-normal leading-5 text-[#626766]">{card.description}</span>
                </span>
                <ChevronRight size={20} className="text-[#5f5a51]" />
              </button>
            )
          })}
        </div>
      </div>

      <footer className="grid gap-3 rounded-lg border border-[#d8d2c5] bg-[#171412] p-4 text-white shadow-[0_10px_28px_rgba(0,0,0,0.12)]">
        <div className="flex items-center gap-3">
          <IconBadge icon={BadgeCheck} dark />
          <div>
            <p className="text-sm font-medium text-white">Ready for a formal quote.</p>
            <p className="mt-1 text-xs font-normal leading-5 text-white/60">Send the estimate through or call the office.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a href={`mailto:${CONTACT_EMAIL}`} className="rounded-lg border border-white/15 px-3 py-2 text-center text-xs font-medium text-white">Email</a>
          <a href={YOUNG_LAW_WEBSITE_URL} target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 px-3 py-2 text-center text-xs font-medium text-white">Website</a>
        </div>
      </footer>
    </section>
  )
}

function CalculatorHeader({ title, eyebrow, onBack, icon: Icon }) {
  return (
    <header className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="flex size-11 items-center justify-center rounded-lg border border-[#d8d2c5] bg-[#f8f7f2] text-[#171412]" aria-label="Back to calculators">
            <ArrowLeft size={18} />
          </button>
          <LogoMark compact />
        </div>
        <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#d8d2c5] bg-white px-3 text-xs font-medium text-[#171412] shadow-[0_8px_20px_rgba(32,27,20,0.04)]" aria-label={`Call Young Law on ${CONTACT_PHONE}`}>
          <Phone size={15} />
          <span className="hidden min-[390px]:inline">{CONTACT_PHONE}</span>
          <span className="min-[390px]:hidden">Call</span>
        </a>
      </div>
      <div className="mt-5 flex items-start gap-3">
        <IconBadge icon={Icon} />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#8a6b0b]">{eyebrow}</p>
          <h1 className="mt-1 font-serif text-[1.95rem] font-normal leading-tight text-[#141210]">{title}</h1>
        </div>
      </div>
    </header>
  )
}

function TransferCalculator({ onBack, onQuote }) {
  const [input, setInput] = useState(() => ({ ...DEFAULT_YOUNG_LAW_TRANSFER_INPUT }))
  const result = useMemo(() => calculateYoungLawTransfer(input), [input])
  const purchasePrice = Number(input.purchasePrice)
  const bondAmount = Number(input.bondAmount)
  const scenarios = useMemo(() => {
    const currentValue = result.primaryMetric.value
    const eightyPercentBond = clampMoney(roundToStep(purchasePrice * 0.8), 0, purchasePrice)
    const scenarioInputs = [
      {
        key: 'eighty-bond',
        label: '80% bond',
        caption: 'Bond set to 80% of the purchase price.',
        input: { ...input, financeType: 'bond', bondAmount: eightyPercentBond },
      },
      {
        key: 'cash-purchase',
        label: 'Cash purchase',
        caption: 'No bond-registration component included.',
        input: { ...input, financeType: 'cash', bondAmount: 0 },
      },
      {
        key: 'vat-sale',
        label: 'VAT sale',
        caption: 'VAT-inclusive transaction treatment.',
        input: { ...input, transactionBasis: 'vat' },
      },
    ]

    return scenarioInputs.map((scenario) => {
      const scenarioResult = calculateYoungLawTransfer(scenario.input)
      return {
        ...scenario,
        value: scenarioResult.primaryMetric.value,
        delta: scenarioResult.primaryMetric.value - currentValue,
      }
    })
  }, [input, purchasePrice, result.primaryMetric.value])

  function update(field, value) {
    setInput((previous) => {
      const next = { ...previous, [field]: value }
      if (field === 'purchasePrice') {
        next.purchasePrice = value
        next.bondAmount = clampMoney(previous.bondAmount, 0, value)
      }
      if (field === 'financeType' && value === 'cash') {
        next.bondAmount = 0
      }
      if (field === 'financeType' && value === 'bond' && previous.bondAmount === 0) {
        next.bondAmount = Math.round(previous.purchasePrice * 0.8)
      }
      return next
    })
  }

  return (
    <section>
      <CalculatorHeader title="Transfer Cost" eyebrow="Buyer estimate" icon={Home} onBack={onBack} />
      <div className="grid gap-4 px-4 pb-5">
        <StickyResultBar label="Cash needed" value={result.primaryMetric.display} type="transfer" result={result} onQuote={onQuote} />

        <div className="rounded-lg border border-[#211d19]/10 bg-[#171412] p-4 text-white shadow-[0_12px_28px_rgba(0,0,0,0.14)]">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/60">Cash needed before lodgement</p>
          <strong className="mt-2 block break-words font-serif text-[2.25rem] font-normal leading-none">{result.primaryMetric.display}</strong>
          <p className="mt-3 text-xs font-normal leading-5 text-white/70">Transfer duty, legal fees, disbursements and VAT. Bond costs appear when finance is selected.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {result.secondaryMetrics.map((metric) => (
            <NumberDisplay key={metric.label} label={metric.label} value={formatZar(metric.value, { compact: true })} tone={metric.label === 'Transfer duty' ? 'gold' : 'dark'} />
          ))}
        </div>

        <EstimatePack type="transfer" result={result} />
        <ScenarioStudio metricLabel="Cash needed" scenarios={scenarios} onApply={setInput} />

        <SliderField label="Purchase price" min={500000} max={10000000} step={50000} value={purchasePrice} onChange={(value) => update('purchasePrice', value)} />
        <SliderField
          label="Bond amount"
          min={0}
          max={purchasePrice}
          step={50000}
          value={bondAmount}
          onChange={(value) => update('bondAmount', value)}
          hint={input.financeType === 'cash' ? 'Cash purchase selected.' : `${Math.round((bondAmount / Math.max(purchasePrice, 1)) * 100)}% finance selected.`}
        />

        <div className="grid gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#626766]">Matter type</p>
          <div className="flex gap-2">
            <ToggleButton label="Resale" icon={Building2} active={input.transactionBasis === 'resale'} onClick={() => update('transactionBasis', 'resale')} />
            <ToggleButton label="VAT sale" icon={Percent} active={input.transactionBasis === 'vat'} onClick={() => update('transactionBasis', 'vat')} />
          </div>
          <div className="flex gap-2">
            <ToggleButton label="Bond" icon={CircleDollarSign} active={input.financeType === 'bond'} onClick={() => update('financeType', 'bond')} />
            <ToggleButton label="Cash" icon={WalletCards} active={input.financeType === 'cash'} onClick={() => update('financeType', 'cash')} />
          </div>
        </div>

        <div className="rounded-lg border border-[#d8d2c5] bg-white p-4 shadow-[0_8px_22px_rgba(32,27,20,0.035)]">
          <div className="mb-2 flex items-center gap-2">
            <ReceiptText size={17} />
            <h2 className="text-base font-medium text-[#141210]">Estimate breakdown</h2>
          </div>
          <BreakdownList items={result.headlineItems} />
        </div>

        <SourceStrip links={[{ href: SARS_TRANSFER_DUTY_SOURCE_URL, label: `SARS transfer duty ${TRANSFER_DUTY_TABLE_EFFECTIVE}` }]} />
        <QuoteCta type="transfer" result={result} onQuote={onQuote} />
      </div>
    </section>
  )
}

function SellerCalculator({ onBack, onQuote }) {
  const [input, setInput] = useState(() => ({ ...DEFAULT_SELLER_PROCEEDS_INPUT }))
  const result = useMemo(() => calculateSellerNetProceeds(input), [input])
  const netTone = result.summary.netProceeds < 0 ? 'alert' : 'dark'
  const scenarios = useMemo(() => {
    const currentValue = result.summary.netProceeds
    const salePrice = Number(input.salePrice)
    const higherSalePrice = Math.min(12000000, roundToStep(salePrice * 1.05))
    const lowerSalePrice = Math.max(800000, roundToStep(salePrice * 0.95))
    const lowerCommission = Math.max(0, Number(input.agentCommissionRate) - 1)
    const scenarioInputs = [
      {
        key: 'offer-up',
        label: 'Offer +5%',
        caption: 'Expected sale price moves up by 5%.',
        input: { ...input, salePrice: higherSalePrice, bondSettlement: clampMoney(input.bondSettlement, 0, higherSalePrice) },
      },
      {
        key: 'offer-down',
        label: 'Offer -5%',
        caption: 'Expected sale price moves down by 5%.',
        input: { ...input, salePrice: lowerSalePrice, bondSettlement: clampMoney(input.bondSettlement, 0, lowerSalePrice) },
      },
      {
        key: 'lower-commission',
        label: 'Commission -1%',
        caption: 'Agent commission rate reduced by one point.',
        input: { ...input, agentCommissionRate: lowerCommission },
      },
    ]

    return scenarioInputs.map((scenario) => {
      const scenarioResult = calculateSellerNetProceeds(scenario.input)
      return {
        ...scenario,
        value: scenarioResult.summary.netProceeds,
        delta: scenarioResult.summary.netProceeds - currentValue,
      }
    })
  }, [input, result.summary.netProceeds])

  function update(field, value) {
    setInput((previous) => ({ ...previous, [field]: value }))
  }

  return (
    <section>
      <CalculatorHeader title="Seller Net" eyebrow="Sale proceeds" icon={WalletCards} onBack={onBack} />
      <div className="grid gap-4 px-4 pb-5">
        <StickyResultBar label="Seller payout" value={formatZar(result.summary.netProceeds)} type="seller" result={result} tone={netTone} onQuote={onQuote} />

        <div className="rounded-lg border border-[#d8d2c5] bg-white p-4 shadow-[0_8px_24px_rgba(32,27,20,0.04)]">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#8a6b0b]">Estimated seller payout</p>
          <strong className={`mt-2 block break-words font-serif text-[2.25rem] font-normal leading-none ${netTone === 'alert' ? 'text-[#9f2727]' : 'text-[#141210]'}`}>{formatZar(result.summary.netProceeds)}</strong>
          <div className="mt-4 h-3 overflow-hidden rounded-lg bg-[#e5e2d9]">
            <span className="block h-full rounded-lg bg-[#171412]" style={{ width: `${Math.max(5, 100 - result.summary.costRatio)}%` }} />
          </div>
          <p className="mt-3 text-xs font-normal leading-5 text-[#626766]">{result.summary.costRatio}% of the sale price is absorbed by selected settlement and selling costs.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <NumberDisplay label="Sale price" value={formatZar(result.summary.salePrice, { compact: true })} />
          <NumberDisplay label="Settlement" value={formatZar(result.summary.settlement, { compact: true })} />
          <NumberDisplay label="Commission" value={formatZar(result.summary.commission, { compact: true })} tone="gold" />
        </div>

        <EstimatePack type="seller" result={result} />
        <ScenarioStudio metricLabel="Net" scenarios={scenarios} positiveDirection="higher" onApply={setInput} />

        <SliderField label="Expected sale price" min={800000} max={12000000} step={50000} value={Number(input.salePrice)} onChange={(value) => update('salePrice', value)} />
        <SliderField label="Bond settlement" min={0} max={Number(input.salePrice)} step={25000} value={Number(input.bondSettlement)} onChange={(value) => update('bondSettlement', value)} />
        <SliderField label="Agent commission" min={0} max={8} step={0.25} value={Number(input.agentCommissionRate)} onChange={(value) => update('agentCommissionRate', value)} format={(value) => `${Number(value).toFixed(2)}%`} />
        <SliderField label="Rates clearance" min={0} max={90000} step={1000} value={Number(input.ratesClearance)} onChange={(value) => update('ratesClearance', value)} />
        <SliderField label="Levy clearance" min={0} max={50000} step={1000} value={Number(input.levyClearance)} onChange={(value) => update('levyClearance', value)} />
        <SliderField label="Certificates and handover buffer" min={0} max={75000} step={1000} value={Number(input.complianceCertificates) + Number(input.repairsAndMoving)} onChange={(value) => {
          update('complianceCertificates', Math.round(value * 0.36))
          update('repairsAndMoving', Math.round(value * 0.64))
        }} />

        <div className="grid gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#626766]">Planning signal</p>
          <div className="flex gap-2">
            <ToggleButton label="CGT off" icon={ShieldCheck} active={!input.estimateCgt} onClick={() => update('estimateCgt', false)} />
            <ToggleButton label="CGT signal" icon={Percent} active={input.estimateCgt} onClick={() => update('estimateCgt', true)} />
          </div>
        </div>

        {input.estimateCgt ? (
          <div className="grid gap-3">
            <SliderField label="Original base cost" min={300000} max={Number(input.salePrice)} step={25000} value={Number(input.baseCost)} onChange={(value) => update('baseCost', value)} />
            <SliderField label="Capital improvements" min={0} max={1000000} step={10000} value={Number(input.improvementCost)} onChange={(value) => update('improvementCost', value)} />
          </div>
        ) : null}

        <div className="rounded-lg border border-[#d8d2c5] bg-white p-4 shadow-[0_8px_22px_rgba(32,27,20,0.035)]">
          <div className="mb-2 flex items-center gap-2">
            <SlidersHorizontal size={17} />
            <h2 className="text-base font-medium text-[#141210]">Deductions</h2>
          </div>
          <BreakdownList items={result.costs} />
        </div>

        <SourceStrip links={[{ href: SARS_CGT_SOURCE_URL, label: 'SARS CGT reference' }]} />
        <QuoteCta type="seller" result={result} onQuote={onQuote} />
      </div>
    </section>
  )
}

function EstateCalculator({ onBack, onQuote }) {
  const [input, setInput] = useState(() => ({ ...DEFAULT_DECEASED_ESTATE_INPUT }))
  const result = useMemo(() => calculateDeceasedEstateCosts(input), [input])
  const liquidityTone = result.summary.liquidityPosition < 0 ? 'alert' : 'dark'
  const scenarios = useMemo(() => {
    const currentValue = result.summary.liquidityPosition
    const grossEstate = Number(input.grossEstate)
    const moreCash = clampMoney(Number(input.cashAvailable) + 500000, 0, grossEstate)
    const lessCash = clampMoney(Number(input.cashAvailable) - 250000, 0, grossEstate)
    const higherSpouseDeduction = clampMoney(Number(input.spouseDeduction) + 500000, 0, grossEstate)
    const scenarioInputs = [
      {
        key: 'cash-buffer',
        label: 'Cash +R500k',
        caption: 'Estate cash available increases by R500k.',
        input: { ...input, cashAvailable: moreCash },
      },
      {
        key: 'cash-pressure',
        label: 'Cash -R250k',
        caption: 'Available estate cash reduces by R250k.',
        input: { ...input, cashAvailable: lessCash },
      },
      {
        key: 'spouse-deduction',
        label: 'Spouse deduction +R500k',
        caption: 'Section 4q-style deduction increases.',
        input: { ...input, spouseDeduction: higherSpouseDeduction },
      },
    ]

    return scenarioInputs.map((scenario) => {
      const scenarioResult = calculateDeceasedEstateCosts(scenario.input)
      return {
        ...scenario,
        value: scenarioResult.summary.liquidityPosition,
        delta: scenarioResult.summary.liquidityPosition - currentValue,
      }
    })
  }, [input, result.summary.liquidityPosition])

  function update(field, value) {
    setInput((previous) => ({ ...previous, [field]: value }))
  }

  return (
    <section>
      <CalculatorHeader title="Estate Cost" eyebrow="Deceased estates" icon={Scale} onBack={onBack} />
      <div className="grid gap-4 px-4 pb-5">
        <StickyResultBar label="Estate duty" value={formatZar(result.summary.estateDuty)} type="estate" result={result} tone="gold" onQuote={onQuote} />

        <div className="rounded-lg border border-[#211d19]/10 bg-[#171412] p-4 text-white shadow-[0_12px_28px_rgba(0,0,0,0.14)]">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/60">Estate duty estimate</p>
          <strong className="mt-2 block break-words font-serif text-[2.25rem] font-normal leading-none">{formatZar(result.summary.estateDuty)}</strong>
          <p className="mt-3 text-xs font-normal leading-5 text-white/70">Uses the SARS R3.5m abatement and current 20% / 25% estate-duty bands.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <NumberDisplay label="Dutiable" value={formatZar(result.summary.dutiableEstate, { compact: true })} tone="gold" />
          <NumberDisplay label="Admin costs" value={formatZar(result.summary.totalAdministrationCosts, { compact: true })} />
          <NumberDisplay label="Liquidity" value={formatZar(result.summary.liquidityPosition, { compact: true })} tone={liquidityTone} />
        </div>

        <EstimatePack type="estate" result={result} />
        <ScenarioStudio metricLabel="Liquidity" scenarios={scenarios} positiveDirection="higher" onApply={setInput} />

        <SliderField label="Gross estate value" min={500000} max={50000000} step={100000} value={Number(input.grossEstate)} onChange={(value) => update('grossEstate', value)} />
        <SliderField label="Estate liabilities" min={0} max={Number(input.grossEstate)} step={50000} value={Number(input.liabilities)} onChange={(value) => update('liabilities', value)} />
        <SliderField label="Spouse deduction" min={0} max={Number(input.grossEstate)} step={50000} value={Number(input.spouseDeduction)} onChange={(value) => update('spouseDeduction', value)} />
        <SliderField label="Cash available in estate" min={0} max={Number(input.grossEstate)} step={50000} value={Number(input.cashAvailable)} onChange={(value) => update('cashAvailable', value)} />
        <SliderField label="Property transfer value" min={0} max={12000000} step={50000} value={Number(input.propertyTransferValue)} onChange={(value) => update('propertyTransferValue', value)} />

        <div className="grid gap-2">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#626766]">Executor VAT</p>
          <div className="flex gap-2">
            <ToggleButton label="VAT included" icon={ReceiptText} active={input.executorVatRegistered} onClick={() => update('executorVatRegistered', true)} />
            <ToggleButton label="VAT excluded" icon={ClipboardCheck} active={!input.executorVatRegistered} onClick={() => update('executorVatRegistered', false)} />
          </div>
        </div>

        <div className="rounded-lg border border-[#d8d2c5] bg-white p-4 shadow-[0_8px_22px_rgba(32,27,20,0.035)]">
          <div className="mb-2 flex items-center gap-2">
            <FileText size={17} />
            <h2 className="text-base font-medium text-[#141210]">Estate estimate</h2>
          </div>
          <BreakdownList items={result.costs} />
        </div>

        <SourceStrip links={[{ href: SARS_ESTATE_DUTY_SOURCE_URL, label: 'SARS estate duty' }]} />
        <QuoteCta type="estate" result={result} onQuote={onQuote} />
      </div>
    </section>
  )
}

function YoungLawCalculatorsPage() {
  const [active, setActive] = useState('')
  const [quoteRequest, setQuoteRequest] = useState(null)

  function selectCalculator(key) {
    setQuoteRequest(null)
    setActive(key)
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  function goBack() {
    setQuoteRequest(null)
    setActive('')
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  function openQuote(type, result) {
    setQuoteRequest({ type, result })
  }

  return (
    <main
      className="min-h-[100dvh] bg-[#f7f6f1] text-[#111111] antialiased"
      style={{ fontFamily: 'Inter, Montserrat, ui-sans-serif, system-ui, sans-serif' }}
    >
      <div className="mx-auto min-h-[100dvh] w-full max-w-[480px]">
        {!active ? <Landing onSelect={selectCalculator} /> : null}
        {active === 'transfer' ? <TransferCalculator onBack={goBack} onQuote={openQuote} /> : null}
        {active === 'seller' ? <SellerCalculator onBack={goBack} onQuote={openQuote} /> : null}
        {active === 'estate' ? <EstateCalculator onBack={goBack} onQuote={openQuote} /> : null}

        {active ? (
          <nav className="px-4 pb-6">
            <div className="grid grid-cols-3 gap-2">
              {calcCards.map((card) => {
                const Icon = card.icon
                const selected = active === card.key
                return (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => selectCalculator(card.key)}
                    className={`min-h-12 rounded-lg border px-2 text-xs font-medium transition ${
                      selected
                        ? 'border-[#171412] bg-[#171412] text-white'
                        : 'border-[#1d1d1d]/10 bg-white text-[#111111]'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-1">
                      <Icon size={14} />
                      <span className="truncate">{card.kicker}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </nav>
        ) : null}
      </div>

      <QuoteRequestSheet request={quoteRequest} onClose={() => setQuoteRequest(null)} />

      <a
        href={YOUNG_LAW_WEBSITE_URL}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-4 right-4 hidden min-h-10 items-center gap-2 rounded-lg border border-[#d8d2c5] bg-white px-3 text-xs font-medium text-[#111111] shadow-[0_8px_22px_rgba(32,27,20,0.05)] sm:inline-flex"
      >
        Young Law
        <ArrowRight size={14} />
      </a>
    </main>
  )
}

export default YoungLawCalculatorsPage
