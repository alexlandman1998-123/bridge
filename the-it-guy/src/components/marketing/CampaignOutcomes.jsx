import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, RefreshCw } from 'lucide-react'
import { loadCampaignEnquiries } from '../../services/campaignEnquiryService'
import { campaignOutcomes } from '../../services/campaignOutcomeModel'
import { AGENCY_CRM_UPDATED_EVENT, getAgencyCrmUpdateDetail } from '../../lib/agencyCrmUpdateBus'

export default function CampaignOutcomes({ campaign, userId, canManage, onEnquiries }) {
  const [stored, setState] = useState({ scope: '', loading: true, error: '', data: null })
  const request = useRef(0)
  const organisationId = campaign.organisation_id, campaignId = campaign.id
  const scope = `${organisationId}:${campaignId}:${userId}:${Boolean(canManage)}`
  const state = stored.scope === scope ? stored : { loading: true, error: '', data: null }
  const invalidate = useCallback(() => { request.current++ }, [])
  const load = useCallback(async () => {
    const token = ++request.current
    try {
      const data = await loadCampaignEnquiries({ organisationId, campaignId, userId, canManage })
      if (request.current === token) setState({ scope, loading: false, error: '', data })
    } catch (error) { if (request.current === token) setState({ scope, loading: false, error: error.message, data: null }) }
  }, [organisationId, campaignId, userId, canManage, scope])
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void load() })
    const update = (event) => { if (getAgencyCrmUpdateDetail(event).organisationId === organisationId) void load() }
    window.addEventListener(AGENCY_CRM_UPDATED_EVENT, update)
    return () => { active = false; invalidate(); window.removeEventListener(AGENCY_CRM_UPDATED_EVENT, update) }
  }, [load, organisationId, invalidate])
  const totals = state.data ? campaignOutcomes(state.data) : null
  return <section className="mc-panel" aria-label="Campaign response outcomes" aria-busy={state.loading}>
    <div className="mc-panel-heading"><h2>From response to next step</h2><button type="button" className="mc-button" disabled={state.loading} onClick={() => { setState((old) => ({ ...old, loading: true })); void load() }}><RefreshCw size={15} />Refresh enquiries</button></div>
    <p className="mc-note">Recorded campaign enquiries and their current CRM progress, within your access.</p>
    {state.error && <p role="alert">{state.error}</p>}
    {state.data?.warnings?.map((warning) => <p role="status" key={warning}>{warning}</p>)}
    <div className="mc-result-grid">{[['Recorded enquiries', totals?.enquiries], ['Contact logged after response', totals?.contacted], ['Overdue follow-ups', totals?.overdue], ['Unassigned people', totals?.unassigned]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{state.loading || state.error || value == null ? '—' : value}</strong></div>)}</div>
    {totals?.stages.length > 0 && !state.error && <div className="mc-result-section"><h3>Current CRM stages</h3><div className="mc-result-grid">{totals.stages.map((stage) => <div key={stage.name}><span>{stage.name}</span><strong>{stage.count}</strong></div>)}</div></div>}
    <p className="mc-note">These counts follow recorded CRM associations and stages. A response or a stage change does not establish campaign revenue.</p>
    <button type="button" className="mc-button mc-primary" onClick={onEnquiries}>Work enquiries & follow-up <ArrowRight size={15} /></button>
  </section>
}
