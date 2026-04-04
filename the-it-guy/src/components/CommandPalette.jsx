import { Command, FileText, Home, Layers, Search, Workflow } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

function CommandPalette({ onNewTransaction, onNewDevelopment }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    function onKeyDown(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((previous) => !previous)
      }

      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    function onOpenRequested() {
      setOpen(true)
    }

    window.addEventListener('itg:open-command-palette', onOpenRequested)
    return () => window.removeEventListener('itg:open-command-palette', onOpenRequested)
  }, [])

  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  const commands = useMemo(() => {
    const items = [
      {
        id: 'dashboard',
        label: 'Go to Dashboard',
        icon: <Home size={14} />,
        run: () => navigate('/dashboard'),
      },
      {
        id: 'developments',
        label: 'Go to Developments',
        icon: <Layers size={14} />,
        run: () => navigate('/developments'),
      },
      {
        id: 'units',
        label: 'Go to Units',
        icon: <Workflow size={14} />,
        run: () => navigate('/units'),
      },
      {
        id: 'documents',
        label: 'Go to Documents',
        icon: <FileText size={14} />,
        run: () => navigate('/documents'),
      },
      {
        id: 'reports',
        label: 'Go to Reports',
        icon: <FileText size={14} />,
        run: () => navigate('/reports'),
      },
      {
        id: 'new-dev',
        label: 'Create New Development',
        icon: <Command size={14} />,
        run: () => onNewDevelopment?.(),
      },
      {
        id: 'new-tx',
        label: 'Create New Transaction',
        icon: <Command size={14} />,
        run: () => onNewTransaction?.(),
      },
    ]

    if (location.pathname.startsWith('/units/')) {
      items.unshift(
        {
          id: 'unit-upload-doc',
          label: 'Unit: Upload Required Document',
          icon: <Search size={14} />,
          run: () => window.dispatchEvent(new CustomEvent('itg:quick-action', { detail: { action: 'upload-required-doc' } })),
        },
        {
          id: 'unit-post-update',
          label: 'Unit: Post Update',
          icon: <Search size={14} />,
          run: () => window.dispatchEvent(new CustomEvent('itg:quick-action', { detail: { action: 'post-update' } })),
        },
        {
          id: 'unit-invite',
          label: 'Unit: Invite Next Party',
          icon: <Search size={14} />,
          run: () => window.dispatchEvent(new CustomEvent('itg:quick-action', { detail: { action: 'invite-next-party' } })),
        },
      )
    }

    return items
  }, [location.pathname, navigate, onNewDevelopment, onNewTransaction])

  const filtered = commands.filter((item) => item.label.toLowerCase().includes(query.trim().toLowerCase()))

  if (!open) {
    return null
  }

  return (
    <div
      className="command-palette-overlay no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setOpen(false)
        }
      }}
    >
      <section className="command-palette">
        <label className="command-palette-search">
          <Search size={14} />
          <input
            type="search"
            placeholder="Type a command..."
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <ul className="command-palette-list">
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  item.run()
                  setOpen(false)
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            </li>
          ))}
          {!filtered.length ? <li className="empty-text">No matching commands.</li> : null}
        </ul>
        <footer>Press Esc to close</footer>
      </section>
    </div>
  )
}

export default CommandPalette
