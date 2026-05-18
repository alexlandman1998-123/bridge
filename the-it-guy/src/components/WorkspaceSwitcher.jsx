import { BriefcaseBusiness, Check, ChevronDown, Home } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

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
  return workspaceKey === 'commercial' ? '/commercial/dashboard' : getStoredResidentialRoute()
}

function WorkspaceSwitcher({ currentPath = '/', onSelectWorkspace }) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const activeWorkspace = currentPath.startsWith('/commercial') ? 'commercial' : 'residential'
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
    onSelectWorkspace?.(getWorkspacePath(nextWorkspace))
  }

  return (
    <div ref={menuRef} className="ui-workspace-switcher" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className="ui-workspace-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ui-workspace-switcher-icon">
          <SelectedIcon size={16} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="ui-workspace-switcher-kicker">Current workspace</span>
          <span className="ui-workspace-switcher-label">{selected.label}</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="ui-workspace-switcher-menu" role="menu" aria-label="Workspace switcher">
          {WORKSPACES.map((workspace) => {
            const Icon = workspace.icon
            const active = workspace.key === activeWorkspace
            const workspacePath = getWorkspacePath(workspace.key)
            return (
              <a
                key={workspace.key}
                href={workspacePath}
                role="menuitemradio"
                aria-checked={active}
                className={`ui-workspace-switcher-option ${active ? 'ui-workspace-switcher-option-active' : ''}`.trim()}
                onClick={(event) => {
                  if (active) event.preventDefault()
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
                {active ? <Check size={15} className="text-[#1a7f55]" /> : null}
              </a>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default WorkspaceSwitcher
