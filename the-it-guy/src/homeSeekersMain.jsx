import { Component, lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'

// The public deployment must not import App or its private CRM/auth shell.
const Home = lazy(() => import('./pages/HomeSeekersDemo'))
const About = lazy(() => import('./pages/HomeSeekersAbout'))
const Contact = lazy(() => import('./pages/HomeSeekersContact'))
const Selling = lazy(() => import('./pages/HomeSeekersSelling'))
const Buying = lazy(() => import('./pages/HomeSeekersBuying'))
const Property = lazy(() => import('./pages/HomeSeekersProperty'))
const Renting = lazy(() => import('./pages/HomeSeekersRenting'))
const Join = lazy(() => import('./pages/HomeSeekersJoin'))

class WebsiteErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <main role="alert" style={{ padding: '48px 24px', textAlign: 'center' }}>
        <h1>This page could not be loaded</h1>
        <p>Please refresh to load the latest Home Seekers page.</p>
        <button type="button" onClick={() => window.location.reload()}>Refresh page</button>
      </main>
    }
    return this.props.children
  }
}

const base = '/demo/homeseekers'
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <WebsiteErrorBoundary>
        <Suspense fallback={<main role="status" style={{ padding: '48px 24px', textAlign: 'center' }}>Loading Home Seekers…</main>}>
          <Routes>
            <Route path="/" element={<Navigate to={base} replace />} />
            <Route path={base} element={<Home />} />
            <Route path={`${base}/guarantee`} element={<Home guaranteePage />} />
            <Route path={`${base}/about`} element={<About />} />
            <Route path={`${base}/contact`} element={<Contact />} />
            <Route path={`${base}/selling`} element={<Selling />} />
            <Route path={`${base}/buying`} element={<Buying />} />
            <Route path={`${base}/buying/:propertyId`} element={<Property />} />
            <Route path={`${base}/properties/:propertyId`} element={<Property />} />
            <Route path={`${base}/renting`} element={<Renting />} />
            <Route path={`${base}/join`} element={<Join />} />
            <Route path={`${base}/buy`} element={<Navigate to={`${base}/buying`} replace />} />
            <Route path={`${base}/sell`} element={<Navigate to={`${base}/selling`} replace />} />
            <Route path={`${base}/rent`} element={<Navigate to={`${base}/renting`} replace />} />
            <Route path={`${base}/developments`} element={<Navigate to={`${base}/buying`} replace />} />
            <Route path={`${base}/people`} element={<Navigate to={`${base}/about`} replace />} />
            <Route path={`${base}/areas`} element={<Navigate to={base} replace />} />
            <Route path={`${base}/valuation`} element={<Navigate to={`${base}/selling`} replace />} />
            <Route path="*" element={<main style={{ padding: '48px 24px', textAlign: 'center' }}><h1>Page not found</h1><a href={base}>Home Seekers home</a></main>} />
          </Routes>
        </Suspense>
      </WebsiteErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
