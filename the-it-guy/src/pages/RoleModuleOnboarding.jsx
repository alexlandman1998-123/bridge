import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { APP_ROLE_LABELS, normalizeAppRole } from '../lib/roles'

const ROLE_COPY = {
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
  const { profile, saveProfileDraft } = useWorkspace()
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
      await saveProfileDraft({
        role: normalizedRole,
        onboardingCompleted: true,
      })
      navigate('/dashboard', { replace: true })
    } catch (completeError) {
      setError(completeError?.message || 'Unable to complete onboarding right now.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (activeRole && activeRole !== normalizedRole) {
      navigate('/onboarding/profile', { replace: true })
    }
  }, [activeRole, navigate, normalizedRole])

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
