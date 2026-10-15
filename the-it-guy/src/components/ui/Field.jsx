import { forwardRef } from 'react'
import AddressInput from '../location/AddressInput'
import { isAddressFieldKey } from '../location/addressInputModel'

const Field = forwardRef(function Field({ as = 'input', className = '', addressSearch, ...props }, ref) {
  const baseClass =
    as === 'select'
      ? 'ui-select'
      : as === 'textarea'
        ? 'ui-textarea'
        : 'ui-input'

  if (as === 'select') {
    return <select ref={ref} className={`${baseClass} ${className}`.trim()} {...props} />
  }

  const physicalTextField = !props.type || props.type === 'text'
  if (addressSearch || physicalTextField && (isAddressFieldKey(props.name) || isAddressFieldKey(props.id))) {
    return <AddressInput ref={ref} className={`${baseClass} ${className}`.trim()} {...props} />
  }

  if (as === 'textarea') {
    return <textarea ref={ref} className={`${baseClass} min-h-[120px] resize-y ${className}`.trim()} {...props} />
  }

  return <input ref={ref} className={`${baseClass} ${className}`.trim()} {...props} />
})

export default Field
