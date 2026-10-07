import { useState } from 'react'

import { getLeadSourcePresentation } from './leadSourcePresentation.js'

export default function LeadSourceLogo({ source = '', className = '' }) {
  const presentation = getLeadSourcePresentation(source)
  const [failedLogo, setFailedLogo] = useState('')
  if (!presentation.label) return null
  const showLogo = presentation.logo && failedLogo !== presentation.logo
  return <span className={`${className}${showLogo ? ' has-logo' : ''}`}>
    {showLogo ? <img src={presentation.logo} alt={presentation.label} loading="lazy" onError={() => setFailedLogo(presentation.logo)} /> : presentation.label}
  </span>
}
