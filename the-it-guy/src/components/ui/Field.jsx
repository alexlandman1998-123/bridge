function Field({ as = 'input', className = '', ...props }) {
  const baseClass =
    as === 'select'
      ? 'ui-select'
      : as === 'textarea'
        ? 'ui-textarea'
        : 'ui-input'

  if (as === 'select') {
    return <select className={`${baseClass} ${className}`.trim()} {...props} />
  }

  if (as === 'textarea') {
    return <textarea className={`${baseClass} min-h-[120px] resize-y ${className}`.trim()} {...props} />
  }

  return <input className={`${baseClass} ${className}`.trim()} {...props} />
}

export default Field
