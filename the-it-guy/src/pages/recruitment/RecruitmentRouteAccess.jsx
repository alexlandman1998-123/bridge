import { createElement, lazy, Suspense } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import AppErrorBoundary from '../../components/AppErrorBoundary'
import useRecruitmentApplicantGate from './useRecruitmentApplicantGate'
import HomeSeekersMeasurement from '../HomeSeekersMeasurement'

const HomeSeekersLogin = lazy(() => import('../HomeSeekersLogin'))
const RecruitmentApplicantSetupPage = lazy(() => import('./RecruitmentApplicantSetupPage'))

function RouteLoading({ label }) {
  return <div role="status">{label}</div>
}

// Resolve applicant access before mounting the agency workspace providers.
export default function RecruitmentRouteAccess({ session, logout, pendingInvitePath, Loading = RouteLoading, children }) {
  const location = useLocation()
  const applicantGate = useRecruitmentApplicantGate(session)

  if (location.pathname === '/applicant' || location.pathname.startsWith('/applicant/')) {
    if (session?.user && !applicantGate.checking && !applicantGate.error && !applicantGate.required) return <Navigate to="/dashboard" replace />
    return <><HomeSeekersMeasurement /><Suspense fallback={createElement(Loading, { label: 'Opening My Profile' })}><AppErrorBoundary scope="applicant-setup" title="My Profile failed to load" brandName="Home Seekers" fallbackPath="/applicant/my-profile" fallbackLabel="My Profile"><RecruitmentApplicantSetupPage /></AppErrorBoundary></Suspense></>
  }
  if (applicantGate.checking) return createElement(Loading, { label: applicantGate.recovering
    ? 'Reconnecting to your workspace'
    : applicantGate.slow ? 'The connection is taking longer. Checking workspace access' : 'Checking workspace access' })
  if (applicantGate.error) return <main className="flex min-h-dvh items-center justify-center bg-[#f4f7f6] px-5 py-12">
    <section role="alert" className="w-full max-w-md rounded-2xl border border-[#dce6e0] bg-white p-7 shadow-sm">
      <p className="text-sm font-semibold text-[#17644c]">Arch9</p>
      <h1 className="mt-3 text-xl font-semibold text-[#19382e]">We couldn’t check your workspace access</h1>
      <p className="mt-3 text-sm leading-6 text-[#52655d]">The service may be temporarily unavailable. Your sign-in has been kept. Retry when the service responds.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" disabled={applicantGate.retrying || applicantGate.retryAfterSeconds > 0} onClick={applicantGate.retry} className="rounded-lg bg-[#17644c] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {applicantGate.retrying ? 'Checking access…' : applicantGate.retryAfterSeconds > 0 ? `Retry in ${applicantGate.retryAfterSeconds}s` : 'Retry'}
        </button>
        <button type="button" onClick={logout} className="rounded-lg border border-[#dce6e0] px-4 py-2.5 text-sm font-semibold text-[#354d41]">Sign out</button>
      </div>
      {applicantGate.retrying ? <p role="status" className="mt-4 text-sm text-[#52655d]">Checking your access again…</p> : null}
    </section>
  </main>
  const applicantAcceptanceRoute = /^\/(?:agent\/)?invite\/[^/]+$/.test(location.pathname) || location.pathname === '/auth/callback'
  if (applicantGate.required && !applicantAcceptanceRoute) return <Navigate to="/applicant/my-profile" replace />
  if (location.pathname === '/homeseekers/login') {
    if (session?.user) return <Navigate to={pendingInvitePath || '/dashboard'} replace />
    return <Suspense fallback={createElement(Loading, { label: 'Opening Home Seekers login' })}><AppErrorBoundary scope="homeseekers-login" title="Login failed to load" brandName="Home Seekers" fallbackPath="/homeseekers/login" fallbackLabel="Log in"><HomeSeekersLogin /></AppErrorBoundary></Suspense>
  }
  return children
}
