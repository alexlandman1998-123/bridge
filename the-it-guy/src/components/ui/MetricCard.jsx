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
          {Icon ? <Icon size={18} className="text-textSoft" aria-hidden="true" /> : null}
          <span className={`min-w-0 text-secondary font-medium text-textBody ${labelClassName}`.trim()}>{label}</span>
        </div>
      ) : (
        <div className="mb-4 flex items-start justify-between gap-3">
          <span className={`min-w-0 flex-1 text-secondary font-medium text-textBody ${labelClassName}`.trim()}>{label}</span>
          {Icon ? <Icon size={18} className="shrink-0 text-textSoft" aria-hidden="true" /> : null}
        </div>
      )}
      <strong className="block text-page-title font-semibold text-textStrong">{value}</strong>
      {meta ? <p className="mt-3 text-secondary text-textMuted">{meta}</p> : null}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        className={`ui-metric-card ui-metric-card-button ${className}`.trim()}
        onClick={onClick}
      >
        {content}
      </button>
    )
  }

  return (
    <article className={`ui-metric-card ${className}`.trim()}>
      {content}
    </article>
  )
}

export default MetricCard
