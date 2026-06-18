import { useEffect, useState } from 'react'
import { resolveCommercialAccessContext } from '../services/commercialApi'

export function useCommercialData(fetcher, dependencies = []) {
  const [state, setState] = useState({
    data: null,
    error: '',
    loading: true,
    organisationId: '',
  })

  useEffect(() => {
    let active = true

    async function load() {
      setState((previous) => ({ ...previous, loading: true, error: '' }))
      try {
        const context = await resolveCommercialAccessContext()
        const organisationId = context.organisationId || ''
        const data = organisationId && typeof fetcher === 'function' ? await fetcher(organisationId, context) : null
        if (!active) return
        setState({ data, error: '', loading: false, organisationId })
      } catch (error) {
        if (!active) return
        setState({
          data: null,
          error: error?.message || 'Commercial data could not be loaded.',
          loading: false,
          organisationId: '',
        })
      }
    }

    void load()

    return () => {
      active = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  return state
}
