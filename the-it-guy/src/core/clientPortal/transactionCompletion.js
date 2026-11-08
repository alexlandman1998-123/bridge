// Explicit persisted lifecycle facts take precedence over legacy status labels.
export function isPortalTransactionRegistered(transaction = {}) {
  const lifecycle=String(transaction.lifecycle_state || transaction.lifecycleState || '').trim().toLowerCase()
  if(lifecycle==='cancelled')return false
  return Boolean(transaction.registered_at || transaction.registeredAt) ||
    ['registered','completed'].includes(lifecycle) ||
    String(transaction.stage || '').trim().toLowerCase()==='registered'
}
