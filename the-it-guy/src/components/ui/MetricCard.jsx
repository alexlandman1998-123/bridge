function MetricCard({
  label,
  value,
  meta = '',
  icon: Icon = null,
  onClick = null,
  className = '',
  labelClassName = '',
  iconPosition = 'side',
}) {
  const content = (
    <>
      {iconPosition === 'top' ? (
        <div className="mb-4 grid gap-2">
          {Icon ? <Icon size={18} className="text-slate-400" aria-hidden="true" /> : null}
          <span className={`min-w-0 text-[0.92rem] font-medium tracking-[-0.01em] text-[#3b4f65] ${labelClassName}`.trim()}>{label}</span>
        </div>
      ) : (
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className={`min-w-0 flex-1 text-[0.92rem] font-medium tracking-[-0.01em] text-[#3b4f65] ${labelClassName}`.trim()}>{label}</span>
          {Icon ? <Icon size={18} className="shrink-0 text-slate-400" aria-hidden="true" /> : null}
        </div>
      )}
      <strong className="block text-[1.9rem] font-semibold leading-none tracking-[-0.04em] text-[#142132]">{value}</strong>
      {meta ? <p className="mt-3 text-[0.9rem] leading-6 text-[#6b7d93]">{meta}</p> : null}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={`rounded-[18px] border border-[#dde4ee] bg-white px-6 py-6 text-left shadow-[0_4px_14px_rgba(15,23,42,0.05)] transition duration-150 ease-out hover:-translate-y-[1px] hover:border-[#ccd6e3] hover:shadow-[0_10px_24px_rgba(15,23,42,0.08)] ${className}`.trim()}
        onClick={onClick}
      >
        {content}
      </button>
    )
  }

  return (
    <article className={`rounded-[18px] border border-[#dde4ee] bg-white px-6 py-6 shadow-[0_4px_14px_rgba(15,23,42,0.05)] ${className}`.trim()}>
      {content}
    </article>
  )
}

export default MetricCard
