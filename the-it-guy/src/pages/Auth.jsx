import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Hammer,
  Landmark,
  Shield,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  UserRound,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { setStoredDevAuthRole } from '../lib/devAuth'
import { isDevAuthBypassEnabled } from '../lib/devAuth'
import { clearPostLoginRedirect, getPostLoginRedirect } from '../lib/resolveMobileAwareRedirect'
import { APP_ROLE_LABELS } from '../lib/appRoleMetadata'
import { canAccessHQ } from '../auth/hqAccess'
import {
  BUSINESS_TYPE_OPTIONS,
  POSITION_OPTIONS_BY_BUSINESS_TYPE,
  SIGNUP_BUSINESS_TYPES,
  SIGNUP_INTENT_SOURCE,
} from '../constants/signupIntents'
import {
  buildSignupIntent,
  createSignupUserMetadata,
  persistSignupIntent,
  resolveSignupIntentRoute,
  storeSignupIntentTemporarily,
} from '../lib/signupIntent'
import {
  clearSupabaseLocalAuthState,
  isSupabaseConfigured,
  isUnsupportedJwtAlgorithmError,
  supabase,
} from '../lib/supabaseClient'
import { isPartnerInviteReturnPath, rememberPendingPartnerInvitePath } from '../lib/pendingPartnerInvite'

const PENDING_ORG_INVITE_TOKEN_STORAGE_KEY = 'itg:pending-org-invite-token'
const PENDING_ORG_INVITE_EMAIL_STORAGE_KEY = 'itg:pending-org-invite-email'
const PENDING_ORG_INVITE_MODULE_STORAGE_KEY = 'itg:pending-org-invite-module'
const PENDING_ORG_INVITE_ROLE_STORAGE_KEY = 'itg:pending-org-invite-role'

function getRedirectPath(location) {
  const nextPath = new URLSearchParams(location.search).get('next')
  if (typeof nextPath === 'string' && nextPath.startsWith('/')) {
    return nextPath
  }

  const fromPath = location.state?.from?.pathname
  if (typeof fromPath === 'string' && fromPath.startsWith('/')) {
    return fromPath
  }

  return getPostLoginRedirect('/dashboard')
}

function resolveEmailVerificationRedirectTo(nextPath = '/setup') {
  const candidates = [
    import.meta?.env?.VITE_PUBLIC_APP_URL,
    import.meta?.env?.VITE_APP_BASE_URL,
    import.meta?.env?.VITE_SITE_URL,
    typeof window !== 'undefined' ? window.location.origin : '',
  ]

  for (const candidate of candidates) {
    const value = String(candidate || '').trim()
    if (!value) continue
    try {
      const baseUrl = new URL(value)
      const redirectUrl = new URL('/auth/callback', baseUrl.origin)
      redirectUrl.searchParams.set('next', nextPath)
      return redirectUrl.toString()
    } catch {
      // Ignore malformed URL candidates and continue.
    }
  }

  return undefined
}

function getInviteTokenFromNextPath(location) {
  const nextPath = new URLSearchParams(location.search).get('next')
  const match = String(nextPath || '').match(/^\/(?:agent\/)?invite\/([^/?#]+)/)
  return match?.[1] ? decodeURIComponent(match[1]) : ''
}

function getStoredPendingInviteToken() {
  if (typeof window === 'undefined') return ''
  return String(window.sessionStorage.getItem(PENDING_ORG_INVITE_TOKEN_STORAGE_KEY) || '').trim()
}

function resolvePendingInvitePath(location = null) {
  const nextPath = location ? new URLSearchParams(location.search).get('next') : ''
  if (typeof nextPath === 'string' && nextPath.startsWith('/invite/')) {
    return nextPath
  }
  const pendingInviteToken = location ? getInviteTokenFromNextPath(location) || getStoredPendingInviteToken() : getStoredPendingInviteToken()
  if (!pendingInviteToken) return ''
  return `/invite/${pendingInviteToken}`
}

function ensureInviteAutoAcceptPath(path = '') {
  const safePath = String(path || '').trim()
  if (!safePath.startsWith('/invite/')) return safePath
  try {
    const url = new URL(safePath, 'https://arch9.local')
    url.searchParams.set('accept', '1')
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return safePath.includes('?') ? `${safePath}&accept=1` : `${safePath}?accept=1`
  }
}

function isPublicInviteReturnPath(path = '') {
  const safePath = String(path || '').trim()
  return (
    safePath.startsWith('/invite/') ||
    safePath.startsWith('/agent/invite/') ||
    safePath.startsWith('/partners/invite/') ||
    safePath.startsWith('/developer/access-invite/') ||
    safePath.startsWith('/developer/partner-invite/') ||
    safePath.startsWith('/transaction-invite/') ||
    safePath.startsWith('/referrals/invite/') ||
    safePath.startsWith('/partner-portal/') ||
    safePath.startsWith('/partners/portal/') ||
    safePath.startsWith('/commercial/portal/') ||
    safePath.startsWith('/commercial/onboarding/') ||
    safePath.startsWith('/commercial/landlord-onboarding/') ||
    safePath.startsWith('/client/') ||
    safePath.startsWith('/seller/onboarding/') ||
    safePath.startsWith('/mobile/buyer-onboarding/') ||
    safePath.startsWith('/mobile/seller-onboarding/')
  )
}

function shouldReturnDirectlyAfterSignup(path = '') {
  const safePath = String(path || '').trim()
  return isPublicInviteReturnPath(safePath) && !isPartnerInviteReturnPath(safePath)
}

function resolveSignupContinuationPath({
  redirectTo = '',
  currentIntent = null,
  inviteDrivenSignup = false,
  inviteVerificationRedirectTo = '',
} = {}) {
  if (inviteDrivenSignup) return inviteVerificationRedirectTo || redirectTo || '/setup'
  if (isPartnerInviteReturnPath(redirectTo) && currentIntent) return resolveSignupIntentRoute(currentIntent)
  if (shouldReturnDirectlyAfterSignup(redirectTo)) return redirectTo
  if (currentIntent) return resolveSignupIntentRoute(currentIntent)
  return '/setup'
}

async function resolveFounderLoginTarget(fallbackTarget = '/dashboard') {
  const target = String(fallbackTarget || '/dashboard').trim() || '/dashboard'
  if (!['/', '/dashboard'].includes(target)) return target
  if (!isSupabaseConfigured || !supabase) return target

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    const userId = userData?.user?.id || ''
    if (!userId) return target
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, system_role')
      .eq('id', userId)
      .maybeSingle()
    if (!error && canAccessHQ({ profile: data })) return '/command-center'

    const membershipResult = await supabase
      .from('organisation_users')
      .select('role, workspace_role, organisation_role, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(10)
    if (membershipResult.error) return target
    const hasHQMembership = (membershipResult.data || []).some((membership) => canAccessHQ({ currentMembership: membership }))
    return hasHQMembership ? '/command-center' : target
  } catch (error) {
    console.warn('[AUTH] founder landing check skipped', error)
    return target
  }
}

function resolveInviteTokenFromLocation(location) {
  return getInviteTokenFromNextPath(location) || getStoredPendingInviteToken()
}

function normalizeAuthEmail(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveInviteEmailFromLocation(location) {
  const queryEmail = new URLSearchParams(location.search).get('email')
  if (queryEmail) return normalizeAuthEmail(queryEmail)
  if (typeof window === 'undefined') return ''
  const inviteTokenFromUrl = getInviteTokenFromNextPath(location)
  const storedInviteToken = getStoredPendingInviteToken()
  if (inviteTokenFromUrl && inviteTokenFromUrl !== storedInviteToken) return ''
  return normalizeAuthEmail(window.sessionStorage.getItem(PENDING_ORG_INVITE_EMAIL_STORAGE_KEY))
}

function normalizeInviteContextValue(value = '') {
  return String(value || '').trim().toLowerCase()
}

function resolveInviteModuleFromLocation(location) {
  const queryModule = new URLSearchParams(location.search).get('module')
  if (queryModule) return normalizeInviteContextValue(queryModule)
  if (typeof window === 'undefined') return ''
  const inviteTokenFromUrl = getInviteTokenFromNextPath(location)
  const storedInviteToken = getStoredPendingInviteToken()
  if (inviteTokenFromUrl && inviteTokenFromUrl !== storedInviteToken) return ''
  return normalizeInviteContextValue(window.sessionStorage.getItem(PENDING_ORG_INVITE_MODULE_STORAGE_KEY))
}

function resolveInviteRoleFromLocation(location) {
  const queryRole = new URLSearchParams(location.search).get('role')
  if (queryRole) return normalizeInviteContextValue(queryRole)
  if (typeof window === 'undefined') return ''
  const inviteTokenFromUrl = getInviteTokenFromNextPath(location)
  const storedInviteToken = getStoredPendingInviteToken()
  if (inviteTokenFromUrl && inviteTokenFromUrl !== storedInviteToken) return ''
  return normalizeInviteContextValue(window.sessionStorage.getItem(PENDING_ORG_INVITE_ROLE_STORAGE_KEY))
}

const COMMERCIAL_INVITE_MARKERS = new Set(['commercial', 'commercial_brokerage', 'commercial_agency'])

function isCommercialInviteContext({ moduleContext = '', role = '' } = {}) {
  const safeModuleContext = normalizeInviteContextValue(moduleContext)
  const safeRole = normalizeInviteContextValue(role)
  return COMMERCIAL_INVITE_MARKERS.has(safeModuleContext) || safeRole.startsWith('commercial_') || safeRole.includes('commercial broker')
}

function resolveInviteSignupPosition({ moduleContext = '', role = '' } = {}) {
  return isCommercialInviteContext({ moduleContext, role }) ? 'commercial_broker' : 'agency_operational'
}

const DEV_BYPASS_ROLES = ['developer', 'agent', 'attorney', 'bond_originator']
const SIGNUP_STEPS = [
  { eyebrow: '01', label: 'Business' },
  { eyebrow: '02', label: 'Role' },
  { eyebrow: '03', label: 'Account' },
]
const ROLE_ICONS = {
  [SIGNUP_BUSINESS_TYPES.agency]: Building2,
  [SIGNUP_BUSINESS_TYPES.commercialBrokerage]: Landmark,
  [SIGNUP_BUSINESS_TYPES.mixedAgency]: Building2,
  [SIGNUP_BUSINESS_TYPES.developer]: Hammer,
  [SIGNUP_BUSINESS_TYPES.attorney]: Scale,
  [SIGNUP_BUSINESS_TYPES.bondOriginator]: WalletCards,
  [SIGNUP_BUSINESS_TYPES.client]: UserRound,
}
const POSITION_ICON = Landmark
const ROLE_DISPLAY_COPY = {
  [SIGNUP_BUSINESS_TYPES.agency]: {
    label: 'Residential Estate Agency',
    description: 'Residential sales, rentals and transactions',
  },
  [SIGNUP_BUSINESS_TYPES.commercialBrokerage]: {
    label: 'Commercial Real Estate Brokerage',
    description: 'Commercial listings, tenants and deals',
  },
  [SIGNUP_BUSINESS_TYPES.mixedAgency]: {
    label: 'Mixed Residential + Commercial Agency',
    description: 'One agency across both property lines',
  },
  [SIGNUP_BUSINESS_TYPES.attorney]: {
    label: 'Attorney Firm',
    description: 'Handle transfers, bonds and documents',
  },
  [SIGNUP_BUSINESS_TYPES.developer]: {
    label: 'Developer',
    description: 'Develop projects and manage sales',
  },
  [SIGNUP_BUSINESS_TYPES.bondOriginator]: {
    label: 'Bond Originator',
    description: 'Source bonds and manage applications',
  },
  [SIGNUP_BUSINESS_TYPES.client]: {
    label: 'Buyer / Seller',
    description: 'Buy or sell property privately',
  },
}
const ROLE_DISPLAY_ORDER = [
  SIGNUP_BUSINESS_TYPES.agency,
  SIGNUP_BUSINESS_TYPES.commercialBrokerage,
  SIGNUP_BUSINESS_TYPES.mixedAgency,
  SIGNUP_BUSINESS_TYPES.attorney,
  SIGNUP_BUSINESS_TYPES.developer,
  SIGNUP_BUSINESS_TYPES.bondOriginator,
  SIGNUP_BUSINESS_TYPES.client,
]
const MARKET_METRICS = [
  { label: 'Transactions Today', value: '24,812', delta: '143 since page load', trend: 'up', icon: TrendingUp },
  { label: 'Avg. Registration Time', value: '63 Days', delta: '5 Days this week', trend: 'down', icon: Clock3 },
  { label: 'Active Professionals', value: '18,240', delta: '78 this week', trend: 'up', icon: UsersRound },
  { label: 'Value Moving Today', value: 'R14.2B', delta: 'R1.8B since yesterday', trend: 'up', icon: WalletCards },
]
const WORKSPACE_CHECKLIST = [
  'Configuring role permissions',
  'Preparing transaction workflows',
  'Creating your dashboard',
  'Securing workspace',
]

function getOrderedBusinessTypeOptions() {
  return ROLE_DISPLAY_ORDER
    .map((value) => BUSINESS_TYPE_OPTIONS.find((option) => option.value === value))
    .filter(Boolean)
}

function getBusinessSetupCopy(businessTypeLabel = 'workspace') {
  const normalized = businessTypeLabel || 'workspace'
  if (normalized === 'Residential Estate Agency') return 'Tell us about your residential agency'
  if (normalized === 'Commercial Real Estate Brokerage') return 'Tell us about your commercial brokerage'
  if (normalized === 'Mixed Residential + Commercial Agency') return 'Tell us about your mixed agency'
  if (normalized === 'Attorney Firm') return 'Tell us about your firm'
  if (normalized === 'Developer') return 'Tell us about your development company'
  if (normalized === 'Bond Originator') return 'Tell us about your bond business'
  if (normalized === 'Buyer / Seller') return 'Tell us about your transaction'
  return `Tell us about your ${normalized.toLowerCase()}`
}

function handleKeyboardSelect(event, callback) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  callback()
}

function normalizeErrorMessage(error) {
  return String(error?.message || error || '').trim()
}

function isAuthRateLimitError(error) {
  const message = normalizeErrorMessage(error).toLowerCase()
  return (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('over_email_send_rate_limit') ||
    message.includes('email rate limit exceeded')
  )
}

function isExistingOrUnconfirmedUserError(error) {
  const message = normalizeErrorMessage(error).toLowerCase()
  return (
    message.includes('user already registered') ||
    message.includes('already been registered') ||
    message.includes('email already registered') ||
    message.includes('already exists') ||
    message.includes('email not confirmed')
  )
}

function Auth({ onDevBypass = null }) {
  const navigate = useNavigate()
  const location = useLocation()
  const initialInvitedEmail = useMemo(() => resolveInviteEmailFromLocation(location), [location])
  const inviteModuleContext = useMemo(() => resolveInviteModuleFromLocation(location), [location])
  const inviteRole = useMemo(() => resolveInviteRoleFromLocation(location), [location])
  const inviteSignupPosition = useMemo(
    () => resolveInviteSignupPosition({ moduleContext: inviteModuleContext, role: inviteRole }),
    [inviteModuleContext, inviteRole],
  )
  const [mode, setMode] = useState(() => (new URLSearchParams(location.search).get('mode') === 'signup' ? 'signup' : 'login'))
  const [signupStep, setSignupStep] = useState(0)
  const [businessType, setBusinessType] = useState('')
  const [position, setPosition] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState(() => initialInvitedEmail)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState(() => initialInvitedEmail)
  const authFormRef = useRef(null)

  const redirectTo = useMemo(() => getRedirectPath(location), [location])
  const inviteToken = useMemo(() => resolveInviteTokenFromLocation(location), [location])
  const invitedEmail = initialInvitedEmail
  const inviteDrivenSignup = Boolean(inviteToken)
  const currentIntent = useMemo(() => {
    const resolvedPosition = position || (inviteDrivenSignup ? inviteSignupPosition : '')
    if (!resolvedPosition) return null
    return buildSignupIntent({
      position: resolvedPosition,
      inviteToken,
      source: inviteDrivenSignup ? SIGNUP_INTENT_SOURCE.inviteLink : SIGNUP_INTENT_SOURCE.publicSignup,
    })
  }, [inviteDrivenSignup, inviteSignupPosition, inviteToken, position])
  const positionOptions = POSITION_OPTIONS_BY_BUSINESS_TYPE[businessType] || []
  const selectedBusinessTypeLabel = ROLE_DISPLAY_COPY[businessType]?.label || BUSINESS_TYPE_OPTIONS.find((option) => option.value === businessType)?.label || ''
  const selectedPositionLabel = positionOptions.find((option) => option.value === position)?.label || ''

  useEffect(() => {
    if (!inviteDrivenSignup || mode !== 'signup') return
    const inviteBusinessType = isCommercialInviteContext({ moduleContext: inviteModuleContext, role: inviteRole })
      ? SIGNUP_BUSINESS_TYPES.commercialBrokerage
      : SIGNUP_BUSINESS_TYPES.agency
    if (!businessType) setBusinessType(inviteBusinessType)
    if (!position) setPosition(inviteSignupPosition)
    if (signupStep < 2) setSignupStep(2)
  }, [businessType, inviteDrivenSignup, inviteModuleContext, inviteRole, inviteSignupPosition, mode, position, signupStep])

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return
    }

    async function checkSession() {
      console.debug('[AUTH] session:check:start')
      const { data, error } = await supabase.auth.getSession()
      if (error && isUnsupportedJwtAlgorithmError(error)) {
        await clearSupabaseLocalAuthState()
        return
      }
      if (data?.session) {
        const pendingInvitePath = resolvePendingInvitePath(location)
        const target = pendingInvitePath || redirectTo
        clearPostLoginRedirect()
        console.debug('[REDIRECT] auth:session-present', { target, pendingInvite: Boolean(pendingInvitePath) })
        navigate(target, { replace: true })
      }
    }

    void checkSession()
  }, [location, navigate, redirectTo])

  useEffect(() => {
    if (!inviteDrivenSignup) return
    setBusinessType(
      isCommercialInviteContext({ moduleContext: inviteModuleContext, role: inviteRole })
        ? SIGNUP_BUSINESS_TYPES.commercialBrokerage
        : SIGNUP_BUSINESS_TYPES.agency,
    )
    setPosition(inviteSignupPosition)
    setSignupStep(2)
  }, [inviteDrivenSignup, inviteModuleContext, inviteRole, inviteSignupPosition])

  useEffect(() => {
    if (!inviteDrivenSignup || typeof window === 'undefined') return
    window.sessionStorage.setItem(PENDING_ORG_INVITE_TOKEN_STORAGE_KEY, inviteToken)
    if (invitedEmail) {
      window.sessionStorage.setItem(PENDING_ORG_INVITE_EMAIL_STORAGE_KEY, invitedEmail)
      setEmail(invitedEmail)
      setPendingVerificationEmail(invitedEmail)
    } else {
      window.sessionStorage.removeItem(PENDING_ORG_INVITE_EMAIL_STORAGE_KEY)
    }
    if (inviteModuleContext) {
      window.sessionStorage.setItem(PENDING_ORG_INVITE_MODULE_STORAGE_KEY, inviteModuleContext)
    } else {
      window.sessionStorage.removeItem(PENDING_ORG_INVITE_MODULE_STORAGE_KEY)
    }
    if (inviteRole) {
      window.sessionStorage.setItem(PENDING_ORG_INVITE_ROLE_STORAGE_KEY, inviteRole)
    } else {
      window.sessionStorage.removeItem(PENDING_ORG_INVITE_ROLE_STORAGE_KEY)
    }
  }, [inviteDrivenSignup, inviteModuleContext, inviteRole, inviteToken, invitedEmail])

  useEffect(() => {
    if (mode !== 'signup' || typeof window === 'undefined') return undefined
    if (isPartnerInviteReturnPath(redirectTo)) {
      rememberPendingPartnerInvitePath(redirectTo)
    }
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0 })
      if (authFormRef.current) {
        authFormRef.current.scrollTop = 0
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [mode, redirectTo, signupStep])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY in .env.')
      return
    }

    if (!email.trim()) {
      setError('Email is required.')
      return
    }

    if (inviteDrivenSignup && invitedEmail && normalizeAuthEmail(email) !== invitedEmail) {
      setError(`This invite is for ${invitedEmail}. Sign in or create an account with that email address to continue.`)
      return
    }

    if (!password.trim()) {
      setError('Password is required.')
      return
    }

    if (mode === 'signup') {
      if (!currentIntent) {
        setError('Choose your business type and role before creating an account.')
        setSignupStep(businessType ? 1 : 0)
        return
      }
      if (!fullName.trim()) {
        setError('Full name is required.')
        setSignupStep(2)
        return
      }
      if (!phone.trim()) {
        setError('Phone number is required.')
        setSignupStep(2)
        return
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters.')
        return
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    try {
      setLoading(true)
      setError('')
      setMessage('')
      const inviteVerificationRedirectTo = ensureInviteAutoAcceptPath(resolvePendingInvitePath(location) || redirectTo)
      const emailRedirectTo = resolveEmailVerificationRedirectTo(
        mode === 'signup'
          ? resolveSignupContinuationPath({ redirectTo, currentIntent, inviteDrivenSignup, inviteVerificationRedirectTo })
          : '/setup',
      )

      if (mode === 'login') {
        console.debug('[AUTH] login:start', { email: email.trim().toLowerCase() })
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (signInError) {
          throw signInError
        }

        const pendingInvitePath = resolvePendingInvitePath(location)
        const target = pendingInvitePath || await resolveFounderLoginTarget(redirectTo)
        clearPostLoginRedirect()
        console.debug('[AUTH] login:success', { target, pendingInvite: Boolean(pendingInvitePath) })
        navigate(target, { replace: true })
        return
      }

      const intentWithEmail = {
        ...currentIntent,
        email: email.trim().toLowerCase(),
      }
      storeSignupIntentTemporarily(intentWithEmail)

      console.debug('[AUTH] signup:start', {
        email: email.trim().toLowerCase(),
        appRole: intentWithEmail.app_role,
        workspaceAction: intentWithEmail.workspace_action,
      })
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo,
          data: createSignupUserMetadata({
            intent: intentWithEmail,
            fullName,
            phone,
          }),
        },
      })

      if (signUpError) {
        const signUpMessage = String(signUpError?.message || '').toLowerCase()
        if (signUpMessage.includes('redirect') && signUpMessage.includes('not allowed')) {
          throw new Error('Verification redirect URL is not allowed by Supabase Auth. Add your app URLs to Auth redirect settings and retry.')
        }
        if (isAuthRateLimitError(signUpError)) {
          setPendingVerificationEmail(email.trim())
          setMode('login')
          setMessage('Supabase Auth rejected the verification email because the project email limit was reached. Use Resend verification after the project limit is raised.')
          setPassword('')
          setConfirmPassword('')
          return
        }
        if (isExistingOrUnconfirmedUserError(signUpError)) {
          setPendingVerificationEmail(email.trim())
          setMode('login')
          setMessage('This email is already registered or pending verification. Sign in, or resend verification below.')
          setPassword('')
          setConfirmPassword('')
          return
        }
        throw signUpError
      }

      if (data?.user) {
        await persistSignupIntent({
          intent: intentWithEmail,
          user: data.user,
          email: email.trim(),
          status: data?.session ? 'ready_for_onboarding' : 'pending_email_verification',
        })
      }

      if (data?.session) {
        const pendingInvitePath = resolvePendingInvitePath(location)
        const target = pendingInvitePath || resolveSignupContinuationPath({ redirectTo, currentIntent: intentWithEmail })
        clearPostLoginRedirect()
        console.debug('[REDIRECT] signup:session-created', { target, pendingInvite: Boolean(pendingInvitePath) })
        navigate(target, { replace: true })
        return
      }

      const identities = Array.isArray(data?.user?.identities) ? data.user.identities : null
      const receivedObfuscatedUser = Array.isArray(identities) && identities.length === 0

      if (receivedObfuscatedUser) {
        setMessage('If this email is already registered, use Login. If it is unconfirmed, check your inbox or resend verification below.')
      } else {
        setMessage('Account created. Check your email to confirm before signing in.')
      }
      setPendingVerificationEmail(email.trim())
      setMode('login')
      setSignupStep(0)
      setPassword('')
      setConfirmPassword('')
    } catch (submitError) {
      setError(submitError.message || 'Unable to complete authentication request.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResendVerification() {
    const targetEmail = String(pendingVerificationEmail || email || '').trim()
    if (!targetEmail) {
      setError('Enter your email address first so we can resend verification.')
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_KEY in .env.')
      return
    }

    try {
      setResendLoading(true)
      setError('')
      const emailRedirectTo = resolveEmailVerificationRedirectTo(
        resolvePendingInvitePath(location) ||
          resolveSignupContinuationPath({ redirectTo, currentIntent }),
      )
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: targetEmail,
        options: {
          emailRedirectTo,
        },
      })
      if (resendError) {
        throw resendError
      }
      setPendingVerificationEmail(targetEmail)
      setMessage('Verification email resent. Check inbox/spam and allow a few minutes for delivery.')
    } catch (resendError) {
      if (isAuthRateLimitError(resendError)) {
        setError('Supabase Auth is still rejecting verification emails because the project email limit is reached. Raise the Supabase Auth email limit, then retry.')
        return
      }
      setError(resendError?.message || 'Unable to resend verification email right now.')
    } finally {
      setResendLoading(false)
    }
  }

  function handleDevBypass(role) {
    setStoredDevAuthRole(role)
    onDevBypass?.(role)
    clearPostLoginRedirect()
    navigate('/dashboard', { replace: true })
  }

  const securityLogoutMessage = new URLSearchParams(location.search).get('security') === '1'
  const orderedBusinessTypeOptions = getOrderedBusinessTypeOptions()
  const showingWorkspaceBuild = mode === 'signup' && signupStep === 2 && loading && !inviteDrivenSignup

  return (
    <div className="auth-page">
      <main className="auth-shell">
        <section className="auth-hero">
          <div className="auth-hero-glow" aria-hidden="true" />
          <div className="auth-network-pattern" aria-hidden="true" />
          <div className="auth-hero-orbit" aria-hidden="true" />
          <div className="auth-hero-top">
            <p className="auth-brand">Arch9</p>
          </div>
          <h1>The Property Industry,<br /> <span>Connected.</span></h1>
          <p>Real-time infrastructure powering every transaction, every professional, every day.</p>

          <div className="auth-market-metrics" aria-label="Live market metrics">
            {MARKET_METRICS.map((metric) => {
              const MetricIcon = metric.icon
              const TrendIcon = metric.trend === 'down' ? TrendingDown : TrendingUp
              return (
              <article key={metric.label}>
                <span className="auth-metric-icon"><MetricIcon size={18} /></span>
                <span className="auth-metric-label">{metric.label}</span>
                <strong>{metric.value}</strong>
                <em className={metric.trend === 'down' ? 'down' : ''}>
                  <TrendIcon size={13} />
                  {metric.delta}
                </em>
              </article>
              )
            })}
          </div>

          <div className="auth-hero-trust">
            <ShieldCheck size={22} />
            <span>Trusted by 18,000+ property professionals across South Africa</span>
          </div>
        </section>

        <section className={`auth-card ${inviteDrivenSignup ? 'invite-auth-card' : ''}`}>
          {mode === 'login' && securityLogoutMessage ? (
            <p className="auth-feedback success">You were signed out for security. Please log in again.</p>
          ) : null}

          <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => {
                setMode('login')
                setError('')
                setMessage('')
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === 'signup' ? 'active' : ''}
              onClick={() => {
                setMode('signup')
                setError('')
                setMessage('')
              }}
            >
              Sign Up
            </button>
          </div>

          <form id="auth-form" ref={authFormRef} className="auth-form" onSubmit={handleSubmit}>
            {mode === 'signup' ? (
              <>
                {!inviteDrivenSignup ? (
                  <div className="signup-stepper" aria-label="Signup progress">
                    {SIGNUP_STEPS.map((step, index) => {
                      const complete = signupStep > index
                      const active = signupStep === index
                      return (
                          <div key={step.label} className="signup-stepper-item-wrap">
                          <div className={`signup-stepper-item ${active ? 'active' : ''} ${complete ? 'complete' : ''}`}>
                            <span className="signup-stepper-node">
                              {complete ? <Check size={15} /> : active ? String(index + 1) : <Circle size={8} />}
                            </span>
                            <span className="signup-stepper-copy">
                              <em>{step.eyebrow}</em>
                              <strong>{step.label}</strong>
                            </span>
                          </div>
                          {index < SIGNUP_STEPS.length - 1 ? (
                            <span className={`signup-stepper-line ${signupStep > index ? 'complete' : ''}`} aria-hidden="true" />
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                {!inviteDrivenSignup && signupStep === 0 ? (
                  <section className="signup-choice-stack signup-step-panel">
                    <div className="auth-card-head compact">
                      <span className="auth-card-eyebrow">STEP 1 OF 3</span>
                      <h2>Welcome to Arch9 👋</h2>
                      <p>Let&apos;s build your workspace.</p>
                    </div>
                    <div className="signup-section-heading">
                      <strong>What best describes you?</strong>
                    </div>
                    <div className="signup-role-grid-wrap">
                      <div className="signup-role-grid">
                        {orderedBusinessTypeOptions.map((option, index) => {
                          const active = businessType === option.value
                          const RoleIcon = ROLE_ICONS[option.value] || Building2
                          const display = ROLE_DISPLAY_COPY[option.value] || option
                          const selectRole = () => {
                            setBusinessType(option.value)
                            setPosition('')
                            setError('')
                          }
                          return (
                            <button
                              key={option.value}
                              type="button"
                              className={`signup-role-card ${active ? 'active' : ''}`}
                              aria-pressed={active}
                              onClick={selectRole}
                              onKeyDown={(event) => handleKeyboardSelect(event, selectRole)}
                            >
                              {active ? <span className="signup-role-card-selected" aria-label="Selected"><Check size={14} /></span> : null}
                              <span className="signup-role-card-main">
                                <span className={`signup-role-card-icon role-tone-${index + 1}`}>
                                  <RoleIcon size={22} />
                                </span>
                                <span>
                                  <strong>{display.label}</strong>
                                  <span>{display.description}</span>
                                </span>
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="auth-submit"
                      disabled={!businessType}
                      onClick={() => {
                        setError('')
                        setSignupStep(1)
                      }}
                    >
                      Continue
                      <ArrowRight size={15} />
                    </button>
                  </section>
                ) : null}

                {!inviteDrivenSignup && signupStep === 1 ? (
                  <section className="signup-choice-stack signup-step-panel">
                    <div className="auth-card-head compact">
                      <span className="auth-card-eyebrow">STEP 2 OF 3</span>
                      <h2>{getBusinessSetupCopy(selectedBusinessTypeLabel)}</h2>
                      <p>Choose the role or access type that best matches how you will use Arch9.</p>
                    </div>
                    <div className="signup-position-grid">
                    {positionOptions.map((option) => {
                      const active = position === option.value
                      const selectPosition = () => {
                        setPosition(option.value)
                        setError('')
                      }
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`signup-position-card ${active ? 'active' : ''}`}
                          aria-pressed={active}
                          onClick={selectPosition}
                          onKeyDown={(event) => handleKeyboardSelect(event, selectPosition)}
                        >
                          <span className="signup-position-icon">
                            <POSITION_ICON size={18} />
                          </span>
                          <span>
                            <strong>{option.label}</strong>
                            <span>{option.description}</span>
                          </span>
                          {active ? <Check size={17} className="signup-position-check" /> : null}
                        </button>
                      )
                    })}
                    </div>
                    <div className="auth-action-row">
                      <button type="button" className="auth-secondary-cta" onClick={() => setSignupStep(0)}>
                        <ArrowLeft size={14} />
                        Back
                      </button>
                      <button
                        type="button"
                        className="auth-submit"
                        disabled={!position}
                        onClick={() => {
                          setError('')
                          setSignupStep(2)
                        }}
                      >
                        {selectedPositionLabel ? 'Continue to Account Creation' : 'Continue'}
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  </section>
                ) : null}
              </>
            ) : null}

            {mode === 'login' || signupStep === 2 ? (
              <>
                {mode === 'login' ? (
                  <div className="auth-card-head compact">
                    <span className="auth-card-eyebrow">SECURE ACCESS</span>
                    <h2>Sign in to Arch9</h2>
                    <p>Use your workspace credentials to open the property transaction platform.</p>
                  </div>
                ) : null}

                {showingWorkspaceBuild ? (
                  <section className="auth-workspace-build" aria-live="polite">
                    <div className="auth-workspace-orbit" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div>
                      <span className="auth-card-eyebrow">Workspace Creation</span>
                      <h3>Building your workspace</h3>
                      <p>Preparing your Arch9 account using the selected role contract.</p>
                    </div>
                    <div className="auth-build-checklist">
                      {WORKSPACE_CHECKLIST.map((item, index) => (
                        <span key={item} style={{ '--build-index': index }}>
                          <CheckCircle2 size={16} />
                          {item}
                        </span>
                      ))}
                    </div>
                  </section>
                ) : null}

                {mode === 'signup' && !showingWorkspaceBuild ? (
                  <>
                    <div className="auth-card-head compact">
                      <span className="auth-card-eyebrow">STEP 3 OF 3</span>
                      <h2>{inviteDrivenSignup ? 'Create your account' : 'Create your secure account'}</h2>
                      <p>
                        {inviteDrivenSignup
                          ? 'Complete these details and Arch9 will take you straight into the invited workspace.'
                          : selectedBusinessTypeLabel
                            ? `${selectedBusinessTypeLabel} workspace setup will continue after verification.`
                            : 'Workspace setup will continue after verification.'}
                      </p>
                    </div>
                    <div className="auth-field-grid">
                      <label>
                        Full Name
                        <input
                          type="text"
                          value={fullName}
                          onChange={(event) => setFullName(event.target.value)}
                          placeholder="Your full name"
                          autoComplete="name"
                          required
                        />
                      </label>

                      <label>
                        Phone
                        <input
                          type="tel"
                          value={phone}
                          onChange={(event) => setPhone(event.target.value)}
                          placeholder="Your phone number"
                          autoComplete="tel"
                          required
                        />
                      </label>
                    </div>
                  </>
                ) : null}

                {!showingWorkspaceBuild ? (
                  <>
                <div className={mode === 'signup' ? 'auth-field-grid' : 'auth-field-stack'}>
                  <label>
                    Email
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@company.com"
                      autoComplete="email"
                      readOnly={inviteDrivenSignup && Boolean(invitedEmail)}
                      aria-readonly={inviteDrivenSignup && Boolean(invitedEmail)}
                      required
                    />
                    {inviteDrivenSignup && invitedEmail ? (
                      <span className="mt-1 block text-xs font-medium text-[#60758d]">This invite is locked to {invitedEmail}.</span>
                    ) : null}
                  </label>

                  <label>
                    Password
                    <input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      required
                    />
                  </label>
                </div>
                  </>
                ) : null}

                {mode === 'signup' && !showingWorkspaceBuild ? (
                  <>
                    <div className="auth-field-grid single">
                      <label>
                        Confirm Password
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          placeholder="Re-enter password"
                          autoComplete="new-password"
                          required
                        />
                      </label>
                    </div>
                    {currentIntent && !inviteDrivenSignup ? (
                      <p className="rounded-[14px] border border-[#dbe8f3] bg-[#f8fbff] px-4 py-3 text-sm leading-6 text-[#48627d]">
                        {currentIntent.workspace_action === 'create_workspace'
                          ? 'After verification, Arch9 will continue with workspace setup for your business.'
                          : currentIntent.workspace_action === 'accept_invite'
                            ? 'After verification, Arch9 will return you to this invitation.'
                            : 'After verification, Arch9 will guide you to join or request access to the right workspace.'}
                      </p>
                    ) : null}
                    {!inviteDrivenSignup ? (
                      <div className="auth-action-row">
                        <button type="button" className="auth-secondary-cta" onClick={() => setSignupStep(1)}>
                          <ArrowLeft size={14} />
                          Back to role
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </>
            ) : null}

            {error ? <p className="auth-feedback error">{error}</p> : null}
            {message ? <p className="auth-feedback success">{message}</p> : null}
          </form>

          {mode === 'login' || signupStep === 2 ? (
            <button type="submit" form="auth-form" className="auth-submit" disabled={loading}>
              {loading ? 'Processing...' : mode === 'login' ? 'Sign in securely' : 'Create Account'}
              {!loading ? <ArrowRight size={15} /> : null}
            </button>
          ) : null}

          {mode === 'login' ? (
            <div className="auth-footer" style={{ borderTop: 0, paddingTop: 0 }}>
              <span>Didn&apos;t receive the verification email?</span>
              <button
                type="button"
                onClick={() => void handleResendVerification()}
                disabled={resendLoading}
              >
                {resendLoading ? 'Resending...' : 'Resend verification'}
              </button>
            </div>
          ) : null}

          {!inviteDrivenSignup ? (
            <div className="auth-footer">
            <span>
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
            </span>
            <button
              type="button"
              onClick={() => setMode((previous) => (previous === 'login' ? 'signup' : 'login'))}
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </div>
          ) : null}

          {!inviteDrivenSignup ? (
            <p className="auth-trust-line"><Shield size={14} /> Trusted by property professionals across South Africa</p>
          ) : null}

          {!isSupabaseConfigured ? (
            <p className="auth-demo-note">
              Supabase env vars are missing, so Arch9 authentication is disabled until the environment is configured.
            </p>
          ) : null}

          {isDevAuthBypassEnabled() && !inviteDrivenSignup ? (
            <div className="auth-dev-bypass mt-6 rounded-[24px] border border-[#d8e2f0] bg-[#f4f7fb] p-4">
              <div className="mb-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.24em] text-[#6f87a7]">Local Dev Bypass</h3>
                <p className="mt-2 text-sm leading-6 text-[#61738f]">
                  Enter the app without Supabase auth while you are still building. This is only available locally.
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {DEV_BYPASS_ROLES.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className="flex items-center justify-between rounded-[18px] border border-[#cfdced] bg-white px-4 py-3 text-left text-sm font-semibold text-[#142132] transition hover:border-[#365c7c] hover:bg-[#f7faff]"
                    onClick={() => handleDevBypass(role)}
                  >
                    <span>{APP_ROLE_LABELS[role] || role}</span>
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}

export default Auth
