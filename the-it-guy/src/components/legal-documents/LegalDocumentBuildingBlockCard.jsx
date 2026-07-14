import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function LegalDocumentBuildingBlockCard({
  title,
  description,
  countLabel,
  items = [],
  emptyLabel,
  actionLabel,
  actionTo,
  Icon: iconComponent,
  tone = 'green',
}) {
  const BlockIcon = iconComponent
  const toneClasses = tone === 'blue'
    ? 'border-[#d8e4f2] bg-[#f3f7fc] text-[#315d84]'
    : tone === 'amber'
      ? 'border-[#eadfc5] bg-[#fff9ec] text-[#8a630f]'
      : 'border-[#d3e8dc] bg-[#f1faf5] text-[#167449]'

  return (
    <article className="flex h-full flex-col rounded-[18px] border border-[#dfe7ef] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-[12px] border ${toneClasses}`}>
          <BlockIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="rounded-full border border-[#e0e7ee] bg-[#f8fafc] px-2.5 py-1 text-xs font-semibold text-[#65778b]">{countLabel}</span>
      </div>

      <h2 className="mt-5 text-lg font-semibold tracking-[-0.01em] text-[#172437]">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#6a7c90]">{description}</p>

      <ul className="mt-5 space-y-2 border-t border-[#edf1f5] pt-4">
        {items.length ? items.slice(0, 4).map((item) => (
          <li key={item.key || item.label} className="flex items-start gap-2 text-sm leading-5 text-[#415369]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#24a064]" aria-hidden="true" />
            <span>{item.label}</span>
          </li>
        )) : (
          <li className="text-sm leading-6 text-[#8795a5]">{emptyLabel}</li>
        )}
        {items.length > 4 ? <li className="pl-6 text-xs font-medium text-[#7a8b9d]">+ {items.length - 4} more</li> : null}
      </ul>

      <Link
        to={actionTo}
        className="mt-auto inline-flex min-h-10 items-center justify-between gap-3 border-t border-[#edf1f5] pt-5 text-sm font-semibold text-[#1b6846] transition hover:text-[#0f7f4f] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0f7f4f]"
      >
        {actionLabel}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  )
}
