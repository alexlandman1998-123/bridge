import { Download, Plus } from 'lucide-react'

export default function BondPageHeader({
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
    <header className="ui-workspace-header">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-[#142132]">{title}</h1>
          {description ? <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[#60758d]">{description}</p> : null}
        </div>
        {primaryLabel || secondaryLabel ? <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto lg:justify-end">
          {primaryLabel ? (
            <button
              type="button"
              onClick={onPrimary || undefined}
              disabled={typeof onPrimary !== 'function'}
              title={typeof onPrimary === 'function' ? undefined : 'This action is not available in this workspace.'}
              className="inline-flex h-11 min-w-[150px] items-center justify-center gap-2 rounded-[14px] bg-[#102448] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(16,36,72,0.22)] transition hover:-translate-y-0.5 hover:bg-[#17315c] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <PrimaryActionIcon size={16} />
              {primaryLabel.replace(/^\+\s*/, '')}
            </button>
          ) : null}
          {secondaryLabel ? (
            <button
              type="button"
              onClick={onSecondary || undefined}
              disabled={typeof onSecondary !== 'function'}
              title={typeof onSecondary === 'function' ? undefined : 'This action is not available in this workspace.'}
              className="inline-flex h-11 min-w-[132px] items-center justify-center gap-2 rounded-[14px] border border-[#dce6f2] bg-white px-4 text-sm font-semibold text-[#17324b] shadow-[0_8px_18px_rgba(15,23,42,0.04)] transition hover:-translate-y-0.5 hover:border-[#c9d8e8] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              <SecondaryActionIcon size={16} />
              {secondaryLabel}
            </button>
          ) : null}
        </div> : null}
      </div>
    </header>
  )
}
