import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { recordAuditEvent } from '../lib/activityAudit'
import { APP_ROLE_LABELS, normalizeAppRole } from '../lib/roles'
import { resolveSignupIntentRoute } from '../lib/signupIntent'
import { completeOnboarding } from '../services/onboarding/onboardingEngine'

const ROLE_COPY = {
  agent: {
    title: 'Agent Onboarding',
    description: 'Your profile is ready. Complete setup to enter your agent workspace.',
  },
  developer: {
    title: 'Developer Onboarding',
    description: 'Your profile is ready. Complete setup to enter your developer workspace.',
  },
  bond_originator: {
    title: 'Bond Originator Onboarding',
    description: 'Your profile is ready. Complete setup to enter your bond originator workspace.',
  },
}

function RoleModuleOnboarding({ expectedRole }) {
  const navigate = useNavigate()
  const { authState, refreshAuthState } = useAuthSession()
  const { profile, signupIntent, currentMembership, currentWorkspace, workspaceType, activeMemberships } = useWorkspace()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const normalizedRole = normalizeAppRole(expectedRole || profile?.role || '')
  const activeRole = normalizeAppRole(profile?.role || '')
  const copy = useMemo(() => ROLE_COPY[normalizedRole] || {
    title: `${APP_ROLE_LABELS[normalizedRole] || 'Workspace'} Onboarding`,
    description: 'Complete setup to continue.',
  }, [normalizedRole])

  async function handleComplete() {
    try {
      setSaving(true)
      setError('')
      console.debug('[ONBOARDING] role-module:complete:start', {
        role: normalizedRole,
        profileId: profile?.id || null,
      })
      if (normalizedRole !== 'client' && !currentMembership?.id && !activeMemberships.length) {
        throw new Error('Workspace setup is required before onboarding can be completed.')
      }
      await completeOnboarding({
        userId: authState.user?.id,
        user: authState.user,
        intent: signupIntent,
        appRole: normalizedRole,
        workspaceType,
        workspaceId: currentWorkspace?.id || currentMembership?.workspaceId,
        context: { source: 'role_module_onboarding' },
      })
      refreshAuthState?.()
      recordAuditEvent('onboarding_completed', {
        role: normalizedRole,
        profileId: profile?.id || null,
      })
      console.debug('[REDIRECT] role-module:complete', { target: '/dashboard', role: normalizedRole })
      navigate('/dashboard', { replace: true })
    } catch (completeError) {
      console.error('[ONBOARDING] role-module:complete:failed', completeError)
      setError(completeError?.message || 'Unable to complete onboarding right now.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (signupIntent) {
      const route = resolveSignupIntentRoute(signupIntent)
      if (route) {
        navigate(route, { replace: true })
      }
      return
    }
    if (!currentMembership?.id && !activeMemberships.length) {
      navigate('/setup', { replace: true })
      return
    }
    if (activeRole && activeRole !== normalizedRole) {
      console.debug('[REDIRECT] role-module:mismatch', { activeRole, normalizedRole, target: '/onboarding/profile' })
      navigate('/onboarding/profile', { replace: true })
    }
  }, [activeMemberships.length, activeRole, currentMembership?.id, navigate, normalizedRole, signupIntent])

  return (
    <div className="auth-page onboarding-page agency-onboarding-page">
      <main className="auth-shell onboarding-shell agency-onboarding-shell">
        <section className="auth-hero onboarding-hero agency-onboarding-hero">
          <p className="auth-brand">bridge.</p>
          <h1 style={{ color: '#ffffff' }}>{copy.title}</h1>
          <p>{copy.description}</p>
        </section>
        <section className="auth-card onboarding-card agency-onboarding-card">
          <div className="auth-card-head">
            <span className="auth-card-eyebrow">Setup Complete</span>
            <h2>Continue to Your Workspace</h2>
            <p>We’ve captured your profile and module selection.</p>
          </div>
          {error ? <p className="auth-form-error">{error}</p> : null}
          <div className="auth-actions">
            <button type="button" className="auth-primary-cta" onClick={handleComplete} disabled={saving}>
              {saving ? 'Finalizing…' : 'Open Dashboard'}
            </button>
            <button
              type="button"
              className="auth-secondary-cta"
              onClick={() => navigate('/onboarding/profile', { replace: true })}
              disabled={saving}
            >
              Back to Profile Setup
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default RoleModuleOnboarding
