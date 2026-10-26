import { useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, CircleHelp, RefreshCw, ShieldCheck } from 'lucide-react'
import { loadCampaignReadiness } from '../../services/campaignReadinessService'
import './CampaignReadiness.css'

const icons = { ready: CheckCircle2, blocked: AlertCircle, review: CircleHelp, unchecked: CircleHelp }
export default function CampaignReadiness({ campaign, userId, onEdit, canEdit }) {
  const [state, setState] = useState({ loading: false, data: null, error: '' })
  const request = useRef(0)
  async function check() {
    const token = ++request.current
    setState({ loading: true, data: null, error: '' })
    try {
      const data = await loadCampaignReadiness(campaign.organisation_id, userId, campaign)
      if (token === request.current) setState({ loading: false, data, error: '' })
    } catch (error) {
      if (token === request.current) setState({ loading: false, data: null, error: error.message || 'The current property sources could not be checked.' })
    }
  }
  const data = state.data
  return <section className="cr-readiness" aria-labelledby="cr-heading" aria-busy={state.loading}>
    <header><span className="cr-mark"><ShieldCheck size={21} aria-hidden="true" /></span><div><h2 id="cr-heading">A confident next step</h2><p>Revision {campaign.revision} · Check saved content against the current property source.</p></div><button type="button" className="mc-button" disabled={state.loading} onClick={() => void check()}><RefreshCw size={15} aria-hidden="true" />{state.loading ? 'Checking…' : data ? 'Check again' : 'Check current sources'}</button></header>
    {state.error && <p className="cr-error" role="alert">{state.error}</p>}
    {!data && !state.loading && !state.error && <p className="cr-note">A saved draft is a snapshot. Check it again after a price, property, contact or show-day change.</p>}
    {state.loading && <p className="cr-note" role="status">Refreshing the saved revision and sources available to your account…</p>}
    {data && <><ul>{data.checks.map((item) => { const Icon = icons[item.status] || CircleHelp; return <li key={item.id} className={`cr-${item.status}`}><Icon size={17} aria-hidden="true" /><div><strong>{item.label}</strong><p>{item.detail}</p></div><span>{({ ready: 'Checked', blocked: 'Needs attention', review: 'Review', unchecked: 'Not checked' })[item.status]}</span></li> })}</ul>{data.sourceError && <p className="cr-error">{data.sourceError}</p>}{data.eventError && <p className="cr-error">{data.eventError}</p>}{[data.sourceCheckedAt && ['Listing', data.sourceCheckedAt], data.eventCheckedAt && ['Show day', data.eventCheckedAt]].filter(Boolean).map(([label, time]) => <p className="cr-note" key={label}>{label} checked {new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(time))} SAST</p>)}<footer><p>{data.readyToPrepare ? 'Source checks are ready for preparing a channel draft.' : 'Review the listed issues before preparing a channel draft.'} Sender, recipient permissions, cost and final delivery approval are checked in the channel.</p>{canEdit && !data.readyToPrepare && <button type="button" className="mc-button" onClick={onEdit}>Review campaign</button>}</footer></>}
  </section>
}
