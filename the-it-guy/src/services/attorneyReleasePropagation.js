import { ATTORNEY_RELEASE_UPDATE_VISIBILITY } from '../constants/attorneyReleaseReadinessPhase0.js'

const CLIENT_DESTINATION = Object.freeze({ buyer: 'buyer_portal', seller: 'seller_portal' })

export function resolveAttorneyUpdateDestinations({ visibility = 'internal', clientRecipients = [] } = {}) {
  const normalizedVisibility = ['internal', 'professional_shared', 'client_visible'].includes(visibility) ? visibility : 'internal'
  const base = ATTORNEY_RELEASE_UPDATE_VISIBILITY[normalizedVisibility] || ATTORNEY_RELEASE_UPDATE_VISIBILITY.internal
  if (normalizedVisibility !== 'client_visible') return [...base]

  const recipients = new Set((Array.isArray(clientRecipients) ? clientRecipients : [clientRecipients])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => value === 'buyer' || value === 'seller'))
  return base.filter((destination) => {
    if (destination === 'buyer_portal') return recipients.has('buyer')
    if (destination === 'seller_portal') return recipients.has('seller')
    return true
  })
}

export function buildAttorneyPropagationMatrix() {
  return [
    { visibility: 'internal', recipients: [], destinations: resolveAttorneyUpdateDestinations({ visibility: 'internal' }) },
    { visibility: 'professional_shared', recipients: [], destinations: resolveAttorneyUpdateDestinations({ visibility: 'professional_shared' }) },
    { visibility: 'client_visible', recipients: ['buyer'], destinations: resolveAttorneyUpdateDestinations({ visibility: 'client_visible', clientRecipients: ['buyer'] }) },
    { visibility: 'client_visible', recipients: ['seller'], destinations: resolveAttorneyUpdateDestinations({ visibility: 'client_visible', clientRecipients: ['seller'] }) },
    { visibility: 'client_visible', recipients: ['buyer', 'seller'], destinations: resolveAttorneyUpdateDestinations({ visibility: 'client_visible', clientRecipients: ['buyer', 'seller'] }) },
  ]
}
