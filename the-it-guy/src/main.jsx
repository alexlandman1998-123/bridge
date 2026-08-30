import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const ROOT_INSTANCE_KEY = '__arch9ReactRoot'
const rootElement = document.getElementById('root')

function loadDeferredPresentationStyles() {
  // The base stylesheet contains every layout and accessibility-critical rule.
  // This optional polish layer is deliberately moved off the render-blocking
  // path so first content can paint before it is fetched and parsed.
  void import('./styles/premiumSaaS.css')
}

function scheduleDeferredPresentationStyles() {
  if (typeof window === 'undefined') return
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(loadDeferredPresentationStyles, { timeout: 2000 })
    return
  }
  window.setTimeout(loadDeferredPresentationStyles, 0)
}

if (!rootElement) {
  throw new Error('Arch9 could not start because the root element is missing.')
}

const root = rootElement[ROOT_INSTANCE_KEY] || createRoot(rootElement)
rootElement[ROOT_INSTANCE_KEY] = root

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)

scheduleDeferredPresentationStyles()
