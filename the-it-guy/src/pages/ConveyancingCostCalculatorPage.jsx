import {
  Banknote,
  Building2,
  Calculator,
  CheckCircle2,
  Clipboard,
  FileText,
  Landmark,
  Percent,
  ReceiptText,
  Scale,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  WalletCards,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  calculateConveyancingQuote,
  DEFAULT_QUOTE_INPUT,
  FEE_PROFILES,
  formatZar,
  groupQuoteLineItems,
  SARS_TRANSFER_DUTY_SOURCE_URL,
  TRANSFER_DUTY_TABLE_EFFECTIVE,
} from '../services/conveyancingCostCalculator'

const surfaceClass = 'rounded-lg border border-slate-200 bg-white shadow-[0_8px_22px_rgba(15,23,42,0.035)]'
const softButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-55'
const primaryButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#17324b] bg-[#17324b] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#224761] disabled:cursor-not-allowed disabled:opacity-55'

const TRANSACTION_BASIS_OPTIONS = [
  { value: 'resale', label: 'Resale', icon: Building2 },
  { value: 'vat', label: 'VAT Sale', icon: Percent },
  { value: 'plot_plan', label: 'Plot & Plan', icon: FileText },
]

const FINANCE_OPTIONS = [
  { value: 'bond', label: 'Bond', icon: Banknote },
  { value: 'cash', label: 'Cash', icon: WalletCards },
  { value: 'hybrid', label: 'Hybrid', icon: SlidersHorizontal },
]

const BUYER_TYPE_OPTIONS = [
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
  { value: 'trust', label: 'Trust' },
]

const TITLE_OPTIONS = [
  { value: 'freehold', label: 'Freehold' },
  { value: 'sectional', label: 'Sectional' },
  { value: 'share_block', label: 'Share Block' },
]

const SCENARIOS = [
  {
    key: 'resale-bond',
    label: 'Resale With Bond',
    input: { purchasePrice: 1850000, bondAmount: 1500000, transactionBasis: 'resale', propertyTitle: 'sectional', buyerType: 'individual', financeType: 'bond', feeProfile: 'standard', includeCancellation: false },
  },
  {
    key: 'vat-development',
    label: 'VAT Development',
    input: { purchasePrice: 2450000, bondAmount: 2100000, transactionBasis: 'vat', propertyTitle: 'freehold', buyerType: 'individual', financeType: 'bond', feeProfile: 'partner', includeCancellation: false },
  },
  {
    key: 'trust-cash',
    label: 'Trust Cash',
    input: { purchasePrice: 3600000, bondAmount: 0, transactionBasis: 'resale', propertyTitle: 'freehold', buyerType: 'trust', financeType: 'cash', feeProfile: 'priority', includeCancellation: false },
  },
  {
    key: 'seller-cancel',
    label: 'Seller Cancellation',
    input: { purchasePrice: 2250000, bondAmount: 1750000, transactionBasis: 'resale', propertyTitle: 'sectional', buyerType: 'company', financeType: 'hybrid', feeProfile: 'standard', includeCancellation: true },
  },
]

const CATEGORY_META = {
  government: { label: 'Government', icon: Landmark, tone: 'border-blue-100 bg-blue-50 text-blue-700' },
  professional: { label: 'Firm Fees', icon: Scale, tone: 'border-emerald-100 bg-emerald-50 text-emerald-700' },
  disbursement: { label: 'Disbursements', icon: ReceiptText, tone: 'border-amber-100 bg-amber-50 text-amber-700' },
  tax: { label: 'VAT', icon: Percent, tone: 'border-violet-100 bg-violet-50 text-violet-700' },
}

function updateNumberField(value) {
  return String(value || '').replace(/[^\d]/g, '')
}

function getCategoryAmount(items = []) {
  return items.reduce((sum, item) => sum + Number(item.amount || 0), 0)
}

function InputShell({ label, children, hint = '' }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      {children}
      {hint ? <span className="text-xs leading-5 text-slate-500">{hint}</span> : null}
    </label>
  )
}

function MoneyInput({ label, value, onChange, disabled = false, hint = '' }) {
  return (
    <InputShell label={label} hint={hint}>
      <div className={`flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3 shadow-sm ${disabled ? 'opacity-60' : ''}`.trim()}>
        <span className="mr-2 text-sm font-semibold text-slate-500">R</span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(updateNumberField(event.target.value))}
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none disabled:cursor-not-allowed"
        />
      </div>
    </InputShell>
  )
}

function SelectField({ label, value, options, onChange }) {
  return (
    <InputShell label={label}>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm outline-none transition focus:border-slate-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </InputShell>
  )
}

function SegmentedControl({ label, value, options, onChange }) {
  return (
    <div className="grid gap-2">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const Icon = option.icon
          const active = value === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${
                active
                  ? 'border-[#17324b] bg-[#17324b] text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Icon size={15} />
              <span>{option.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ToggleRow({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border px-3 text-left transition ${
        checked ? 'border-[#17324b] bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
      }`}
      aria-pressed={checked}
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold">Seller cancellation estimate</span>
        <span className={`mt-0.5 block text-xs ${checked ? 'text-slate-300' : 'text-slate-500'}`}>Shown separately from buyer collection</span>
      </span>
      <span className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${checked ? 'bg-white/25' : 'bg-slate-200'}`}>
        <span className={`size-5 rounded-full bg-white shadow-sm transition ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

function MetricCard({ label, value, helper, icon: Icon, tone = 'slate' }) {
  const toneClass =
    tone === 'green' ? 'bg-emerald-50 text-emerald-700' :
      tone === 'blue' ? 'bg-blue-50 text-blue-700' :
        tone === 'violet' ? 'bg-violet-50 text-violet-700' :
          'bg-slate-100 text-slate-700'

  return (
    <article className={`${surfaceClass} min-h-[132px] p-4`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex size-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-700">{label}</p>
      <strong className="mt-2 block text-2xl font-semibold leading-none text-slate-950">{value}</strong>
      {helper ? <span className="mt-3 block text-xs font-medium leading-5 text-slate-500">{helper}</span> : null}
    </article>
  )
}

function CategoryBreakdown({ quote }) {
  const groups = groupQuoteLineItems(quote.lineItems)
  const total = quote.summary.grandTotal || 1
  return (
    <section className={`${surfaceClass} p-4`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Quote Recovery</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Government, firm and third-party portions.</p>
        </div>
        <ShieldCheck size={18} className="text-emerald-600" />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {Object.entries(CATEGORY_META).map(([category, meta]) => {
          const amount = getCategoryAmount(groups[category] || [])
          const width = `${Math.max(4, (amount / total) * 100)}%`
          const Icon = meta.icon
          return (
            <article key={category} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
              <div className="flex items-center gap-2">
                <span className={`inline-flex size-8 items-center justify-center rounded-lg border ${meta.tone}`}>
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
                  <p className="text-xs text-slate-500">{formatZar(amount)}</p>
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
                <span className="block h-full rounded-full bg-[#17324b]" style={{ width }} />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function LineItemTable({ items = [] }) {
  return (
    <section className={`${surfaceClass} overflow-hidden`}>
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-950">Line Items</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Item</th>
              <th className="px-4 py-3 font-semibold">Category</th>
              <th className="px-4 py-3 font-semibold">Payer</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.key} className="align-top">
                <td className="max-w-[360px] px-4 py-3">
                  <p className="font-semibold text-slate-900">{item.label}</p>
                  {item.note ? <p className="mt-1 text-xs leading-5 text-slate-500">{item.note}</p> : null}
                </td>
                <td className="px-4 py-3 text-slate-600">{CATEGORY_META[item.category]?.label || item.category}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${item.payer === 'seller' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {item.payer === 'seller' ? 'Seller' : 'Buyer'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-950">{formatZar(item.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AssumptionsPanel({ assumptions = [] }) {
  return (
    <section className={`${surfaceClass} p-4`}>
      <div className="flex items-center gap-2">
        <CheckCircle2 size={18} className="text-emerald-600" />
        <h2 className="text-base font-semibold text-slate-950">Quote Assumptions</h2>
      </div>
      <ul className="mt-3 grid gap-2">
        {assumptions.map((assumption) => (
          <li key={assumption} className="flex gap-2 text-sm leading-6 text-slate-600">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-400" />
            <span>{assumption}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ClientPreview({ quote, copied, onCopy }) {
  return (
    <section className={`${surfaceClass} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Buyer Preview</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Draft collection before transfer and lodgement work proceeds.</p>
        </div>
        <button type="button" className={softButtonClass} onClick={onCopy}>
          <Clipboard size={15} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm leading-6 text-slate-700">
          Estimated buyer collection: <strong className="font-semibold text-slate-950">{formatZar(quote.summary.buyerTotal)}</strong>.
          This includes transfer duty where applicable, transfer fees, disbursements, VAT and any selected bond registration estimate.
        </p>
        {quote.summary.sellerTotal > 0 ? (
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Seller-side cancellation estimate shown separately: <strong className="font-semibold text-slate-950">{formatZar(quote.summary.sellerTotal)}</strong>.
          </p>
        ) : null}
      </div>
    </section>
  )
}

function ConveyancingCostCalculatorPage() {
  const [form, setForm] = useState(() => ({ ...DEFAULT_QUOTE_INPUT }))
  const [copied, setCopied] = useState(false)
  const quote = useMemo(() => calculateConveyancingQuote(form), [form])
  const bondDisabled = form.financeType === 'cash'

  function updateField(field, value) {
    setForm((previous) => {
      const next = { ...previous, [field]: value }
      if (field === 'financeType' && value === 'cash') {
        next.bondAmount = 0
      }
      if (field === 'financeType' && value !== 'cash' && !Number(previous.bondAmount || 0)) {
        next.bondAmount = Math.round(Number(previous.purchasePrice || DEFAULT_QUOTE_INPUT.purchasePrice) * 0.85)
      }
      return next
    })
    setCopied(false)
  }

  async function copyPreview() {
    const text = `Estimated buyer collection: ${formatZar(quote.summary.buyerTotal)}. Transfer duty: ${formatZar(quote.summary.transferDuty)}. Firm fees ex VAT: ${formatZar(quote.summary.firmRevenueExVat)}.`
    try {
      await navigator.clipboard?.writeText(text)
    } catch {
      // Clipboard access can be unavailable in local preview contexts.
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2200)
  }

  return (
    <section className="grid w-full max-w-none gap-5 px-3 py-4 sm:px-4 lg:px-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
            <Calculator size={14} />
            Conveyancing
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-slate-950 sm:text-3xl">Cost Calculator</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Draft transfer and bond registration estimates for buyer collections, firm recovery and matter conversations.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a className={softButtonClass} href={SARS_TRANSFER_DUTY_SOURCE_URL} target="_blank" rel="noreferrer">
            <Landmark size={15} />
            SARS Table
          </a>
          <button type="button" className={primaryButtonClass}>
            <Send size={15} />
            Send Draft
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Buyer Collection" value={formatZar(quote.summary.buyerTotal)} helper="Payable before lodgement" icon={WalletCards} tone="green" />
        <MetricCard label="Transfer Duty" value={formatZar(quote.summary.transferDuty)} helper={`SARS effective ${TRANSFER_DUTY_TABLE_EFFECTIVE}`} icon={Landmark} tone="blue" />
        <MetricCard label="Firm Revenue" value={formatZar(quote.summary.firmRevenueExVat)} helper="Excluding VAT and pass-throughs" icon={Scale} tone="slate" />
        <MetricCard label="VAT" value={formatZar(quote.summary.vatTotal)} helper="Taxable fees only" icon={Percent} tone="violet" />
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.82fr)_minmax(0,1.18fr)]">
        <div className="grid content-start gap-5">
          <section className={`${surfaceClass} p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-950">Scenario</h2>
                <p className="mt-1 text-sm leading-6 text-slate-500">Pre-filled quote shapes for the demo.</p>
              </div>
              <SlidersHorizontal size={18} className="text-slate-500" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.key}
                  type="button"
                  onClick={() => {
                    setForm({ ...scenario.input })
                    setCopied(false)
                  }}
                  className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {scenario.label}
                </button>
              ))}
            </div>
          </section>

          <section className={`${surfaceClass} p-4`}>
            <h2 className="text-base font-semibold text-slate-950">Matter Inputs</h2>
            <div className="mt-4 grid gap-4">
              <MoneyInput label="Purchase Price" value={form.purchasePrice} onChange={(value) => updateField('purchasePrice', value)} />
              <MoneyInput
                label="Bond Amount"
                value={form.bondAmount}
                disabled={bondDisabled}
                onChange={(value) => updateField('bondAmount', value)}
                hint={bondDisabled ? 'No bond registration estimate for cash matters.' : ''}
              />
              <SegmentedControl label="Basis" value={form.transactionBasis} options={TRANSACTION_BASIS_OPTIONS} onChange={(value) => updateField('transactionBasis', value)} />
              <SegmentedControl label="Finance" value={form.financeType} options={FINANCE_OPTIONS} onChange={(value) => updateField('financeType', value)} />
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField label="Buyer" value={form.buyerType} options={BUYER_TYPE_OPTIONS} onChange={(value) => updateField('buyerType', value)} />
                <SelectField label="Title" value={form.propertyTitle} options={TITLE_OPTIONS} onChange={(value) => updateField('propertyTitle', value)} />
              </div>
              <SelectField
                label="Fee Profile"
                value={form.feeProfile}
                options={Object.values(FEE_PROFILES).map((profile) => ({ value: profile.key, label: profile.label }))}
                onChange={(value) => updateField('feeProfile', value)}
              />
              <ToggleRow checked={form.includeCancellation} onChange={(value) => updateField('includeCancellation', value)} />
            </div>
          </section>
        </div>

        <div className="grid content-start gap-5">
          <CategoryBreakdown quote={quote} />
          <LineItemTable items={quote.lineItems} />
          <div className="grid gap-5 lg:grid-cols-2">
            <ClientPreview quote={quote} copied={copied} onCopy={copyPreview} />
            <AssumptionsPanel assumptions={quote.assumptions} />
          </div>
        </div>
      </div>
    </section>
  )
}

export default ConveyancingCostCalculatorPage
