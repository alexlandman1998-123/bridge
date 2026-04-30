function SectionHeader({
  title,
  copy = '',
  actions = null,
  className = '',
  titleClassName = '',
  copyClassName = '',
}) {
  return (
    <div className={`ui-section-header ${className}`.trim()}>
      <div className="min-w-0">
        {title ? <h3 className={`ui-section-title ${titleClassName}`.trim()}>{title}</h3> : null}
        {copy ? <p className={`ui-section-copy ${copyClassName}`.trim()}>{copy}</p> : null}
      </div>
      {actions}
    </div>
  )
}

export default SectionHeader
