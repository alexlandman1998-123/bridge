import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Copy, Link2, RefreshCw } from 'lucide-react'
import { loadCampaignResponseLinks, createCampaignResponseLink, revokeCampaignResponseLink } from '../../services/campaignResponseLinkService'
import { applyCampaignResponseToPlaybook } from '../../services/campaignResponsePlaybook'
import { MarketingLink as Link } from './MarketingNavigation.jsx'
import './CampaignResponseLink.css'

const purposes = { valuation: 'Valuation requests', seller: 'Seller enquiries', buyer: 'Buyer enquiries', referral: 'Personal introductions' }
export default function CampaignResponseLink({ campaign, userId, canEdit, onSaved, onPlaybook }) {
  const [state, setState] = useState({ loading: true, intakeLinks: [], links: [], error: '', notice: '' })
  const [intakeId, setIntakeId] = useState('')
  const [purpose, setPurpose] = useState(campaign.goal === 'buyer_leads' ? 'buyer' : campaign.campaign_builder?.template === 'referral-request' ? 'referral' : 'valuation')
  const [followUpDays, setFollowUpDays] = useState(1)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const sequence = useRef(0)
  const invalidate = useCallback(() => { sequence.current++ }, [])
  const load = useCallback(async () => {
    const request = ++sequence.current
    setState((old) => ({ ...old, loading: true, error: '' }))
    try {
      const data = await loadCampaignResponseLinks(campaign.organisation_id, userId, campaign)
      if (request !== sequence.current) return
      setState({ ...data, loading: false, error: '' })
      setIntakeId((old) => data.intakeLinks.some((link) => link.id === old) ? old : data.intakeLinks[0]?.id || '')
    } catch (error) { if (request === sequence.current) setState({ loading: false, intakeLinks: [], links: [], error: error.message }) }
  }, [campaign, userId])
  useEffect(() => { void load(); return invalidate }, [load, invalidate])
  const run = async (action) => {
    const request = sequence.current
    setBusy(true); setMessage('')
    try { await action(() => request === sequence.current); if (request === sequence.current) await load() }
    catch (error) { if (request === sequence.current) setMessage(error.message) }
    finally { setBusy(false) }
  }
  const eligible = state.intakeLinks.filter((link) => {
    const needed = ['valuation', 'seller'].includes(purpose) ? 'sell' : purpose === 'buyer' ? 'buy' : null
    return !needed || link.enabledIntents.includes(needed)
  })
  const chosen = eligible.some((link) => link.id === intakeId) ? intakeId : eligible[0]?.id || ''
  return <section className="mc-response mc-panel" aria-labelledby="mc-response-title" aria-busy={state.loading || busy}>
    <header><div><Link2 size={19} aria-hidden="true" /><h2 id="mc-response-title">Turn interest into enquiries</h2></div><button type="button" className="mc-button" aria-label="Refresh campaign response links" disabled={busy || state.loading} onClick={() => void load()}><RefreshCw size={15} /></button></header>
    <p>Give this campaign its own enquiry link. A submitted form records the campaign, connects the person to CRM and creates a follow-up for their responsible agent.</p>
    {state.error && <p role="alert">{state.error}</p>}
    {state.notice && <p role="status">{state.notice}</p>}
    {message && <p role="status">{message}</p>}
    {canEdit && !state.error && !state.loading && <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await createCampaignResponseLink(campaign.organisation_id, userId, campaign, { intakeLinkId: chosen, purpose, followUpDays }); setMessage('Response link created. Review the form, then add it to your campaign playbook or copy it into your content.') }) }}>
      <div className="mc-response-fields"><label>What should people enquire about?<select value={purpose} onChange={(event) => setPurpose(event.target.value)}>{Object.entries(purposes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Public enquiry form<select value={chosen} onChange={(event) => setIntakeId(event.target.value)}><option value="" disabled>Choose an active form</option>{eligible.map((link) => <option key={link.id} value={link.id}>{link.label}</option>)}</select></label>
      <label>Follow up after submission<select value={followUpDays} onChange={(event) => setFollowUpDays(Number(event.target.value))}>{[0, 1, 2, 3, 7, 14].map((day) => <option key={day} value={day}>{day ? `${day} ${day === 1 ? 'day' : 'days'}` : 'Same day'}</option>)}</select></label></div>
      {!eligible.length && <p>Enable a public enquiry form that accepts {purpose === 'buyer' ? 'buyer' : purpose === 'referral' ? 'property' : 'seller'} enquiries in <Link to="/settings/integrations/digital-cards">Agent card settings</Link>, then refresh.</p>}
      <button type="submit" className="mc-button mc-primary" disabled={busy || !chosen}>Create response link</button>
    </form>}
    <div className="mc-response-list">{state.links.filter((link) => link.status === 'active').map((link) => <article key={link.id}>
      <div><strong>{purposes[link.purpose] || 'Campaign enquiries'}</strong><span>{link.followUpDays ? `Follow-up within ${link.followUpDays} ${link.followUpDays === 1 ? 'day' : 'days'}` : 'Same-day follow-up'} · Prepared from revision {link.campaignRevision}</span></div>
      <input aria-label={`${purposes[link.purpose] || 'Campaign'} response URL`} value={link.url || ''} readOnly />
      <div className="mc-response-actions"><a className="mc-button" href={link.url} target="_blank" rel="noreferrer">Review form <ArrowUpRight size={14} /></a><button type="button" className="mc-button" disabled={busy} onClick={() => void run(async () => { await navigator.clipboard.writeText(link.url); setMessage('Response link copied.') })}><Copy size={14} />Copy link</button>
        {canEdit && <><button type="button" className="mc-button mc-primary" disabled={busy || link.campaignRevision !== campaign.revision} onClick={() => void run(async (isCurrent) => { await applyCampaignResponseToPlaybook(campaign, link); if (!isCurrent()) return; onPlaybook?.(); await onSaved?.() })}>Use in playbook</button><button type="button" className="mc-text-button" disabled={busy} onClick={() => void run(async () => { await revokeCampaignResponseLink(campaign.organisation_id, userId, campaign, link); setMessage('Link disabled. Existing CRM enquiries and follow-up tasks are retained.') })}>Disable link</button></>}
      </div>
    </article>)}</div>
    <small>Use the link in your content or playbook before sharing. Enquiry permission and optional marketing permission are recorded separately. Introductions ask the visitor to enquire for themselves.</small>
  </section>
}
