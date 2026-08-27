import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileSignature,
  HandCoins,
  Lock,
  ShieldCheck,
  WalletCards,
} from 'lucide-react'
import { buyerPortalHexToRgba, createBuyerPortalTheme } from '../buyerPortalTheme'

const TONE_STYLES = {
  action: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
  complete: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-600',
}

function StageIcon({ state }) {
  if (state === 'complete') return <CheckCircle2 size={18} />
  if (state === 'current') return <Clock3 size={18} />
  return <span className="h-2.5 w-2.5 rounded-full bg-current opacity-45" />
}

function FinanceJourney({ stages = [], theme }) {
  if (!stages.length) return null
  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">Your bond journey</h2>
          <p className="mt-1 text-sm leading-6 text-[#52657b]">One live view of where your application is now and what comes next.</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-semibold" style={{ borderColor: buyerPortalHexToRgba(theme.primary, 0.2), backgroundColor: buyerPortalHexToRgba(theme.primary, 0.06), color: theme.primary }}>
          {stages.find((stage) => stage.state === 'current')?.label || 'In progress'}
        </span>
      </div>
      <ol className="mt-6 grid gap-2 md:grid-cols-5" aria-label="Bond application progress">
        {stages.map((stage, index) => {
          const isCurrent = stage.state === 'current'
          const isComplete = stage.state === 'complete'
          return (
            <li key={stage.key} data-finance-stage={stage.state} className={`relative rounded-[16px] border px-3.5 py-4 ${isCurrent ? 'border-transparent text-white shadow-[0_12px_24px_rgba(15,23,42,0.12)]' : isComplete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-[#e3ebf4] bg-[#fbfdff] text-[#708399]'}`} style={isCurrent ? { backgroundColor: theme.primary } : undefined}>
              <div className="flex items-center justify-between gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-current/20 bg-white/10"><StageIcon state={stage.state} /></span>
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] opacity-75">{index + 1} / {stages.length}</span>
              </div>
              <strong className="mt-3 block text-sm font-semibold leading-5">{stage.label}</strong>
              <span className="mt-1 block text-xs leading-5 opacity-80">{stage.helper}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function LenderCards({ model }) {
  const banks = model?.bankApplications || []
  const offers = model?.offers || []
  if (!banks.length && !offers.length) return null
  return (
    <section className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-6">
      <div>
        <h2 className="text-xl font-semibold tracking-[-0.04em] text-[#142132]">Bank applications & offers</h2>
        <p className="mt-1 text-sm leading-6 text-[#52657b]">Responses published by your finance team appear here automatically.</p>
      </div>
      {banks.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {banks.map((bank) => (
            <article key={bank.id} data-finance-bank={bank.id} className="rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-[12px] border border-[#dbe5ef] bg-white text-[#52657b]"><Building2 size={18} /></span>
                <span className={`rounded-full border px-2.5 py-1 text-[0.68rem] font-semibold ${TONE_STYLES[bank.statusTone] || TONE_STYLES.info}`}>{bank.status}</span>
              </div>
              <h3 className="mt-3 text-base font-semibold text-[#142132]">{bank.bankName}</h3>
              {bank.amountLabel ? <p className="mt-2 text-sm font-semibold text-[#31475c]">{bank.amountLabel}{bank.rateLabel ? ` · ${bank.rateLabel}` : ''}</p> : null}
              <p className="mt-1 text-xs leading-5 text-[#667085]">{bank.latestUpdate || bank.repaymentLabel || 'Your finance team will publish the next update here.'}</p>
            </article>
          ))}
        </div>
      ) : null}
      {offers.length ? (
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {offers.map((offer) => (
            <article key={offer.id} data-finance-offer={offer.id} className={`rounded-[20px] border p-5 ${offer.isRecommended || offer.isAccepted ? 'border-emerald-200 bg-emerald-50/60' : 'border-[#dbe5ef] bg-white'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#708399]">{offer.isAccepted ? 'Accepted offer' : offer.isRecommended ? 'Recommended offer' : 'Bank offer'}</span><h3 className="mt-1 text-lg font-semibold text-[#142132]">{offer.bankName}</h3></div>
                {offer.isAccepted ? <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-700">Accepted</span> : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div><span className="text-xs text-[#708399]">Amount</span><strong className="mt-1 block text-sm text-[#142132]">{offer.amountLabel}</strong></div>
                <div><span className="text-xs text-[#708399]">Interest rate</span><strong className="mt-1 block text-sm text-[#142132]">{offer.rateLabel || 'Pending'}</strong></div>
              </div>
              {offer.conditionsSummary ? <p className="mt-4 text-sm leading-6 text-[#52657b]">{offer.conditionsSummary}</p> : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

export default function BuyerFinanceWorkspace({ model, theme: themeInput, primaryAction = null, secondaryAction = null, showLenders = true }) {
  const theme = themeInput?.primary ? themeInput : createBuyerPortalTheme(themeInput)
  const action = model?.firstAction
  const account = model?.account || {}
  const metrics = model?.isBondFinance
    ? [
        [model.requestedAmountLabel, model.requestedAmountCaption, model.loanToValue ? `${model.loanToValue} of purchase price` : 'Amount requested', HandCoins],
        [model.purchasePriceLabel, 'Purchase price', 'Transaction value', CircleDollarSign],
        [model.manager?.name || 'Finance team', 'Finance contact', model.manager?.company || 'Your assigned team', ShieldCheck],
        [`${model.progressPercent || 0}%`, 'Application complete', model.status, FileSignature],
      ]
    : [
        [account.balanceDueLabel, 'Balance due', 'Visible posted entries', HandCoins],
        [account.openRequests || 0, 'Open requests', `${account.overdueRequests || 0} overdue`, AlertCircle],
        [account.documentCount || 0, 'Finance documents', 'Statements and receipts', WalletCards],
        [account.eventCount || 0, 'Published updates', account.accountCount ? `${account.accountCount} active account${account.accountCount === 1 ? '' : 's'}` : 'No account published', Clock3],
      ]

  return (
    <section data-buyer-finance="workspace" data-finance-source={model?.source || 'unknown'} data-finance-mode={model?.mode || 'unknown'} className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div><h1 className="text-3xl font-semibold tracking-[-0.06em] text-[#142132]">{model?.title || 'Finance'}</h1><p className="mt-2 text-base leading-6 text-[#52657b]">{model?.description}</p></div>
        <div className="flex items-start gap-2 rounded-[14px] px-3 py-2 text-sm text-[#52657b]"><Lock size={15} className="mt-1 shrink-0 text-[#142132]" /><span>Your information is secure<br className="hidden lg:block" /> and encrypted.</span></div>
      </header>

      <section className="rounded-[22px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-3">
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${TONE_STYLES[model?.statusTone] || TONE_STYLES.info}`}>{model?.statusTone === 'complete' ? <CheckCircle2 size={20} /> : model?.statusTone === 'action' ? <AlertCircle size={20} /> : <Clock3 size={20} />}</span>
            <div><span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#708399]">Current finance status</span><h2 className="mt-1 text-lg font-semibold text-[#142132]">{model?.status}</h2><p className="mt-1 text-sm text-[#52657b]">{model?.statusHelper}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">{secondaryAction}{action ? null : primaryAction}</div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(([value, label, helper, icon]) => {
            const MetricIcon = icon
            return <article key={label} className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-4"><MetricIcon size={17} style={{ color: theme.primary }} /><strong className="mt-3 block truncate text-base font-semibold text-[#142132]">{value}</strong><span className="mt-1 block text-xs font-semibold text-[#52657b]">{label}</span><span className="mt-1 block text-xs leading-5 text-[#7b8ca2]">{helper}</span></article>
          })}
        </div>
      </section>

      <FinanceJourney stages={model?.stages} theme={theme} />

      {action ? <section className="rounded-[20px] border border-amber-200 bg-amber-50/70 p-5" role="status"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"><AlertCircle size={20} /></span><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-amber-700">Next action</p><h2 className="mt-1 text-base font-semibold text-[#142132]">{action.title}</h2>{action.description ? <p className="mt-1 text-sm leading-6 text-[#52657b]">{action.description}</p> : null}</div></div>{primaryAction ? <div className="shrink-0">{primaryAction}</div> : <ChevronRight className="text-amber-700" size={20} />}</div></section> : null}

      {showLenders && model?.isBondFinance ? <LenderCards model={model} /> : null}
    </section>
  )
}
