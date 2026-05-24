import { Component } from 'react'
import { Link } from 'react-router-dom'

function getErrorMessage(error) {
  const message = String(error?.message || '').trim()
  if (!message) return 'Something went wrong while loading this area.'
  return message
}

function isStaleChunkLoadError(error) {
  const text = [
    error?.name,
    error?.message,
    error?.stack,
  ].filter(Boolean).join(' ')
  const normalizedText = text.toLowerCase()

  return [
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'error loading dynamically imported module',
    'Load failed for module',
    'dynamically imported module',
  ].some((pattern) => text.includes(pattern)) ||
    (/\/assets\/.+\.js/.test(text) && /module|import|fetch|load/i.test(text)) ||
    (normalizedText.includes('javascript mime type') && normalizedText.includes('text/html'))
}

function getChunkReloadKey(scope) {
  if (typeof window === 'undefined') return ''
  return `bridge:stale-chunk-reload:${scope || 'app'}:${window.location.pathname}`
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      recoveringFromStaleChunk: false,
    }
    this.clearReloadMarkerTimer = null
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    }
  }

  componentDidMount() {
    if (typeof window === 'undefined') return
    const key = getChunkReloadKey(this.props.scope)
    if (!key) return

    this.clearReloadMarkerTimer = window.setTimeout(() => {
      try {
        window.sessionStorage.removeItem(key)
      } catch {
        // Ignore storage access issues; stale chunk recovery still works manually.
      }
    }, 5000)
  }

  componentDidCatch(error, info) {
    console.error('[ERROR_BOUNDARY]', {
      scope: this.props.scope || 'app',
      message: error?.message || 'Unknown render error',
      stack: error?.stack || '',
      componentStack: info?.componentStack || '',
    })

    if (this.props.autoRecoverStaleChunks !== false && isStaleChunkLoadError(error)) {
      this.recoverFromStaleChunk()
    }
  }

  componentDidUpdate(previousProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, recoveringFromStaleChunk: false })
    }
  }

  componentWillUnmount() {
    if (this.clearReloadMarkerTimer) {
      window.clearTimeout(this.clearReloadMarkerTimer)
    }
  }

  recoverFromStaleChunk() {
    if (typeof window === 'undefined') return

    const key = getChunkReloadKey(this.props.scope)
    let hasAlreadyReloaded = false

    try {
      hasAlreadyReloaded = key ? window.sessionStorage.getItem(key) === 'true' : false
      if (key && !hasAlreadyReloaded) {
        window.sessionStorage.setItem(key, 'true')
      }
    } catch {
      hasAlreadyReloaded = false
    }

    if (hasAlreadyReloaded) return

    this.setState({ recoveringFromStaleChunk: true })
    window.setTimeout(() => {
      window.location.reload()
    }, 250)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const staleChunkError = isStaleChunkLoadError(this.state.error)

    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>{staleChunkError ? 'Loading the latest app version' : this.props.title || 'We hit an unexpected error'}</h2>
          <p>
            {this.state.recoveringFromStaleChunk
              ? 'A newer version of Bridge is available. Refreshing this page now.'
              : staleChunkError
                ? 'This page was opened with an older app file. Refresh to load the latest version.'
                : getErrorMessage(this.state.error)}
          </p>
          {import.meta.env.DEV && this.state.error ? (
            <details className="mt-3 w-full rounded-[12px] border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2 text-left text-xs text-[#334155]">
              <summary className="cursor-pointer font-semibold">Debug details</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">{String(this.state.error?.stack || this.state.error?.message || '')}</pre>
            </details>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              className="auth-primary-cta"
              onClick={() => {
                if (staleChunkError) {
                  window.location.reload()
                  return
                }
                this.setState({ hasError: false, error: null, recoveringFromStaleChunk: false })
              }}
            >
              {staleChunkError ? 'Refresh App' : 'Retry'}
            </button>
            <Link to="/dashboard" className="auth-secondary-cta">
              Go to Dashboard
            </Link>
          </div>
        </div>
      </section>
    )
  }
}

export default AppErrorBoundary
