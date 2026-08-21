import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useOrganisation } from '../../context/OrganisationContext'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings } from '../../lib/organisationAccess'
import { settingsPageClass, SettingsEmptyState } from './settingsUi'
import { buildVisibleSettingsGroups } from './settingsNavigation'

const STATUS_TONE_CLASS = {
  success: 'settings-dashboard-chip-success',
  warning: 'settings-dashboard-chip-warning',
  neutral: 'settings-dashboard-chip-neutral',
}

function getStatusForItem(item, { branding, currentWorkspace, profile }) {
  if (item.label === 'Profile') {
    return profile?.avatarUrl || profile?.avatar_url
      ? { tone: 'success', label: 'Profile complete' }
      : { tone: 'warning', label: 'Missing profile image' }
  }

  if (item.label === 'Organisation' && currentWorkspace?.name) {
    return { tone: 'neutral', label: currentWorkspace.name }
  }

  if (item.label === 'Branding') {
    return branding?.hasCustomLogo
      ? { tone: 'success', label: 'Logo configured' }
      : { tone: 'warning', label: 'Logo not configured' }
  }

  if (item.label === 'Syndication') {
    return { tone: 'neutral', label: 'Property24 + Private Property' }
  }

  return item.status || null
}

export default function SettingsLanding() {
  const { branding } = useOrganisation()
  const { can, role, currentWorkspace, organisationMembershipRole, workspaceRole, workspaceType, profile } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const membershipRole = organisationMembershipRole || workspaceRole || 'viewer'
  const canManage = canManageOrganisationSettings({ appRole: role, membershipRole, workspaceType: resolvedWorkspaceType })
  const groups = buildVisibleSettingsGroups({ role, canManage, can })

  return (
    <div className={`${settingsPageClass} settings-dashboard-page`}>
      <header className="settings-dashboard-header">
        <h1>Settings</h1>
      </header>

      {groups.length ? (
        <div className="settings-dashboard-groups">
          {groups.map((group) => (
            <section key={group.label} aria-labelledby={`settings-group-${group.label.toLowerCase()}`}>
              <p id={`settings-group-${group.label.toLowerCase()}`} className="settings-dashboard-group-label">{group.label}</p>
              <div className="settings-dashboard-card-grid">
                {group.items.map((item) => {
                  const Icon = item.icon
                  const status = getStatusForItem(item, { branding, currentWorkspace, profile })
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className="settings-dashboard-card"
                    >
                      <span className="settings-dashboard-icon">
                        <Icon size={18} strokeWidth={1.9} />
                      </span>
                      <span className="settings-dashboard-card-body">
                        <span className="settings-dashboard-card-title">{item.label}</span>
                        <span className="settings-dashboard-card-description">{item.description}</span>
                        {status ? (
                          <span className={`settings-dashboard-chip ${STATUS_TONE_CLASS[status.tone] || STATUS_TONE_CLASS.neutral}`}>
                            {status.label}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight size={18} className="settings-dashboard-chevron" />
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <SettingsEmptyState title="No settings available" description="Your current role does not have access to configurable settings in this workspace." />
      )}
    </div>
  )
}
