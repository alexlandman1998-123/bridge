import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const ARCH9_JOIN_URL = import.meta.env.VITE_ARCH9_JOIN_URL || 'https://admin.arch9.co.za/join'

function buildArch9JoinUrl(search = '') {
  try {
    const targetUrl = new URL(ARCH9_JOIN_URL)
    const sourceParams = new URLSearchParams(search)
    sourceParams.forEach((value, key) => {
      targetUrl.searchParams.set(key, value)
    })
    return targetUrl.toString()
  } catch {
    return `${ARCH9_JOIN_URL}${search || ''}`
  }
}

export default function Arch9JoinRedirect({ fallback = null }) {
  const location = useLocation()
  const targetUrl = buildArch9JoinUrl(location.search)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.location.replace(targetUrl)
  }, [targetUrl])

  return (
    <main className="center-shell">
      {fallback}
      <a href={targetUrl}>Continue to Arch9 join</a>
    </main>
  )
}

