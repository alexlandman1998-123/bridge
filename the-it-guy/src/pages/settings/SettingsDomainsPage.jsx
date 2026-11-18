import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthSession } from '../../context/AuthSessionContext'
import { getEmailSendingSetup } from '../../services/emailCampaignService'
import { EmailSendingSettings } from '../../components/marketing/EmailCampaignSettings'
import '../../pages/WhatsAppCampaigns.css'
import '../../pages/EmailCampaigns.css'

const EMPTY_STATE = { domains: [], identities: [], canManage: false, scope: '', loading: true, error: '' }

function getOrganisationId(authState) {
  return String(authState?.currentWorkspace?.id || authState?.currentMembership?.workspaceId || authState?.currentMembership?.workspace_id || '').trim()
}

export default function SettingsDomainsPage() {
  const { authState } = useAuthSession()
  const organisationId = getOrganisationId(authState)
  const userId = authState?.user?.id || ''
  const scope = `${organisationId}:${userId}:${JSON.stringify(authState?.currentMembership || {})}`
  const generation = useRef(0)
  const cancelRefresh = useCallback(() => { generation.current += 1 }, [])
  const [state, setState] = useState({ ...EMPTY_STATE, scope })
  const refresh = useCallback(async () => {
    const request = ++generation.current
    if (!organisationId) {
      setState({ ...EMPTY_STATE, scope, loading: false, error: 'Choose an organisation workspace to configure email domains.' })
      return
    }
    setState((current) => ({ ...(current.scope === scope ? current : EMPTY_STATE), scope, loading: true, error: '' }))
    try {
      const workspace = await getEmailSendingSetup(organisationId)
      if (request === generation.current) setState({ ...workspace, scope, loading: false, error: '' })
    } catch (cause) {
      if (request === generation.current) setState({ ...EMPTY_STATE, scope, loading: false, error: cause.message || 'Email domain settings could not be loaded.' })
    }
  }, [organisationId, scope])
  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => { window.clearTimeout(timer); cancelRefresh() }
  }, [refresh, cancelRefresh])
  const workspace = state.scope === scope ? state : EMPTY_STATE

  return (
    <div className="wa-page email-page settings-domains-page">
      <header className="settings-domains-heading">
        <div>
          <h1>Domains</h1>
          <p>Set up and verify the sending domain used for bulk email campaigns.</p>
        </div>
      </header>
      {workspace.loading && !workspace.canManage ? <p role="status">Loading domain setup…</p> : workspace.error ? <div role="alert" className="email-settings-workspace"><p>{workspace.error}</p><button type="button" className="wa-secondary-button" onClick={() => void refresh()}>Try again</button></div> : !workspace.canManage ? <section className="email-settings-workspace"><h2>Principal access required</h2><p>Ask an organisation principal to connect domains and manage campaign senders.</p></section> : <EmailSendingSettings
        key={organisationId}
        organisationId={organisationId}
        userId={userId}
        domains={workspace.domains}
        identities={workspace.identities}
        loading={workspace.loading}
        error={workspace.error}
        onRefresh={refresh}
      />}
    </div>
  )
}
