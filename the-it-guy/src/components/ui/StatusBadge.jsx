function StatusBadge({ tone = 'default', className = '', children }) {
  const toneClass =
    tone === 'accent'
      ? 'ui-badge ui-badge-accent'
      : 'ui-badge'
  return <span className={`${toneClass} ${className}`.trim()}>{children}</span>
}

export default StatusBadge
