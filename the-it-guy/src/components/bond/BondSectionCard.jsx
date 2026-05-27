import { cn } from '../../lib/utils'

export default function BondSectionCard({
  eyebrow = '',
  title = '',
  description = '',
  action = null,
  children = null,
  className = '',
  contentClassName = '',
  headerClassName = '',
  padded = true,
}) {
  const hasHeader = eyebrow || title || description || action

  return (
    <section
      className={cn(
        'rounded-[26px] border border-[#dbe5f0] bg-white shadow-[0_18px_40px_rgba(15,23,42,0.04)]',
        padded ? 'p-5 sm:p-6' : 'p-0',
        className,
      )}
    >
      {hasHeader ? (
        <div
          className={cn(
            'flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between',
            padded ? '' : 'px-5 pt-5 sm:px-6 sm:pt-6',
            headerClassName,
          )}
        >
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#75879b]">
                {eyebrow}
              </p>
            ) : null}
            {title ? (
              <h2 className={cn('mt-2 text-[1.15rem] font-semibold tracking-[-0.02em] text-[#142132]', eyebrow ? '' : 'mt-0')}>
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-[#5f7287]">{description}</p>
            ) : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-3">{action}</div> : null}
        </div>
      ) : null}

      {children ? (
        <div className={cn(hasHeader ? (padded ? 'mt-5' : 'mt-5') : '', !padded ? 'pb-5 sm:pb-6' : '', contentClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  )
}
