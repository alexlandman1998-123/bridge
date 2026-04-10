function SectionHeader({ title, copy = '', actions = null, className = '' }) {
  return (
    <div className={`ui-section-header ${className}`.trim()}>
      <div className="min-w-0">
        <h3 className="ui-section-title">{title}</h3>
        {copy ? <p className="ui-section-copy">{copy}</p> : null}
      </div>
      {actions}
    </div>
  )
}

export default SectionHeader
