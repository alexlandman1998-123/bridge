import { lazy, Suspense, useId, useState } from 'react'
import { Plus, UsersRound } from 'lucide-react'
import AddressAutocomplete from '../location/AddressAutocomplete'
import Modal from '../ui/Modal'
import { CAMPAIGN_GOALS } from '../../services/marketingCampaignService'
import { CAMPAIGN_OBJECTIVES } from '../../services/campaignSetupModel'
import './CampaignGoalFields.css'

const MarketingAudiences = lazy(() => import('./MarketingAudiences'))

export default function CampaignGoalFields({ form, setForm, organisationId }) {
  const id = useId()
  const [audienceOpen, setAudienceOpen] = useState(false)
  const [createAudience, setCreateAudience] = useState(false)
  const setup = form.campaign_setup || {}
  const update = (patch) => setForm((old) => ({ ...old, ...patch }))
  const updateSetup = (patch) => setForm((old) => ({ ...old, campaign_setup: { ...old.campaign_setup, ...patch } }))
  return <>
    <div className="mc-goal-field">
      <div className="mc-goal-label"><label htmlFor={`${id}-goal`}>Goal</label><button type="button" onClick={() => update({ goal: 'custom' })}><Plus size={14} />Custom goal</button></div>
      <select id={`${id}-goal`} value={form.goal} onChange={(event) => update({ goal: event.target.value })}>{Object.entries(CAMPAIGN_GOALS).map(([key, label]) => <option key={key} value={key}>{key === 'custom' ? 'Custom goal' : label}</option>)}</select>
      {form.goal === 'custom' && <input aria-label="Custom goal" required maxLength={120} placeholder="e.g. Grow our rental landlord network" value={setup.customGoal || ''} onChange={(event) => updateSetup({ customGoal: event.target.value })} />}
    </div>
    <div className="mc-goal-field mc-goal-area">
      <AddressAutocomplete label="Area" predictionTypes={['(regions)']} placeholder="Search suburb, town or region" value={form.area ? { formattedAddress: form.area, placeId: setup.placeId } : null} onInputValueChange={(area) => setForm((old) => ({ ...old, area, campaign_setup: { ...old.campaign_setup, placeId: '' } }))} onChange={(place) => { if (place) setForm((old) => ({ ...old, area: place.formattedAddress.slice(0, 120), campaign_setup: { ...old.campaign_setup, placeId: place.placeId || place.googlePlaceId || '' } })); else updateSetup({ placeId: '' }) }} inputProps={{ maxLength: 120 }} />
    </div>
    <label className="mc-goal-field">Objective
      <select aria-label="Objective" required value={setup.metaObjective || ''} onChange={(event) => { const metaObjective = event.target.value; setForm((old) => ({ ...old, objective: CAMPAIGN_OBJECTIVES[metaObjective]?.label || '', campaign_setup: { ...old.campaign_setup, metaObjective } })) }}><option value="">Choose an objective</option>{Object.entries(CAMPAIGN_OBJECTIVES).map(([code, option]) => <option key={code} value={code}>{option.label}</option>)}</select>
      <small>{CAMPAIGN_OBJECTIVES[setup.metaObjective]?.description || 'Choose the action your marketing should encourage.'}</small>
      {!setup.metaObjective && form.objective && <small>Existing brief: {form.objective}</small>}
    </label>
    <label className="mc-goal-field">Target <span className="mc-goal-optional">Optional</span>
      <input aria-label="Target" maxLength={240} placeholder="e.g. 20 valuation requests this month" value={setup.target || ''} onChange={(event) => updateSetup({ target: event.target.value })} />
    </label>
    <div className="mc-goal-field">
      <div className="mc-goal-label"><label htmlFor={`${id}-audience`}>Audience</label><button type="button" disabled={!organisationId} onClick={() => { setCreateAudience(true); setAudienceOpen(true) }}><Plus size={14} />Create audience</button></div>
      <button id={`${id}-audience`} type="button" className="mc-goal-audience" disabled={!organisationId} onClick={() => { setCreateAudience(false); setAudienceOpen(true) }}><UsersRound size={18} /><span>{setup.audienceId ? form.audience : 'Choose a saved CRM audience'}</span></button>
      {setup.audienceId && <button type="button" className="mc-goal-clear" onClick={() => setForm((old) => ({ ...old, audience: '', campaign_setup: { ...old.campaign_setup, audienceId: '' } }))}>Clear audience selection</button>}
      <small>Preview saved audiences or build a new live segment. Channel permissions are checked before sending.</small>
      {form.audience && !setup.audienceId && <small>Brief audience: {form.audience}</small>}
    </div>
    <label className="mc-goal-field">Offer <span className="mc-goal-optional">Optional</span>
      <textarea aria-label="Offer" rows={2} maxLength={600} value={form.offer || ''} onChange={(event) => update({ offer: event.target.value })} placeholder="e.g. A complimentary valuation or a private viewing" />
      <small>What gives them a reason to respond?</small>
    </label>
    <Modal open={audienceOpen} onClose={() => setAudienceOpen(false)} title="Choose or create an audience" className="ma-library-modal"><div onSubmit={(event) => event.stopPropagation()}><Suspense fallback={<p role="status">Loading shared audiences…</p>}>{audienceOpen && <MarketingAudiences initialCreate={createAudience} organisationId={organisationId} onChoose={async (audience) => { setForm((old) => ({ ...old, audience: audience.name, campaign_setup: { ...old.campaign_setup, audienceId: audience.id } })); setAudienceOpen(false) }} />}</Suspense></div></Modal>
  </>
}
