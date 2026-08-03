import { Component } from 'react'
import { Link } from 'react-router-dom'
import { reportError } from '../services/observability/errorTracking'

const STALE_CHUNK_AUTO_RELOAD_LIMIT = 6
const STALE_CHUNK_RELOAD_MARKER_TTL_MS = 10 * 60 * 1000
const STALE_CHUNK_RETRY_DELAYS_MS = [250, 1500, 4000, 8000, 15000, 30000]

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
    'ChunkLoadError',
    'Failed to fetch dynamically imported module',
    'Importing a module script failed',
    'error loading dynamically imported module',
    'Load failed for module',
    'dynamically imported module',
  ].some((pattern) => text.includes(pattern)) ||
    (/\/assets\/.+\.js/.test(text) && /chunkloaderror|dynamically imported module|module script|failed to fetch|importing a module|load failed for module/i.test(text)) ||
    (normalizedText.includes('javascript mime type') && normalizedText.includes('text/html'))
}

function getStaleChunkErrorText(error) {
  return [
    error?.name,
    error?.message,
    error?.stack,
  ].filter(Boolean).join(' ')
}

function getStaleChunkAssetUrl(error) {
  if (typeof window === 'undefined') return ''
  const text = getStaleChunkErrorText(error)
  const absoluteMatch = text.match(/https?:\/\/[^\s'")]+\/assets\/[^\s'")]+\.js\b/i)
  const relativeMatch = text.match(/\/assets\/[^\s'")]+\.js\b/i)
  const rawUrl = absoluteMatch?.[0] || relativeMatch?.[0] || ''
  if (!rawUrl) return ''

  try {
    const url = new URL(rawUrl, window.location.origin)
    if (url.origin !== window.location.origin) return ''
    return url.toString()
  } catch {
    return ''
  }
}

function getAssetPath(assetUrl) {
  try {
    return new URL(assetUrl, window.location.origin).pathname.replace(/^\/+/, '')
  } catch {
    return ''
  }
}

function getStaleChunkRetryDelay(attemptIndex) {
  const index = Math.max(0, Math.min(attemptIndex, STALE_CHUNK_RETRY_DELAYS_MS.length - 1))
  return STALE_CHUNK_RETRY_DELAYS_MS[index]
}

function getLoadedReleaseId() {
  if (typeof document === 'undefined') return ''
  return String(document.querySelector('meta[name="arch9-release"]')?.getAttribute('content') || '').trim()
}

function getChunkReloadKey(scope) {
  if (typeof window === 'undefined') return ''
  return `bridge:stale-chunk-reload:${getLoadedReleaseId() || 'unknown'}:${scope || 'app'}:${window.location.pathname}`
}

function buildCacheBustedUrl() {
  if (typeof window === 'undefined') return ''
  try {
    const url = new URL(window.location.href)
    url.searchParams.set('bridge_app_reload', String(Date.now()))
    return url.toString()
  } catch {
    const separator = window.location.href.includes('?') ? '&' : '?'
    return `${window.location.href}${separator}bridge_app_reload=${Date.now()}`
  }
}

async function clearClientAssetCaches() {
  if (typeof window === 'undefined') return
  if (!window.caches || typeof window.caches.keys !== 'function') return

  try {
    const cacheNames = await window.caches.keys()
    await Promise.all(cacheNames.map((name) => window.caches.delete(name)))
  } catch {
    // A cache-busted navigation is still the main recovery path.
  }
}

async function fetchLatestReleaseManifest() {
  if (typeof window === 'undefined') return null

  try {
    const response = await fetch(`/release-manifest.json?stale_chunk_check=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

async function isAssetReachable(assetUrl) {
  if (!assetUrl || typeof fetch !== 'function') return true

  try {
    const url = new URL(assetUrl)
    url.searchParams.set('stale_chunk_probe', String(Date.now()))
    const response = await fetch(url.toString(), {
      method: 'HEAD',
      cache: 'no-store',
    })
    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    return response.ok && (contentType.includes('javascript') || contentType.includes('ecmascript'))
  } catch {
    return false
  }
}

async function shouldWaitForCurrentReleaseAsset(assetUrl) {
  if (!assetUrl) return false
  const manifest = await fetchLatestReleaseManifest()
  if (!manifest) return false

  const latestReleaseId = String(manifest?.releaseId || '').trim()
  const loadedReleaseId = getLoadedReleaseId()
  if (latestReleaseId && loadedReleaseId && latestReleaseId !== loadedReleaseId) return false

  const assetPath = getAssetPath(assetUrl)
  const criticalAssets = Array.isArray(manifest?.criticalAssets) ? manifest.criticalAssets : []
  return Boolean(assetPath && criticalAssets.includes(assetPath))
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      recoveringFromStaleChunk: false,
      staleChunkRecoveryExhausted: false,
      staleChunkRecoveryAttempt: 0,
    }
    this.clearReloadMarkerTimer = null
    this.staleChunkRecoveryTimer = null
    this.unmounted = false
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
    }, STALE_CHUNK_RELOAD_MARKER_TTL_MS)
  }

  componentDidCatch(error, info) {
    console.error('[ERROR_BOUNDARY]', {
      scope: this.props.scope || 'app',
      message: error?.message || 'Unknown render error',
      stack: error?.stack || '',
      componentStack: info?.componentStack || '',
    })
    void reportError(error, {
      category: 'ui_error',
      operation: this.props.scope || 'app_error_boundary',
      route: typeof window !== 'undefined' ? window.location.pathname : '',
      metadata: { componentStack: info?.componentStack || '' },
    })

    if (this.props.autoRecoverStaleChunks !== false && isStaleChunkLoadError(error)) {
      this.recoverFromStaleChunk()
    }
  }

  componentDidUpdate(previousProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null, recoveringFromStaleChunk: false, staleChunkRecoveryExhausted: false })
    }
  }

  componentWillUnmount() {
    this.unmounted = true
    if (this.clearReloadMarkerTimer) {
      window.clearTimeout(this.clearReloadMarkerTimer)
    }
    if (this.staleChunkRecoveryTimer) {
      window.clearTimeout(this.staleChunkRecoveryTimer)
    }
  }

  recoverFromStaleChunk({ force = false } = {}) {
    if (typeof window === 'undefined') return

    const key = getChunkReloadKey(this.props.scope)
    let reloadCount = 0

    try {
      if (force && key) {
        window.sessionStorage.removeItem(key)
      }
      reloadCount = key ? Number(window.sessionStorage.getItem(key) || 0) : 0
      if (!Number.isFinite(reloadCount) || reloadCount < 0) reloadCount = 0
      if (!force && reloadCount >= STALE_CHUNK_AUTO_RELOAD_LIMIT) {
        this.setState({ recoveringFromStaleChunk: false, staleChunkRecoveryExhausted: true })
        return
      }
      if (key) {
        window.sessionStorage.setItem(key, String(reloadCount + 1))
      }
    } catch {
      reloadCount = 0
    }

    const attemptNumber = reloadCount + 1
    const delayMs = getStaleChunkRetryDelay(reloadCount)
    this.setState({
      recoveringFromStaleChunk: true,
      staleChunkRecoveryExhausted: false,
      staleChunkRecoveryAttempt: attemptNumber,
    })

    if (this.staleChunkRecoveryTimer) {
      window.clearTimeout(this.staleChunkRecoveryTimer)
    }
    this.staleChunkRecoveryTimer = window.setTimeout(() => {
      void this.continueStaleChunkRecovery({ force, attemptNumber })
    }, delayMs)
  }

  async continueStaleChunkRecovery({ force = false, attemptNumber = 1 } = {}) {
    const assetUrl = getStaleChunkAssetUrl(this.state.error)
    const waitForCurrentReleaseAsset = await shouldWaitForCurrentReleaseAsset(assetUrl)
    const assetReady = waitForCurrentReleaseAsset ? await isAssetReachable(assetUrl) : true

    if (this.unmounted) return

    if (assetReady) {
      await clearClientAssetCaches()
      const url = buildCacheBustedUrl()
      if (url) {
        window.location.replace(url)
        return
      }
      window.location.reload()
      return
    }

    if (!force && attemptNumber >= STALE_CHUNK_AUTO_RELOAD_LIMIT) {
      this.setState({ recoveringFromStaleChunk: false, staleChunkRecoveryExhausted: true })
      return
    }

    this.recoverFromStaleChunk({ force: false })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const staleChunkError = isStaleChunkLoadError(this.state.error)
    const staleChunkExhausted = staleChunkError && this.state.staleChunkRecoveryExhausted

    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>
            {staleChunkExhausted
              ? 'App update is still reaching this browser'
              : staleChunkError ? 'Loading the latest app version' : this.props.title || 'We hit an unexpected error'}
          </h2>
          <p>
            {this.state.recoveringFromStaleChunk
              ? `A newer version of Arch9 is available. Checking app files before refreshing${this.state.staleChunkRecoveryAttempt > 1 ? `, attempt ${this.state.staleChunkRecoveryAttempt}` : ''}.`
              : staleChunkExhausted
                ? 'One of the app files is still unavailable at this location. Refresh again in a moment, or open the dashboard while the app file catches up.'
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
                  this.recoverFromStaleChunk({ force: true })
                  return
                }
                this.setState({ hasError: false, error: null, recoveringFromStaleChunk: false, staleChunkRecoveryExhausted: false })
              }}
            >
              {staleChunkError ? 'Refresh App' : 'Retry'}
            </button>
            <Link to={this.props.fallbackPath || '/dashboard'} className="auth-secondary-cta">
              {this.props.fallbackLabel || 'Go to Dashboard'}
            </Link>
          </div>
        </div>
      </section>
    )
  }
}

export default AppErrorBoundary
