import { CheckCircle2, FileText, KeyRound, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { buyerPortalHexToRgba, createBuyerPortalTheme } from '../buyerPortalTheme'

const TONE_STYLES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-800',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
}

function DeliveryCard({ icon: Icon, label, value, helper, tone = 'neutral', theme }) {
  return (
    <article className="rounded-[16px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
      <Icon size={17} style={{ color: theme.primary }} />
      <p className="mt-3 text-xs font-semibold uppercase tracking-[0.1em] text-[#708399]">{label}</p>
      <p className="mt-1 text-base font-semibold text-[#142132]">{value}</p>
      <p className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${TONE_STYLES[tone] || TONE_STYLES.neutral}`}>{helper}</p>
    </article>
  )
}

export default function BuyerDevelopmentDeliveryPanel({
  model = null,
  theme: themeInput,
  handoverPath = '',
  snagsPath = '',
  documentsPath = '',
}) {
  if (!model?.isDeveloperSale) return null
  const theme = themeInput?.primary ? themeInput : createBuyerPortalTheme(themeInput)
  const handover = model.handover || {}
  const snags = model.snags || {}
  const blockers = Array.isArray(handover.blockers) ? handover.blockers : []
  const handoverProgress = handover.checklistTotalCount
    ? Math.round((Number(handover.completedChecklistCount || 0) / handover.checklistTotalCount) * 100)
    : 0

  return (
    <section data-buyer-development-delivery="panel" className="rounded-[24px] border border-[#dbe5ef] bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] lg:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#708399]">New development</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em] text-[#142132]">Delivery, handover & snags</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#52657b]">Your final delivery steps are linked to the unit handover record, supporting documents, and snag register.</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${TONE_STYLES[handover.tone] || TONE_STYLES.neutral}`}>
          <CheckCircle2 size={14} />
          {handover.ready ? 'Ready for handover' : handover.statusLabel || 'Handover preparing'}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <DeliveryCard icon={KeyRound} label="Handover checklist" value={`${handover.completedChecklistCount || 0} of ${handover.checklistTotalCount || 0}`} helper={handover.date ? `Scheduled ${handover.date}` : 'Date to be confirmed'} tone={handover.tone} theme={theme} />
        <DeliveryCard icon={Wrench} label="Snags" value={snags.enabled ? `${snags.openCount || 0} open` : 'Not active'} helper={snags.enabled ? `${snags.resolvedCount || 0} resolved` : 'Reporting opens when enabled'} tone={snags.tone} theme={theme} />
        <DeliveryCard icon={FileText} label="Handover documents" value={handover.documentCount || 0} helper={`${handover.documentCount === 1 ? 'Document' : 'Documents'} shared`} tone={handover.documentCount ? 'success' : 'neutral'} theme={theme} />
      </div>

      <section className="mt-5 rounded-[18px] border border-[#e3ebf4] bg-[#fbfdff] p-4">
        <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-[#142132]">Handover readiness</span><span className="font-semibold text-[#52657b]">{handoverProgress}%</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e5edf5]"><div className="h-full rounded-full transition-all" style={{ width: `${handoverProgress}%`, backgroundColor: theme.primary }} /></div>
        {blockers.length ? <ul className="mt-4 space-y-2 text-sm leading-6 text-[#52657b]">{blockers.map((blocker) => <li key={blocker} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: buyerPortalHexToRgba(theme.primary, 0.8) }} />{blocker}</li>)}</ul> : <p className="mt-4 text-sm leading-6 text-emerald-700">All current delivery gates are clear. Your team will confirm the handover appointment.</p>}
      </section>

      <div className="mt-5 flex flex-wrap gap-3">
        {handoverPath ? <Link to={handoverPath} className="inline-flex min-h-11 items-center justify-center rounded-[12px] bg-[#111827] px-4 text-sm font-semibold text-white transition hover:bg-black">View handover checklist</Link> : null}
        {snags.enabled && snagsPath ? <Link to={snagsPath} className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#35546c]">View snag register</Link> : null}
        {documentsPath ? <Link to={documentsPath} className="inline-flex min-h-11 items-center justify-center rounded-[12px] border border-[#dbe5ef] bg-white px-4 text-sm font-semibold text-[#35546c]">Handover documents</Link> : null}
      </div>
    </section>
  )
}
