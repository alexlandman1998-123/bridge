import { ChevronDown, Plus } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'

const QuickCreateDropdown = lazy(() => import('./QuickCreateDropdown'))

function QuickCreateButton({ loading = false, onClick }) {
  return (
    <button
      type="button"
      className="ui-shell-create-button"
      onClick={onClick}
      disabled={loading}
      aria-busy={loading || undefined}
      data-testid="quick-create-button"
    >
      <Plus size={16} />
      <span className="hidden sm:inline">{loading ? 'Loading' : 'Create'}</span>
      <ChevronDown size={14} />
    </button>
  )
}

/**
 * Keeps the full create workflow out of the initial shell bundle. It is only
 * requested after a user intentionally opens the Create menu.
 */
function LazyQuickCreateDropdown({ className = '' }) {
  const [requested, setRequested] = useState(false)

  if (!requested) {
    return (
      <div className={`relative shrink-0 ${className}`.trim()}>
        <QuickCreateButton onClick={() => setRequested(true)} />
      </div>
    )
  }

  return (
    <Suspense fallback={<div className={`relative shrink-0 ${className}`.trim()}><QuickCreateButton loading /></div>}>
      <QuickCreateDropdown className={className} initialOpen />
    </Suspense>
  )
}

export default LazyQuickCreateDropdown
