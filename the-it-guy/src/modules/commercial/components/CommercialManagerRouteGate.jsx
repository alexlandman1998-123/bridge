import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { resolveCommercialAccessContext } from '../services/commercialApi'
import { canManageCommercialBrokerage } from '../utils/resolveCommercialRole.js'

function CommercialManagerRouteGate({ children }) {
  const [state, setState] = useState({ loading: true, allowed: false, error: '' })

  useEffect(() => {
    let cancelled = false

    async function loadAccess() {
      try {
        const scope = await resolveCommercialAccessContext()
        if (!cancelled) {
          setState({
            loading: false,
            allowed: scope?.canManageBrokerage === true || canManageCommercialBrokerage(scope),
            error: '',
          })
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            allowed: false,
            error: error?.message || 'Commercial access could not be verified.',
          })
        }
      }
    }

    void loadAccess()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.loading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
        Checking commercial permissions...
      </section>
    )
  }

  if (!state.allowed) {
    return <Navigate to="/commercial" replace state={{ commercialAccessError: state.error || 'Broker accounts do not have agency management access.' }} />
  }

  return children
}

export default CommercialManagerRouteGate
