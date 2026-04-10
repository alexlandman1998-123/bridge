function StatusBadge({ tone = 'default', className = '', children }) {
  const toneClass =
    tone === 'accent'
      ? 'inline-flex items-center justify-center rounded-full border border-info bg-infoSoft px-3 py-1 text-center text-helper font-semibold text-info'
      : 'inline-flex items-center justify-center rounded-full border border-borderDefault bg-mutedBg px-3 py-1 text-center text-helper font-semibold text-textMuted'
  return <span className={`${toneClass} ${className}`.trim()}>{children}</span>
}

export default StatusBadge
