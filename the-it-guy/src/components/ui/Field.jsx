function Field({ as = 'input', className = '', ...props }) {
  const baseClass =
    'w-full rounded-[14px] border border-borderDefault bg-surface px-4 py-3 text-sm text-textStrong shadow-soft outline-none transition duration-150 ease-out placeholder:text-textSoft focus:border-primary focus:ring-4 focus:ring-[var(--color-ring-primary)]'

  if (as === 'select') {
    return <select className={`${baseClass} ${className}`.trim()} {...props} />
  }

  if (as === 'textarea') {
    return <textarea className={`${baseClass} min-h-[120px] resize-y ${className}`.trim()} {...props} />
  }

  return <input className={`${baseClass} ${className}`.trim()} {...props} />
}

export default Field
