import { useEffect, useState } from 'react'
import { useMarketingNavigate as useNavigate } from './MarketingNavigation.jsx'
import { useAuthSession } from '../../context/AuthSessionContext'
import { loadChannelTemplates } from '../../services/marketingChannelTemplateService'
import ChannelTemplateLibrary from './ChannelTemplateLibrary'
import '../../pages/MarketingCampaigns.css'

// Channel workspaces and Studio share storage, permissions and the same editor.
export default function ChannelWorkspaceTemplates({ channel, organisationId }) {
  const navigate = useNavigate()
  const { authState } = useAuthSession()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ key: '', data: [], loading: true, error: '' })
  const userId = authState?.user?.id || ''
  const membership = authState?.currentMembership
  const role = membership?.workspaceRole || membership?.workspace_role || membership?.role
  const canShare = ['owner', 'principal', 'admin', 'administrator', 'manager'].includes(role)
  const requestKey = JSON.stringify([organisationId, userId, attempt])
  useEffect(() => {
    let active = true
    if (!organisationId) return () => { active = false }
    loadChannelTemplates(organisationId).then((data) => {
      if (active) setState({ key: requestKey, data, loading: false, error: '' })
    }).catch((error) => {
      if (active) setState({ key: requestKey, data: [], loading: false, error: error.message })
    })
    return () => { active = false }
  }, [organisationId, requestKey])
  const open = (fields) => navigate(`/marketing?${new URLSearchParams({ section: 'campaigns', page: 'studio', collection: 'channels', format: channel, ...fields })}`)
  if (!organisationId) return <p className="email-settings-empty">Choose an organisation to view templates.</p>
  const current = state.key === requestKey ? state : { data: [], loading: true, error: '' }
  return <div className="mc-workspace channel-workspace-templates">
    {channel === 'whatsapp' && <p className="ct-workspace-note">Reusable draft wording from Studio. Choose a Meta-approved template and sender before sending a WhatsApp campaign.</p>}
    <ChannelTemplateLibrary key={`${organisationId}:${userId}:${channel}`} fixedChannel={channel} templates={current.data} loading={current.loading} error={current.error} userId={userId} canShare={canShare}
      onRetry={() => setAttempt((value) => value + 1)}
      onCreate={() => open({ view: 'channel-template-create' })}
      onEdit={(id) => open({ view: 'channel-template-edit', id })}
      onDuplicate={(template) => open({ view: 'channel-template-create', source: template.id })}
      onStart={(template) => open({ view: 'channel-template-create', starter: template.id })}
      onUse={(template) => open({ view: 'create', channelTemplate: template.id })}
    />
  </div>
}
