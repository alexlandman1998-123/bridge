function StatusBadge({ tone = 'default', className = '', children, ...props }) {
  const toneClass =
    tone === 'accent'
      ? 'ui-badge ui-badge-accent'
      : 'ui-badge'
  return <span className={`${toneClass} ${className}`.trim()} {...props}>{children}</span>
}

export default StatusBadge
