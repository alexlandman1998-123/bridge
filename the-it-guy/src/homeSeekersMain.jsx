import { Component, lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
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

function LegacyDemoRedirect() {
  const { pathname } = useLocation()
  const path = pathname.slice('/demo/homeseekers'.length).replace(/^\/+/, '')
  return <PageRedirect to={`/${path}`} />
}

function PageRedirect({ to }) {
  const { search, hash } = useLocation()
  return <Navigate to={`${to}${search}${hash}`} replace />
}
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <WebsiteErrorBoundary>
        <Suspense fallback={<main role="status" style={{ padding: '48px 24px', textAlign: 'center' }}>Loading Home Seekers…</main>}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/demo/homeseekers/*" element={<LegacyDemoRedirect />} />
            <Route path="/guarantee" element={<Home guaranteePage />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/selling" element={<Selling />} />
            <Route path="/buying" element={<Buying />} />
            <Route path="/buying/:propertyId" element={<Property />} />
            <Route path="/properties/:propertyId" element={<Property />} />
            <Route path="/renting" element={<Renting />} />
            <Route path="/join" element={<Join />} />
            <Route path="/buy" element={<PageRedirect to="/buying" />} />
            <Route path="/sell" element={<PageRedirect to="/selling" />} />
            <Route path="/rent" element={<PageRedirect to="/renting" />} />
            <Route path="/developments" element={<PageRedirect to="/buying" />} />
            <Route path="/people" element={<PageRedirect to="/about" />} />
            <Route path="/areas" element={<PageRedirect to="/" />} />
            <Route path="/valuation" element={<PageRedirect to="/selling" />} />
            <Route path="*" element={<main style={{ padding: '48px 24px', textAlign: 'center' }}><h1>Page not found</h1><a href="/">Home Seekers home</a></main>} />
          </Routes>
        </Suspense>
      </WebsiteErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
