function StatusBadge({ tone = 'default', className = '', children }) {
  const toneClass =
    tone === 'accent'
      ? 'inline-flex items-center justify-center rounded-full border border-[#cfe1f7] bg-[#eff6ff] px-3 py-1 text-center text-[0.78rem] font-semibold leading-[1.12] text-[#35546c]'
      : 'inline-flex items-center justify-center rounded-full border border-[#dde4ee] bg-[#f8fafc] px-3 py-1 text-center text-[0.78rem] font-semibold leading-[1.12] text-[#66758b]'
  return <span className={`${toneClass} ${className}`.trim()}>{children}</span>
}

export default StatusBadge
