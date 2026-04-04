import { Building2, CheckCircle2, ChevronRight, Landmark, ShieldCheck, UserRound, WalletCards } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { APP_ROLE_LABELS, APP_ROLE_ONBOARDING_OPTIONS, DEFAULT_APP_ROLE, INTERNAL_APP_ROLES, normalizeAppRole } from '../lib/roles'

function resolveStep(pathname) {
  if (pathname.endsWith('/persona')) {
    return 'persona'
  }
  return 'profile'
}

const ROLE_CARD_META = {
  developer: {
    icon: Building2,
    eyebrow: 'Portfolio Control',
    highlights: ['Development pipeline', 'Unit oversight', 'Executive reporting'],
  },
  agent: {
    icon: UserRound,
    eyebrow: 'Sales Coordination',
    highlights: ['Buyer onboarding', 'Deal progression', 'Client communication'],
  },
  attorney: {
    icon: Landmark,
    eyebrow: 'Legal Workflow',
    highlights: ['Transfer stages', 'Document readiness', 'Matter tracking'],
  },
  bond_originator: {
    icon: WalletCards,
    eyebrow: 'Finance Execution',
    highlights: ['Application progress', 'Lender updates', 'Bond documents'],
  },
}

function Onboarding() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, profileLoading, saveProfileDraft, onboardingCompleted, role } = useWorkspace()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [selectedRole, setSelectedRole] = useState(DEFAULT_APP_ROLE)

  const currentStep = useMemo(() => resolveStep(location.pathname), [location.pathname])

  useEffect(() => {
    if (!profile) {
      return
    }

    setFirstName(profile.firstName || '')
    setLastName(profile.lastName || '')
    setCompanyName(profile.companyName || '')
    setPhoneNumber(profile.phoneNumber || '')
    setSelectedRole(normalizeAppRole(profile.role || DEFAULT_APP_ROLE))
  }, [profile])

  if (!profileLoading && onboardingCompleted && INTERNAL_APP_ROLES.includes(role)) {
    return <Navigate to="/dashboard" replace />
  }

  async function handleSaveProfile(event) {
    event.preventDefault()

    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required.')
      return
    }

    if (!companyName.trim()) {
      setError('Company name is required.')
      return
    }

    if (!phoneNumber.trim()) {
      setError('Phone number is required.')
      return
    }

    try {
      setSaving(true)
      setError('')
      await saveProfileDraft({
        firstName,
        lastName,
        companyName,
        phoneNumber,
        onboardingCompleted: false,
      })
      navigate('/onboarding/persona', { replace: true })
    } catch (saveError) {
      setError(saveError.message || 'Unable to save profile details.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCompleteOnboarding(event) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      await saveProfileDraft({
        firstName,
        lastName,
        companyName,
        phoneNumber,
        role: selectedRole,
        onboardingCompleted: true,
      })
      navigate('/dashboard', { replace: true })
    } catch (saveError) {
      setError(saveError.message || 'Unable to complete onboarding.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="auth-page onboarding-page">
      <main className="auth-shell onboarding-shell">
        <section className="auth-hero onboarding-hero">
          <p className="auth-brand">bridge.</p>
          <h1>Set up your workspace</h1>
          <p>Complete your profile and choose your operating persona.</p>

          <div className="auth-hero-points">
            <article>
              <ShieldCheck size={16} />
              <div>
                <strong>Role-aware access</strong>
                <span>Navigation and dashboard entry will match your persona.</span>
              </div>
            </article>
            <article>
              <CheckCircle2 size={16} />
              <div>
                <strong>One shared transaction engine</strong>
                <span>Your role controls what you can act on in each transaction lane.</span>
              </div>
            </article>
          </div>
        </section>

        <section className="auth-card onboarding-card">
          <div className="auth-card-head">
            <h2>{currentStep === 'profile' ? 'Profile Details' : 'Select Persona'}</h2>
            <p>
              {currentStep === 'profile'
                ? 'Step 1 of 2 • Capture your workspace profile.'
                : 'Step 2 of 2 • Choose your primary operating module.'}
            </p>
          </div>

          {currentStep === 'profile' ? (
            <form className="auth-form onboarding-form" onSubmit={handleSaveProfile}>
              <div className="onboarding-grid-two">
                <label>
                  First Name
                  <input
                    type="text"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    placeholder="Alex"
                    autoComplete="given-name"
                    required
                  />
                </label>
                <label>
                  Last Name
                  <input
                    type="text"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    placeholder="Landman"
                    autoComplete="family-name"
                    required
                  />
                </label>
              </div>

              <label>
                Company Name
                <input
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Samlin Construction"
                  autoComplete="organization"
                  required
                />
              </label>

              <label>
                Phone Number
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  placeholder="+27 82 000 0000"
                  autoComplete="tel"
                  required
                />
              </label>

              {error ? <p className="auth-feedback error">{error}</p> : null}

              <button type="submit" className="auth-submit" disabled={saving}>
                {saving ? 'Saving…' : 'Continue to Persona Selection'}
                {!saving ? <ChevronRight size={15} /> : null}
              </button>
            </form>
          ) : (
            <form className="auth-form onboarding-form" onSubmit={handleCompleteOnboarding}>
              <div className="onboarding-role-grid">
                {APP_ROLE_ONBOARDING_OPTIONS.map((item) => (
                  (() => {
                    const roleMeta = ROLE_CARD_META[item.value] || {}
                    const Icon = roleMeta.icon || ShieldCheck
                    const isActive = selectedRole === item.value

                    return (
                      <button
                        key={item.value}
                        type="button"
                        className={`onboarding-role-card ${isActive ? 'active' : ''}`}
                        onClick={() => setSelectedRole(item.value)}
                      >
                        <div className="onboarding-role-card-topline">
                          <span className="onboarding-role-card-eyebrow">{roleMeta.eyebrow || 'Workspace Module'}</span>
                          {isActive ? <span className="onboarding-role-card-selected">Selected</span> : null}
                        </div>

                        <div className="onboarding-role-card-head">
                          <span className="onboarding-role-card-icon">
                            <Icon size={18} />
                          </span>
                          <div>
                            <strong>{item.label}</strong>
                            <span>{item.description}</span>
                          </div>
                        </div>

                        <div className="onboarding-role-card-highlights">
                          {(roleMeta.highlights || []).map((highlight) => (
                            <span key={highlight}>{highlight}</span>
                          ))}
                        </div>
                      </button>
                    )
                  })()
                ))}
              </div>

              <p className="auth-feedback success onboarding-selected-role">
                Selected module: <strong>{APP_ROLE_LABELS[selectedRole] || selectedRole}</strong>
              </p>

              {error ? <p className="auth-feedback error">{error}</p> : null}

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => navigate('/onboarding/profile', { replace: true })}
                  disabled={saving}
                >
                  Back
                </button>
                <button type="submit" className="auth-submit" disabled={saving}>
                  {saving ? 'Completing…' : 'Complete Onboarding'}
                  {!saving ? <CheckCircle2 size={15} /> : null}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}

export default Onboarding
