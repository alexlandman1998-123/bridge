import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchPartnersSnapshot } from '../lib/partnersRepository.js'
import { listUserPreferredPartnerRoutingRules } from '../lib/transactionWorkspaceSecondaryApi.js'

export function useTransactionPartnerOptions({ enabled, organisationId, workspaceType, accessContext }) {
  const [state, setState] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const request = useMemo(() => ({ enabled, organisationId, workspaceType, accessContext, attempt }), [enabled, organisationId, workspaceType, accessContext, attempt])
  const retry = useCallback(() => setAttempt(value => value + 1), [])

  useEffect(() => {
    if (!enabled) return
    let active = true
    let timer
    const read = Promise.resolve().then(() => Promise.all([
      fetchPartnersSnapshot({ organisationId, workspaceType, accessContext }),
      listUserPreferredPartnerRoutingRules(),
    ]))
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Firm choices took too long to load. Please reload the firms.')), 30_000)
    })
    Promise.race([read, deadline]).then(([snapshot, routingRules]) => {
      if (active) setState({ request, snapshot, routingRules: Array.isArray(routingRules) ? routingRules : [], loading: false, error: '' })
    }).catch(error => {
      if (active) setState({ request, snapshot: null, routingRules: [], loading: false, error: error?.message || 'Firm choices could not be loaded. Please try again.' })
    }).finally(() => clearTimeout(timer))
    return () => { active = false; clearTimeout(timer) }
  }, [accessContext, enabled, organisationId, request, workspaceType])

  return { ...(enabled && state?.request === request ? state : { snapshot: null, routingRules: [], loading: Boolean(enabled), error: '' }), retry }
}
