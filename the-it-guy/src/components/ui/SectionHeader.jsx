function SectionHeader({ title, copy = '', actions = null, className = '' }) {
  return (
    <div className={`flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between ${className}`.trim()}>
      <div className="min-w-0">
        <h3 className="text-[1.1rem] font-semibold tracking-[-0.025em] text-textStrong">{title}</h3>
        {copy ? <p className="mt-2 text-[0.98rem] leading-7 text-textMuted">{copy}</p> : null}
      </div>
      {actions}
    </div>
  )
}

export default SectionHeader
