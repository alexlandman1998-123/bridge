import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthSession } from '../context/AuthSessionContext'
import { useWorkspace } from '../context/WorkspaceContext'
import { recordAuditEvent } from '../lib/activityAudit'
import { APP_ROLE_LABELS, normalizeAppRole } from '../lib/appRoleMetadata'
import { updateBondOrganisationStructureSettings } from '../lib/settingsApi'
import { resolveSignupIntentRoute } from '../lib/signupIntent'
import {
  BOND_ORGANISATION_STRUCTURE_OPTIONS,
  BOND_ORGANISATION_STRUCTURE_TYPES,
} from '../services/bondOrganisationService'
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
  const [organisationStructureType, setOrganisationStructureType] = useState(BOND_ORGANISATION_STRUCTURE_TYPES.independent)
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
      if (normalizedRole === 'bond_originator') {
        await updateBondOrganisationStructureSettings({
          organisation_structure_type: organisationStructureType,
        })
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
          <p className="auth-brand">Arch9</p>
          <h1 style={{ color: '#ffffff' }}>{copy.title}</h1>
          <p>{copy.description}</p>
        </section>
        <section className="auth-card onboarding-card agency-onboarding-card">
          <div className="auth-card-head">
            <span className="auth-card-eyebrow">Setup Complete</span>
            <h2>Continue to Your Workspace</h2>
            <p>We’ve captured your profile and module selection.</p>
          </div>
          {normalizedRole === 'bond_originator' ? (
            <fieldset className="mt-5 border-0 p-0">
              <legend className="text-sm font-semibold text-[#17324d]">What best describes your organisation?</legend>
              <div className="mt-3 grid gap-2">
                {BOND_ORGANISATION_STRUCTURE_OPTIONS.map((option) => {
                  const selected = organisationStructureType === option.value
                  return (
                    <label
                      key={option.value}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-[16px] border px-4 py-3 text-sm transition ${
                        selected
                          ? 'border-[#102448] bg-[#f5f8fc] text-[#102448]'
                          : 'border-[#dbe5f0] bg-white text-[#536982] hover:border-[#c7d6e7]'
                      }`.trim()}
                    >
                      <span className="font-semibold">{option.label}</span>
                      <input
                        type="radio"
                        name="organisation_structure_type"
                        value={option.value}
                        checked={selected}
                        onChange={(event) => setOrganisationStructureType(event.target.value)}
                        disabled={saving}
                        className="h-4 w-4 accent-[#102448]"
                      />
                    </label>
                  )
                })}
              </div>
            </fieldset>
          ) : null}
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
