import { useMemo } from 'react'
import { useParams } from 'react-router-dom'

function isLikelyUnsafeToken(value = '') {
  const token = String(value || '').trim()
  if (!token) return true
  if (token.length < 8) return true
  if (token.includes('..') || token.includes('/') || token.includes('\\')) return true
  return false
}

export default function TokenRouteGate({
  paramKey = 'token',
  title = 'Invalid access link',
  retryHref = '/',
  children,
}) {
  const params = useParams()
  const token = String(params?.[paramKey] || '').trim()
  const isInvalid = useMemo(() => isLikelyUnsafeToken(token), [token])

  if (isInvalid) {
    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>{title}</h2>
          <p>This link appears invalid or incomplete. Request a fresh secure link and try again.</p>
          <a href={retryHref} className="auth-secondary-cta mt-3 inline-flex">
            Go back
          </a>
        </div>
      </section>
    )
  }

  return children
}
