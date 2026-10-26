import { UserRound } from 'lucide-react'
import { useState } from 'react'
import { getLeadSourcePresentation } from './mobile-shell/leadSourcePresentation.js'

export function NotificationLeadAvatar({ name = '' }) {
  const initials = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 2).map((word) => word[0].toUpperCase()).join('')
  return <span className="notification-lead-avatar" aria-hidden="true">{initials || <UserRound size={19} strokeWidth={1.6} />}</span>
}

export function NotificationLeadSource({ source = '' }) {
  const { label, logo } = getLeadSourcePresentation(source)
  const [failedLogo, setFailedLogo] = useState('')
  if (!label) return null
  return <span className="notification-lead-source">
    {logo && logo !== failedLogo ? <img src={logo} alt="" loading="lazy" onError={() => setFailedLogo(logo)} /> : null}
    <span>{label}</span>
  </span>
}
