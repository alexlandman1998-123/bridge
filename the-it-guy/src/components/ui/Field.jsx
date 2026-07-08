import { forwardRef } from 'react'

const Field = forwardRef(function Field({ as = 'input', className = '', ...props }, ref) {
  const baseClass =
    as === 'select'
      ? 'ui-select'
      : as === 'textarea'
        ? 'ui-textarea'
        : 'ui-input'

  if (as === 'select') {
    return <select ref={ref} className={`${baseClass} ${className}`.trim()} {...props} />
  }

  if (as === 'textarea') {
    return <textarea ref={ref} className={`${baseClass} min-h-[120px] resize-y ${className}`.trim()} {...props} />
  }

  return <input ref={ref} className={`${baseClass} ${className}`.trim()} {...props} />
})

export default Field
