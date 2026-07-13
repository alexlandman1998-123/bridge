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
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { useMemo, useState } from 'react'
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
    description: 'Buyer cash needed for transfer, bond and lodgement.',
    icon: Home,
  },
  {
    key: 'seller',
    title: 'Seller Net Proceeds',
    kicker: 'Selling',
    description: 'What the seller may walk away with after deductions.',
    icon: WalletCards,
  },
  {
    key: 'estate',
    title: 'Deceased Estate',
    kicker: 'Estates',
    description: 'Estate duty, executor cost and liquidity pressure.',
    icon: Scale,
  },
]

function clampMoney(value, min, max) {
  return Math.min(Math.max(Number(value || 0), min), max)
}

function buildMailto(type, result) {
  const subject = encodeURIComponent(`Young Law ${type} calculator quote`)
  const body = encodeURIComponent(`${getQuoteLeadMessage(type, result)}\n\nPlease contact me with a formal quote.`)
  return `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
}

function LogoMark({ compact = false }) {
  return (
    <div className={`overflow-hidden rounded-lg border border-[#1d1d1d]/10 bg-white shadow-[0_16px_40px_rgba(0,0,0,0.08)] ${compact ? 'h-14 w-24' : 'h-24 w-40'}`}>
      <img src={LOGO_SRC} alt="Young Law Inc." className="h-full w-full object-contain p-2" />
    </div>
  )
}

function IconBadge({ icon: Icon, dark = false }) {
  return (
    <span
      className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${
        dark ? 'border-white/15 bg-white/10 text-white' : 'border-[#1d1d1d]/10 bg-white text-[#111111]'
      }`}
    >
      <Icon size={18} />
    </span>
  )
}

function NumberDisplay({ label, value, tone = 'dark' }) {
  const toneClass = tone === 'gold' ? 'text-[#6f5609]' : tone === 'alert' ? 'text-[#9f2727]' : 'text-[#111111]'
  return (
    <div className="min-h-[86px] rounded-lg border border-[#1d1d1d]/10 bg-white p-3 shadow-[0_12px_30px_rgba(0,0,0,0.06)]">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#6f7372]">{label}</p>
      <strong className={`mt-2 block break-words text-[1rem] font-black leading-tight sm:text-xl ${toneClass}`}>{value}</strong>
    </div>
  )
}

function SliderField({ label, value, min, max, step, onChange, format = formatZar, hint = '' }) {
  const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <label className="grid gap-3 rounded-lg border border-[#1d1d1d]/10 bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.05)]">
      <span className="flex items-start justify-between gap-3">
        <span className="text-sm font-extrabold text-[#171717]">{label}</span>
        <span className="text-right text-sm font-black text-[#171717]">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full appearance-none rounded-lg bg-[#dedbd1] outline-none"
        style={{
          accentColor: YOUNG_LAW_ACCENT,
          background: `linear-gradient(90deg, ${YOUNG_LAW_ACCENT} 0%, ${YOUNG_LAW_ACCENT} ${percentage}%, #dedbd1 ${percentage}%, #dedbd1 100%)`,
        }}
      />
      {hint ? <span className="text-xs font-semibold leading-5 text-[#6f7372]">{hint}</span> : null}
    </label>
  )
}

function ToggleButton({ label, active, onClick, icon: Icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-extrabold transition ${
        active
          ? 'border-[#111111] bg-[#111111] text-white shadow-[0_12px_30px_rgba(0,0,0,0.16)]'
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
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-[#1d1d1d]/10 bg-white px-3 text-xs font-bold text-[#464a49]"
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
            <p className="text-sm font-extrabold text-[#191919]">{item.label}</p>
            {item.note ? <p className="mt-1 text-xs font-semibold leading-5 text-[#6f7372]">{item.note}</p> : null}
          </div>
          <strong className="text-right text-sm font-black text-[#111111]">{formatZar(item.amount)}</strong>
        </div>
      ))}
    </div>
  )
}

function QuoteCta({ type, result }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-5 border-t border-[#1d1d1d]/10 bg-[#f4f5f5]/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-lg sm:border sm:bg-white">
      <a
        href={buildMailto(type, result)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#111111] px-4 text-sm font-black text-white shadow-[0_16px_34px_rgba(0,0,0,0.22)]"
      >
        <Mail size={17} />
        Get a quote
      </a>
    </div>
  )
}

function Landing({ onSelect }) {
  return (
    <section className="grid min-h-[100dvh] content-between gap-8 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div>
        <div className="flex items-center justify-between gap-3">
          <LogoMark />
          <a href={`tel:${CONTACT_PHONE.replace(/\s/g, '')}`} className="flex size-11 items-center justify-center rounded-lg border border-[#1d1d1d]/10 bg-white text-[#111111] shadow-sm" aria-label="Call Young Law">
            <Phone size={17} />
          </a>
        </div>

        <div className="mt-8">
          <div className="inline-flex items-center gap-2 rounded-lg border border-[#1d1d1d]/10 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#575b5a]">
            <Sparkles size={14} />
            Young Law tools
          </div>
          <h1 className="mt-4 max-w-[12ch] text-5xl font-black leading-[0.96] text-[#111111]">
            Know the numbers before the matter starts.
          </h1>
          <p className="mt-4 max-w-sm text-sm font-semibold leading-6 text-[#5d6261]">
            Fast property and estate estimates with a personal Young Law quote at the end.
          </p>
        </div>

        <div className="mt-7 grid gap-3">
          {calcCards.map((card) => {
            const Icon = card.icon
            return (
              <button
                key={card.key}
                type="button"
                onClick={() => onSelect(card.key)}
                className="grid min-h-[106px] grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border border-[#1d1d1d]/10 bg-white p-4 text-left shadow-[0_18px_42px_rgba(0,0,0,0.075)] transition active:scale-[0.99]"
              >
                <IconBadge icon={Icon} />
                <span className="min-w-0">
                  <span className="block text-xs font-black uppercase tracking-[0.12em] text-[#8a6b0b]">{card.kicker}</span>
                  <span className="mt-1 block text-lg font-black text-[#111111]">{card.title}</span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-[#6f7372]">{card.description}</span>
                </span>
                <ChevronRight size={20} className="text-[#111111]" />
              </button>
            )
          })}
        </div>
      </div>

      <footer className="grid gap-3 rounded-lg border border-[#1d1d1d]/10 bg-[#111111] p-4 text-white shadow-[0_20px_46px_rgba(0,0,0,0.22)]">
        <div className="flex items-center gap-3">
          <IconBadge icon={BadgeCheck} dark />
          <div>
            <p className="text-sm font-black">Modern and simplified legal estimates.</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-white/60">Built around transfers, selling decisions and deceased-estate liquidity.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a href={`mailto:${CONTACT_EMAIL}`} className="rounded-lg border border-white/12 px-3 py-2 text-center text-xs font-black text-white">Email</a>
          <a href={YOUNG_LAW_WEBSITE_URL} target="_blank" rel="noreferrer" className="rounded-lg border border-white/12 px-3 py-2 text-center text-xs font-black text-white">Website</a>
        </div>
      </footer>
    </section>
  )
}

function CalculatorHeader({ title, eyebrow, onBack, icon: Icon }) {
  return (
    <header className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="flex size-11 items-center justify-center rounded-lg border border-[#1d1d1d]/10 bg-white text-[#111111] shadow-sm" aria-label="Back to calculators">
          <ArrowLeft size={18} />
        </button>
        <LogoMark compact />
      </div>
      <div className="mt-5 flex items-start gap-3">
        <IconBadge icon={Icon} />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8a6b0b]">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-black leading-none text-[#111111]">{title}</h1>
        </div>
      </div>
    </header>
  )
}

function TransferCalculator({ onBack }) {
  const [input, setInput] = useState(() => ({ ...DEFAULT_YOUNG_LAW_TRANSFER_INPUT }))
  const result = useMemo(() => calculateYoungLawTransfer(input), [input])
  const purchasePrice = Number(input.purchasePrice)
  const bondAmount = Number(input.bondAmount)

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
        <div className="rounded-lg border border-[#1d1d1d]/10 bg-[#111111] p-4 text-white shadow-[0_20px_46px_rgba(0,0,0,0.22)]">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-white/55">Cash needed before lodgement</p>
          <strong className="mt-2 block break-words text-4xl font-black leading-none">{result.primaryMetric.display}</strong>
          <p className="mt-3 text-xs font-semibold leading-5 text-white/65">Transfer duty, legal fees, disbursements and VAT. Bond costs appear when finance is selected.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {result.secondaryMetrics.map((metric) => (
            <NumberDisplay key={metric.label} label={metric.label} value={metric.display} tone={metric.label === 'Transfer duty' ? 'gold' : 'dark'} />
          ))}
        </div>

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
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6f7372]">Matter type</p>
          <div className="flex gap-2">
            <ToggleButton label="Resale" icon={Building2} active={input.transactionBasis === 'resale'} onClick={() => update('transactionBasis', 'resale')} />
            <ToggleButton label="VAT sale" icon={Percent} active={input.transactionBasis === 'vat'} onClick={() => update('transactionBasis', 'vat')} />
          </div>
          <div className="flex gap-2">
            <ToggleButton label="Bond" icon={CircleDollarSign} active={input.financeType === 'bond'} onClick={() => update('financeType', 'bond')} />
            <ToggleButton label="Cash" icon={WalletCards} active={input.financeType === 'cash'} onClick={() => update('financeType', 'cash')} />
          </div>
        </div>

        <div className="rounded-lg border border-[#1d1d1d]/10 bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.05)]">
          <div className="mb-2 flex items-center gap-2">
            <ReceiptText size={17} />
            <h2 className="text-base font-black text-[#111111]">Estimate breakdown</h2>
          </div>
          <BreakdownList items={result.headlineItems} />
        </div>

        <SourceStrip links={[{ href: SARS_TRANSFER_DUTY_SOURCE_URL, label: `SARS transfer duty ${TRANSFER_DUTY_TABLE_EFFECTIVE}` }]} />
        <QuoteCta type="transfer" result={result} />
      </div>
    </section>
  )
}

function SellerCalculator({ onBack }) {
  const [input, setInput] = useState(() => ({ ...DEFAULT_SELLER_PROCEEDS_INPUT }))
  const result = useMemo(() => calculateSellerNetProceeds(input), [input])
  const netTone = result.summary.netProceeds < 0 ? 'alert' : 'dark'

  function update(field, value) {
    setInput((previous) => ({ ...previous, [field]: value }))
  }

  return (
    <section>
      <CalculatorHeader title="Seller Net" eyebrow="Sale proceeds" icon={WalletCards} onBack={onBack} />
      <div className="grid gap-4 px-4 pb-5">
        <div className="rounded-lg border border-[#1d1d1d]/10 bg-white p-4 shadow-[0_20px_46px_rgba(0,0,0,0.10)]">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8a6b0b]">Estimated seller payout</p>
          <strong className={`mt-2 block break-words text-4xl font-black leading-none ${netTone === 'alert' ? 'text-[#9f2727]' : 'text-[#111111]'}`}>{formatZar(result.summary.netProceeds)}</strong>
          <div className="mt-4 h-3 overflow-hidden rounded-lg bg-[#e5e2d9]">
            <span className="block h-full rounded-lg bg-[#111111]" style={{ width: `${Math.max(5, 100 - result.summary.costRatio)}%` }} />
          </div>
          <p className="mt-3 text-xs font-semibold leading-5 text-[#6f7372]">{result.summary.costRatio}% of the sale price is absorbed by selected settlement and selling costs.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <NumberDisplay label="Sale price" value={formatZar(result.summary.salePrice)} />
          <NumberDisplay label="Settlement" value={formatZar(result.summary.settlement)} />
          <NumberDisplay label="Commission" value={formatZar(result.summary.commission)} tone="gold" />
        </div>

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
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6f7372]">Planning signal</p>
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

        <div className="rounded-lg border border-[#1d1d1d]/10 bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.05)]">
          <div className="mb-2 flex items-center gap-2">
            <SlidersHorizontal size={17} />
            <h2 className="text-base font-black text-[#111111]">Deductions</h2>
          </div>
          <BreakdownList items={result.costs} />
        </div>

        <SourceStrip links={[{ href: SARS_CGT_SOURCE_URL, label: 'SARS CGT reference' }]} />
        <QuoteCta type="seller" result={result} />
      </div>
    </section>
  )
}

function EstateCalculator({ onBack }) {
  const [input, setInput] = useState(() => ({ ...DEFAULT_DECEASED_ESTATE_INPUT }))
  const result = useMemo(() => calculateDeceasedEstateCosts(input), [input])
  const liquidityTone = result.summary.liquidityPosition < 0 ? 'alert' : 'dark'

  function update(field, value) {
    setInput((previous) => ({ ...previous, [field]: value }))
  }

  return (
    <section>
      <CalculatorHeader title="Estate Cost" eyebrow="Deceased estates" icon={Scale} onBack={onBack} />
      <div className="grid gap-4 px-4 pb-5">
        <div className="rounded-lg border border-[#1d1d1d]/10 bg-[#111111] p-4 text-white shadow-[0_20px_46px_rgba(0,0,0,0.22)]">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-white/55">Estate duty estimate</p>
          <strong className="mt-2 block break-words text-4xl font-black leading-none">{formatZar(result.summary.estateDuty)}</strong>
          <p className="mt-3 text-xs font-semibold leading-5 text-white/65">Uses the SARS R3.5m abatement and current 20% / 25% estate-duty bands.</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <NumberDisplay label="Dutiable" value={formatZar(result.summary.dutiableEstate)} tone="gold" />
          <NumberDisplay label="Admin costs" value={formatZar(result.summary.totalAdministrationCosts)} />
          <NumberDisplay label="Liquidity" value={formatZar(result.summary.liquidityPosition)} tone={liquidityTone} />
        </div>

        <SliderField label="Gross estate value" min={500000} max={50000000} step={100000} value={Number(input.grossEstate)} onChange={(value) => update('grossEstate', value)} />
        <SliderField label="Estate liabilities" min={0} max={Number(input.grossEstate)} step={50000} value={Number(input.liabilities)} onChange={(value) => update('liabilities', value)} />
        <SliderField label="Spouse deduction" min={0} max={Number(input.grossEstate)} step={50000} value={Number(input.spouseDeduction)} onChange={(value) => update('spouseDeduction', value)} />
        <SliderField label="Cash available in estate" min={0} max={Number(input.grossEstate)} step={50000} value={Number(input.cashAvailable)} onChange={(value) => update('cashAvailable', value)} />
        <SliderField label="Property transfer value" min={0} max={12000000} step={50000} value={Number(input.propertyTransferValue)} onChange={(value) => update('propertyTransferValue', value)} />

        <div className="grid gap-2">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#6f7372]">Executor VAT</p>
          <div className="flex gap-2">
            <ToggleButton label="VAT included" icon={ReceiptText} active={input.executorVatRegistered} onClick={() => update('executorVatRegistered', true)} />
            <ToggleButton label="VAT excluded" icon={ClipboardCheck} active={!input.executorVatRegistered} onClick={() => update('executorVatRegistered', false)} />
          </div>
        </div>

        <div className="rounded-lg border border-[#1d1d1d]/10 bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.05)]">
          <div className="mb-2 flex items-center gap-2">
            <FileText size={17} />
            <h2 className="text-base font-black text-[#111111]">Estate estimate</h2>
          </div>
          <BreakdownList items={result.costs} />
        </div>

        <SourceStrip links={[{ href: SARS_ESTATE_DUTY_SOURCE_URL, label: 'SARS estate duty' }]} />
        <QuoteCta type="estate" result={result} />
      </div>
    </section>
  )
}

function YoungLawCalculatorsPage() {
  const [active, setActive] = useState('')

  function selectCalculator(key) {
    setActive(key)
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  function goBack() {
    setActive('')
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  return (
    <main
      className="min-h-[100dvh] bg-[#f4f5f5] text-[#111111] antialiased"
      style={{ fontFamily: 'Montserrat, Inter, ui-sans-serif, system-ui, sans-serif' }}
    >
      <div className="mx-auto min-h-[100dvh] w-full max-w-[480px]">
        {!active ? <Landing onSelect={selectCalculator} /> : null}
        {active === 'transfer' ? <TransferCalculator onBack={goBack} /> : null}
        {active === 'seller' ? <SellerCalculator onBack={goBack} /> : null}
        {active === 'estate' ? <EstateCalculator onBack={goBack} /> : null}

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
                    className={`min-h-12 rounded-lg border px-2 text-xs font-black transition ${
                      selected
                        ? 'border-[#111111] bg-[#111111] text-white'
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

      <a
        href={YOUNG_LAW_WEBSITE_URL}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-4 right-4 hidden min-h-10 items-center gap-2 rounded-lg border border-[#1d1d1d]/10 bg-white px-3 text-xs font-black text-[#111111] shadow-[0_12px_30px_rgba(0,0,0,0.08)] sm:inline-flex"
      >
        Young Law
        <ArrowRight size={14} />
      </a>
    </main>
  )
}

export default YoungLawCalculatorsPage
