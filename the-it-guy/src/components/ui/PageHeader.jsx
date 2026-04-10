function PageHeader({ title, subtitle = '', actions = null, className = '' }) {
  return (
    <div className={`flex flex-col gap-4 md:flex-row md:items-end md:justify-between ${className}`.trim()}>
      <div className="min-w-0">
        <h1 className="text-page-title font-semibold text-textStrong">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-3xl text-body text-textMuted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center justify-start gap-3 md:w-auto md:justify-end">{actions}</div> : null}
    </div>
  )
}

export default PageHeader
