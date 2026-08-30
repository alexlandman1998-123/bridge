import { useEffect, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'

function readOnlineState() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false
}

export default function PortalResilienceStatus({ refreshing = false }) {
  const [online, setOnline] = useState(readOnlineState)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (!online) {
    return (
      <div className="portal-connectivity-banner" role="status" aria-live="polite">
        <WifiOff aria-hidden="true" size={17} />
        <span>You’re offline. You can keep reading this page; updates will resume when you reconnect.</span>
      </div>
    )
  }

  if (refreshing) {
    return (
      <div className="portal-refresh-status" role="status" aria-live="polite">
        <RefreshCw className="portal-refresh-status__icon" aria-hidden="true" size={14} />
        <span>Updating</span>
      </div>
    )
  }

  return null
}
