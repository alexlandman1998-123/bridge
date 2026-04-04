function Field({ as = 'input', className = '', ...props }) {
  const baseClass =
    'w-full rounded-[14px] border border-[#dde4ee] bg-white px-4 py-3 text-sm text-[#162334] shadow-[0_10px_24px_rgba(15,23,42,0.06)] outline-none transition duration-150 ease-out placeholder:text-slate-400 focus:border-[rgba(29,78,216,0.35)] focus:ring-4 focus:ring-[rgba(29,78,216,0.1)]'

  if (as === 'select') {
    return <select className={`${baseClass} ${className}`.trim()} {...props} />
  }

  if (as === 'textarea') {
    return <textarea className={`${baseClass} min-h-[120px] resize-y ${className}`.trim()} {...props} />
  }

  return <input className={`${baseClass} ${className}`.trim()} {...props} />
}

export default Field
