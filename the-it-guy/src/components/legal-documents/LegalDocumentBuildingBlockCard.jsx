import { ArrowRight } from 'lucide-react'
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
  itemDisplay = 'summary',
}) {
  const BlockIcon = iconComponent
  const visibleItems = items.slice(0, 5)

  return (
    <article className="flex min-h-[320px] h-full flex-col rounded-[18px] border border-[#dfe7ef] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.04)] sm:p-6">
      <div className="flex items-start gap-4">
        <span className="inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px] border border-[#d3e8dc] bg-[#f1faf5] text-[#167449]">
          <BlockIcon className="h-7 w-7" aria-hidden="true" />
        </span>
        <div className="min-w-0 pt-1">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#172437]">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-[#6a7c90]">{description}</p>
        </div>
      </div>

      <div className="mt-7 pl-0 sm:pl-20">
        <strong className="block text-base font-semibold text-[#25364b]">{countLabel}</strong>
        {items.length ? (
          itemDisplay === 'tags' ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {visibleItems.map((item) => (
                <li key={item.key || item.label} className="rounded-full border border-[#bcdcc9] bg-[#f6fcf8] px-3 py-1 text-xs font-semibold text-[#28714b]">
                  {item.label}
                </li>
              ))}
              {items.length > visibleItems.length ? (
                <li className="rounded-full border border-[#dce5ec] bg-[#f8fafc] px-3 py-1 text-xs font-semibold text-[#6e8093]">+{items.length - visibleItems.length} more</li>
              ) : null}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-6 text-[#6a7c90]">
              {visibleItems.map((item) => item.label).join(', ')}{items.length > visibleItems.length ? ` and ${items.length - visibleItems.length} more` : ''}
            </p>
          )
        ) : (
          <p className="mt-2 text-sm leading-6 text-[#8795a5]">{emptyLabel}</p>
        )}
      </div>

      <Link
        to={actionTo}
        className="mt-auto inline-flex min-h-11 items-center justify-center gap-3 rounded-[11px] border border-[#b9dcc7] bg-white px-4 text-sm font-semibold text-[#1b6846] transition hover:border-[#0f7f4f] hover:bg-[#f1faf5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f7f4f]"
      >
        {actionLabel}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  )
}
