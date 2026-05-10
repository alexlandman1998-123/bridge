import { Component } from 'react'
import { Link } from 'react-router-dom'

function getErrorMessage(error) {
  const message = String(error?.message || '').trim()
  if (!message) return 'Something went wrong while loading this area.'
  return message
}

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error, info) {
    console.error('[ERROR_BOUNDARY]', {
      scope: this.props.scope || 'app',
      message: error?.message || 'Unknown render error',
      stack: error?.stack || '',
      componentStack: info?.componentStack || '',
    })
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <section className="auth-loading-screen">
        <div className="auth-loading-card">
          <h2>{this.props.title || 'We hit an unexpected error'}</h2>
          <p>{getErrorMessage(this.state.error)}</p>
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
                this.setState({ hasError: false, error: null })
              }}
            >
              Retry
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
