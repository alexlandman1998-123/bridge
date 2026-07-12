import { BriefcaseBusiness, Check, ChevronDown, Home } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from '../context/WorkspaceContext'
import { hasCommercialAccessMarker } from '../lib/commercialAccess'

const WORKSPACE_STORAGE_KEY = 'bridge:active-workspace'
const RESIDENTIAL_ROUTE_STORAGE_KEY = 'bridge:last-residential-route'

const WORKSPACES = [
  {
    key: 'residential',
    label: 'Residential',
    description: 'Property transactions',
    icon: Home,
  },
  {
    key: 'commercial',
    label: 'Commercial',
    description: 'Leasing and deals',
    icon: BriefcaseBusiness,
  },
]

let fallbackResidentialRoute = '/dashboard'

function readStorage(key) {
  if (typeof window === 'undefined' || !window.localStorage) return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Embedded browser contexts can disable storage; keep routing functional anyway.
  }
}

function getStoredResidentialRoute() {
  if (typeof window === 'undefined') return '/dashboard'
  const stored = String(readStorage(RESIDENTIAL_ROUTE_STORAGE_KEY) || fallbackResidentialRoute || '').trim()
  if (!stored || stored.startsWith('/commercial')) return '/dashboard'
  return stored
}

function getWorkspacePath(workspaceKey) {
  return workspaceKey === 'commercial' ? '/commercial' : getStoredResidentialRoute()
}

function membershipHasCommercialAccess(membership = null) {
  if (!membership || typeof membership !== 'object') return false
  return (
    hasCommercialAccessMarker(membership) ||
    hasCommercialAccessMarker(membership.raw) ||
    hasCommercialAccessMarker(membership.moduleMetadata) ||
    hasCommercialAccessMarker(membership.module_metadata) ||
    hasCommercialAccessMarker(membership.metadata)
  )
}

function WorkspaceSwitcher({ currentPath = '/', onSelectWorkspace, variant = 'default' }) {
  const { activeMemberships = [], currentMembership = null } = useWorkspace()
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const activeWorkspace = currentPath.startsWith('/commercial') ? 'commercial' : 'residential'
  const hasCommercialWorkspace = useMemo(
    () =>
      activeWorkspace === 'commercial' ||
      membershipHasCommercialAccess(currentMembership) ||
      activeMemberships.some((membership) => membershipHasCommercialAccess(membership)),
    [activeMemberships, activeWorkspace, currentMembership],
  )
  const selected = useMemo(
    () => WORKSPACES.find((workspace) => workspace.key === activeWorkspace) || WORKSPACES[0],
    [activeWorkspace],
  )
  const SelectedIcon = selected.icon

  useEffect(() => {
    writeStorage(WORKSPACE_STORAGE_KEY, activeWorkspace)
    if (activeWorkspace === 'residential' && currentPath && !currentPath.startsWith('/commercial')) {
      fallbackResidentialRoute = currentPath
      writeStorage(RESIDENTIAL_ROUTE_STORAGE_KEY, currentPath)
    }
  }, [activeWorkspace, currentPath])

  useEffect(() => {
    if (hasCommercialWorkspace) return
    if (readStorage(WORKSPACE_STORAGE_KEY) === 'commercial') {
      writeStorage(WORKSPACE_STORAGE_KEY, 'residential')
    }
  }, [hasCommercialWorkspace])

  useEffect(() => {
    if (!open) return undefined

    function handleDocumentClick(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false)
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  function handleSelect(nextWorkspace) {
    setOpen(false)
    if (nextWorkspace === activeWorkspace) return
    writeStorage(WORKSPACE_STORAGE_KEY, nextWorkspace)
    onSelectWorkspace?.(getWorkspacePath(nextWorkspace))
  }

  if (!hasCommercialWorkspace) {
    return null
  }

  return (
    <div
      ref={menuRef}
      className={`ui-workspace-switcher ${variant === 'compact' ? 'ui-workspace-switcher-compact' : ''}`.trim()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="ui-workspace-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ui-workspace-switcher-icon ui-workspace-switcher-icon-current">
          <SelectedIcon size={20} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="ui-workspace-switcher-label">{selected.label}</span>
          <span className="ui-workspace-switcher-option-description ui-workspace-switcher-current-description">{selected.description}</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="ui-workspace-switcher-menu" role="menu" aria-label="Workspace switcher">
          <p className="ui-workspace-switcher-menu-heading">Choose workspace</p>
          {WORKSPACES.map((workspace) => {
            const Icon = workspace.icon
            const active = workspace.key === activeWorkspace
            return (
              <button
                key={workspace.key}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={`ui-workspace-switcher-option ${active ? 'ui-workspace-switcher-option-active' : ''}`.trim()}
                onClick={() => {
                  handleSelect(workspace.key)
                }}
              >
                <span className="ui-workspace-switcher-option-icon">
                  <Icon size={15} />
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="ui-workspace-switcher-option-label">{workspace.label}</span>
                  <span className="ui-workspace-switcher-option-description">{workspace.description}</span>
                </span>
                {active ? (
                  <span className="ui-workspace-switcher-option-check" aria-hidden="true">
                    <Check size={15} />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default WorkspaceSwitcher
