import { createElement, lazy, Suspense } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import AppErrorBoundary from '../../components/AppErrorBoundary'
import useRecruitmentApplicantGate from './useRecruitmentApplicantGate'

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
    return <Suspense fallback={createElement(Loading, { label: 'Opening My Profile' })}><AppErrorBoundary scope="applicant-setup" title="My Profile failed to load" brandName="Home Seekers" fallbackPath="/applicant/my-profile" fallbackLabel="My Profile"><RecruitmentApplicantSetupPage /></AppErrorBoundary></Suspense>
  }
  if (applicantGate.checking) return createElement(Loading, { label: 'Checking workspace access' })
  if (applicantGate.error) return <div role="alert"><p>Workspace access could not be checked.</p><button type="button" onClick={applicantGate.retry}>Retry</button><button type="button" onClick={logout}>Sign out</button></div>
  const applicantAcceptanceRoute = /^\/(?:agent\/)?invite\/[^/]+$/.test(location.pathname) || location.pathname === '/auth/callback'
  if (applicantGate.required && !applicantAcceptanceRoute) return <Navigate to="/applicant/my-profile" replace />
  if (location.pathname === '/homeseekers/login') {
    if (session?.user) return <Navigate to={pendingInvitePath || '/dashboard'} replace />
    return <Suspense fallback={createElement(Loading, { label: 'Opening Home Seekers login' })}><AppErrorBoundary scope="homeseekers-login" title="Login failed to load" brandName="Home Seekers" fallbackPath="/homeseekers/login" fallbackLabel="Log in"><HomeSeekersLogin /></AppErrorBoundary></Suspense>
  }
  return children
}
