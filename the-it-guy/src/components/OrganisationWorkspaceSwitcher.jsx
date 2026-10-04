import { Building2, Check, ChevronDown } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import useDismissableMenu from '../hooks/useDismissableMenu'

function getOrganisationWorkspaceId(membership = null) {
  return String(
    membership?.workspaceId ||
      membership?.workspace_id ||
      membership?.workspace?.id ||
      membership?.raw?.organisation_id ||
      membership?.raw?.organization_id ||
      '',
  ).trim()
}

function getOrganisationWorkspaceLabel(membership = null) {
  return String(
    membership?.workspace?.name ||
      membership?.workspaceName ||
      membership?.workspace_name ||
      membership?.organisationName ||
      membership?.organisation_name ||
      membership?.raw?.organisation_name ||
      'Organisation',
  ).trim()
}

export default function OrganisationWorkspaceSwitcher({ currentWorkspace = null, memberships = [], onChange }) {
  const [open, setOpen] = useState(false)
  const switcherRef = useRef(null)
  const workspaces = useMemo(() => {
    const uniqueWorkspaces = new Map()
    memberships.forEach((membership) => {
      const id = getOrganisationWorkspaceId(membership)
      if (!id || uniqueWorkspaces.has(id)) return
      uniqueWorkspaces.set(id, { id, label: getOrganisationWorkspaceLabel(membership) })
    })
    return [...uniqueWorkspaces.values()].sort((left, right) => left.label.localeCompare(right.label))
  }, [memberships])
  const currentId = String(currentWorkspace?.id || '').trim()
  const currentLabel =
    workspaces.find((workspace) => workspace.id === currentId)?.label ||
    String(currentWorkspace?.name || 'Organisation').trim()

  useDismissableMenu({ open, refs: [switcherRef], onDismiss: () => setOpen(false) })

  if (workspaces.length < 2) return null

  return (
    <div ref={switcherRef} className="ui-organisation-workspace-switcher" aria-label="Organisation switcher">
      <p className="ui-organisation-workspace-heading">Organisation</p>
      <button
        type="button"
        className={`ui-organisation-workspace-trigger ${open ? 'ui-organisation-workspace-trigger-open' : ''}`.trim()}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="ui-organisation-workspace-icon" aria-hidden="true"><Building2 size={16} /></span>
        <span className="ui-organisation-workspace-current">{currentLabel}</span>
        <ChevronDown size={15} className={`ui-organisation-workspace-chevron ${open ? 'ui-organisation-workspace-chevron-open' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="ui-organisation-workspace-menu" role="menu" aria-label="Switch organisation">
          <p className="ui-organisation-workspace-menu-heading">Switch organisation</p>
          {workspaces.map((workspace) => {
            const active = workspace.id === currentId
            return (
              <button
                key={workspace.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`ui-organisation-workspace-option ${active ? 'ui-organisation-workspace-option-active' : ''}`.trim()}
                onClick={() => {
                  setOpen(false)
                  if (!active) onChange?.(workspace.id)
                }}
              >
                <Building2 size={15} aria-hidden="true" />
                <span className="ui-organisation-workspace-option-label">{workspace.label}</span>
                {active ? <Check size={15} className="ui-organisation-workspace-check" aria-hidden="true" /> : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

