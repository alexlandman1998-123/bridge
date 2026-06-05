import { Download, Plus } from 'lucide-react'

export default function BondPageHeader({
  eyebrow = 'Bond Originator',
  title,
  description,
  primaryLabel = '',
  secondaryLabel = '',
  onPrimary = null,
  onSecondary = null,
  primaryIcon = Plus,
  secondaryIcon = Download,
}) {
  const PrimaryActionIcon = primaryIcon
  const SecondaryActionIcon = secondaryIcon

  return (
    <section className="rounded-[24px] border border-[#dfe8f2] bg-white px-5 py-5 shadow-[0_14px_32px_rgba(15,23,42,0.055)] sm:px-6 lg:px-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#75879b]">{eyebrow}</p>
          ) : null}
          <h1 className="mt-2 text-[1.65rem] font-semibold tracking-normal text-[#142132] sm:text-[1.9rem]">{title}</h1>
          {description ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#60758d]">{description}</p> : null}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto lg:justify-end">
          {primaryLabel ? (
            <button
              type="button"
              onClick={onPrimary || undefined}
              className="inline-flex h-11 min-w-[150px] items-center justify-center gap-2 rounded-[14px] bg-[#102448] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(16,36,72,0.22)] transition hover:-translate-y-0.5 hover:bg-[#17315c]"
            >
              <PrimaryActionIcon size={16} />
              {primaryLabel.replace(/^\+\s*/, '')}
            </button>
          ) : null}
          {secondaryLabel ? (
            <button
              type="button"
              onClick={onSecondary || undefined}
              className="inline-flex h-11 min-w-[132px] items-center justify-center gap-2 rounded-[14px] border border-[#dce6f2] bg-white px-4 text-sm font-semibold text-[#17324b] shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#c9d8e8]"
            >
              <SecondaryActionIcon size={16} />
              {secondaryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
