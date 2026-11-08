function PageHeader({ title, subtitle = '', actions = null, className = '' }) {
  return (
    <header className={`ui-page-header ${className}`.trim()}>
      <div className="min-w-0">
        <h1 className="ui-page-title">{title}</h1>
        {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ui-page-actions">{actions}</div> : null}
    </header>
  )
}

export default PageHeader
