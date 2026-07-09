import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import UxDiagnosticsActions from '../feedback/UxDiagnosticsActions'

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
  supportHref = '/settings/help',
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
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <a href={retryHref} className="auth-primary-cta inline-flex no-underline">
              Go back
            </a>
            <a href={supportHref} className="auth-secondary-cta inline-flex no-underline">
              Help Centre
            </a>
          </div>
          <UxDiagnosticsActions
            source={`token_route_gate:${paramKey}`}
            category="invalid_token_route"
            severity="high"
            message={title}
            metadata={{ routeParam: paramKey, title }}
            compact
          />
        </div>
      </section>
    )
  }

  return children
}
