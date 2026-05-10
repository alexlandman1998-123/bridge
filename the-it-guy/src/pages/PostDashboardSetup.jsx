import { Link } from 'react-router-dom'
import { useWorkspace } from '../context/WorkspaceContext'
import { APP_ROLE_LABELS } from '../lib/roles'
import { deriveOnboardingSetupState } from '../lib/onboardingRouting'

function resolveSetupActions(role = '') {
  if (role === 'developer') {
    return [
      { label: 'Create Organisation Profile', href: '/settings/organisation' },
      { label: 'Create First Development', href: '/listings/developments' },
      { label: 'Invite Team Members', href: '/settings/users' },
    ]
  }

  if (role === 'agent') {
    return [
      { label: 'Join or Create Agency Workspace', href: '/settings/organisation' },
      { label: 'Add First Listing', href: '/listings/agent' },
      { label: 'Invite Team Members', href: '/agents/directory' },
    ]
  }

  if (role === 'attorney') {
    return [
      { label: 'Create or Join Attorney Firm', href: '/attorney/onboarding' },
      { label: 'Configure Firm Settings', href: '/attorney/firm-settings' },
      { label: 'Open Attorney Dashboard', href: '/attorney/dashboard' },
    ]
  }

  if (role === 'bond_originator') {
    return [
      { label: 'Create Team Workspace', href: '/settings/organisation' },
      { label: 'Set Workflow Preferences', href: '/settings/workflows' },
      { label: 'Open Dashboard', href: '/dashboard' },
    ]
  }

  return [{ label: 'Open Dashboard', href: '/dashboard' }]
}

export default function PostDashboardSetup() {
  const { profile, baseRole } = useWorkspace()
  const setupState = deriveOnboardingSetupState({ profile, baseRole })
  const actions = resolveSetupActions(setupState.appRole)

  return (
    <section className="page">
      <article className="panel card-tier-standard" style={{ display: 'grid', gap: '0.9rem' }}>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#60758d]">Post-Dashboard Setup</p>
        <h1 className="text-[1.35rem] font-semibold tracking-[-0.02em] text-[#142132]">
          Continue {APP_ROLE_LABELS[setupState.appRole] || 'Workspace'} Setup
        </h1>
        <p className="text-sm leading-6 text-[#60758d]">
          Signup onboarding is complete. Finish organisation and module setup here so workflow access stays isolated
          from authentication and profile creation.
        </p>
        <div className="rounded-[14px] border border-[#dde4ee] bg-[#f8fbff] px-4 py-3 text-sm text-[#1f3d59]">
          <p>
            <strong>Profile status:</strong> {setupState.profileStatus}
          </p>
          <p>
            <strong>Onboarding status:</strong> {setupState.onboardingStatus}
          </p>
          <p>
            <strong>Organisation setup status:</strong> {setupState.organisationSetupStatus}
          </p>
          <p>
            <strong>Module setup status:</strong> {setupState.moduleSetupStatus}
          </p>
        </div>
        <div className="grid gap-2">
          {actions.map((action) => (
            <Link key={action.href} to={action.href} className="header-secondary-cta">
              {action.label}
            </Link>
          ))}
        </div>
      </article>
    </section>
  )
}
