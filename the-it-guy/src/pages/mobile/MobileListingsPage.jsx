import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useOptionalOrganisation } from '../../context/OrganisationContext'
import { getMobileListingsAsync } from '../../services/mobileListingsService.js'
import MobileListingsView from './MobileListingsView.jsx'

export default function MobileListingsPage() {
  const location = useLocation()
  const workspace = useWorkspace()
  const organisationContext = useOptionalOrganisation()
  const organisation = organisationContext?.organisation || null
  const [result, setResult] = useState(null)
  const [retry, setRetry] = useState(0)
  const loadingOrganisation = Boolean(organisationContext?.loading)
  useEffect(() => {
    if (loadingOrganisation) return undefined
    let active = true
    getMobileListingsAsync({ workspace, organisation })
      .then((rows) => { if (active) setResult({ workspace, organisation, rows }) })
      .catch((error) => { if (active) setResult({ workspace, organisation, error: error.message || 'Unable to load listings.' }) })
    const refresh = () => setRetry((value) => value + 1)
    window.addEventListener('itg:listings-updated', refresh)
    return () => { active = false; window.removeEventListener('itg:listings-updated', refresh) }
  }, [workspace, organisation, loadingOrganisation, retry])
  const ready = !loadingOrganisation && result?.workspace === workspace && result?.organisation === organisation
  return <MobileListingsView message={location.state?.message} rows={ready && !result.error ? result.rows : []} loading={!ready} error={ready ? result.error : null} onRetry={() => { setResult(null); setRetry((value) => value + 1) }} />
}
