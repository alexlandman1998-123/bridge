import { useEffect, useRef, useState } from 'react'
import { aiCampaignAction, aiCampaignDocument } from '../../services/aiCampaignService'
import './LegacyAiCampaignAssistant.css'

export default function LegacyAiCampaignAssistant({ organisationId, draft, listings, persist, onApply, initialListingId = '', initiallyOpen = false }) {
  const saved = draft.contentJson.ai_campaign
  const [open, setOpen] = useState(initiallyOpen)
  const [listingId, setListingId] = useState(saved?.listing_id || initialListingId)
  const [objective, setObjective] = useState(saved?.objective || 'new_listing')
  const [language, setLanguage] = useState(saved?.language || 'en')
  const [brief, setBrief] = useState('')
  const [showStart, setShowStart] = useState(saved?.event?.start?.slice(0, 16) || '')
  const [showEnd, setShowEnd] = useState(saved?.event?.end?.slice(0, 16) || '')
  const [previousPrice, setPreviousPrice] = useState(saved?.previous_price || '')
  const [result, setResult] = useState(null)
  const [audience, setAudience] = useState(null)
  const [audienceSource, setAudienceSource] = useState('matched')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [usage, setUsage] = useState(null)
  const [choices, setChoices] = useState([])
  const active = useRef(0)
  const settingsKey = JSON.stringify([listingId, objective, language, showStart, showEnd, previousPrice])
  const audienceKey = JSON.stringify([listingId, draft.subscriptionTypeId, audienceSource, audienceSource === 'current' ? draft.audienceFilter || {} : null])
  const current = useRef(settingsKey); current.current = settingsKey
  useEffect(() => { const lifetime = active; lifetime.current++; return () => { lifetime.current++ } }, [organisationId])
  useEffect(() => {
    if (!open) return
    let live = true
    aiCampaignAction(organisationId, 'listings', initialListingId ? { listingId: initialListingId } : {}).then((value) => { if (live) setChoices(value.listings) }).catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [organisationId, open, initialListingId])
  const run = async (task) => {
    const version = active.current; const key = current.current
    setBusy(true); setError('')
    try { await task(() => active.current === version && current.current === key) } catch (e) { if (active.current === version) setError(e.message) } finally { if (active.current === version) setBusy(false) }
  }
  const previewAudience = () => run(async (valid) => {
    const value = await aiCampaignAction(organisationId, 'audience', { listingId, subscriptionTypeId: draft.subscriptionTypeId, ...(audienceSource === 'current' ? { useCurrentAudience: true, audienceFilter: draft.audienceFilter || {} } : {}) })
    if (valid()) setAudience({ ...value, key: audienceKey })
  })
  const generate = (revision = '', targetLanguage = language) => run(async (valid) => {
    const campaignId = await persist()
    const value = await aiCampaignAction(organisationId, 'generate', { listingId, campaignId, requestId: crypto.randomUUID(), objective, language: targetLanguage, brief: revision || brief, previous: result?.copy || saved?.copy || null, previousPrice, showStart: showStart ? `${showStart}:00+02:00` : '', showEnd: showEnd ? `${showEnd}:00+02:00` : '' })
    if (valid()) { setLanguage(targetLanguage); setResult({ ...value, key: JSON.stringify([listingId, objective, targetLanguage, showStart, showEnd, previousPrice]) }) }
  })
  const validResult = result?.key === settingsKey ? result : null
  const validAudience = audience?.key === audienceKey ? audience : null
  return <section className="ai-campaign ai-campaign-legacy" aria-label="AI campaign assistant">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>Create with AI</button>
    {open && <div className="ai-campaign-panel">
      <h2>Create a listing email</h2>
      <p>Choose a property and audience, generate editable copy, then continue through campaign review. AI usage is separate from email delivery.</p>
      <div className="ai-campaign-fields">
        <label>Listing<select value={listingId} disabled={busy} onChange={(e) => setListingId(e.target.value)}><option value="">Choose a listing</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.title || item.address_line_1 || item.suburb || item.id}</option>)}</select></label>
        <label>Objective<select value={objective} disabled={busy} onChange={(e) => setObjective(e.target.value)}><option value="new_listing">New listing</option><option value="price_reduction">Price reduction</option><option value="show_day">Show day</option></select></label>
        <label>Language<select value={language} disabled={busy} onChange={(e) => setLanguage(e.target.value)}><option value="en">English</option><option value="af">Afrikaans</option></select></label>
        <label>Audience to preview<select value={audienceSource} disabled={busy} onChange={(e) => setAudienceSource(e.target.value)}><option value="matched">Buyers with matching saved preferences</option><option value="current">Current audience from the Audience step</option></select></label>
        {objective === 'price_reduction' && <label>Confirmed previous price (ZAR)<input type="number" min="0" value={previousPrice} disabled={busy} onChange={(e) => setPreviousPrice(e.target.value)} /></label>}
        {objective === 'show_day' && <><label>Show day starts (SAST)<input type="datetime-local" value={showStart} disabled={busy} onChange={(e) => setShowStart(e.target.value)} /></label><label>Show day ends (SAST)<input type="datetime-local" value={showEnd} disabled={busy} onChange={(e) => setShowEnd(e.target.value)} /></label></>}
      </div>
      <label>Optional brief or revision<textarea maxLength={1500} value={brief} disabled={busy} onChange={(e) => setBrief(e.target.value)} placeholder="For example: warm and conversational" /></label>
      <div className="ai-campaign-actions"><button type="button" disabled={busy || !listingId || !draft.subscriptionTypeId} onClick={previewAudience}>{audienceSource === 'matched' ? 'Preview matching buyers' : 'Preview current audience'}</button><button type="button" disabled={busy || !listingId || !validAudience} onClick={() => generate()}>Generate email</button></div>
      {!draft.subscriptionTypeId && <p>Choose a send permission category in Details to preview eligible buyers.</p>}
      {validAudience && <div role="status"><strong>{validAudience.count} eligible recipients</strong><p>{validAudience.explanation}</p><button disabled={busy} type="button" onClick={() => onApply({ audienceFilter: validAudience.audienceFilter })}>Use this audience</button></div>}
      <p>You can also choose a saved audience or specific contacts in the Audience step. Zero matches never selects everyone.</p>
      {busy && <p role="status">Preparing your campaign…</p>}{error && <p role="alert">{error}</p>}
      {validResult && <div className="ai-campaign-copy">
        {Object.entries({ subject: 'Subject', previewText: 'Preview text', heading: 'Heading', intro: 'Introduction', cta: 'Call to action' }).map(([key, label]) => <label key={key}>{label}<textarea value={validResult.copy[key]} maxLength={key === 'intro' ? 1600 : key === 'cta' ? 80 : 200} disabled={busy} onChange={(e) => setResult((r) => ({ ...r, copy: { ...r.copy, [key]: e.target.value } }))} /></label>)}
        <div className="ai-campaign-actions">{['Shorter', 'More conversational', 'Translate to Afrikaans'].map((instruction) => <button key={instruction} type="button" disabled={busy} onClick={() => void generate(instruction, instruction === 'Translate to Afrikaans' ? 'af' : language)}>{instruction}</button>)}</div>
        <p>Check the wording and property facts. Address, price, highlights and show-day times use saved or confirmed facts. A public property link is required before sending.</p>
        <button type="button" disabled={busy} onClick={() => {
          const image = listings.find((item) => item.id === listingId)?.image || ''
          onApply({ subject: validResult.copy.subject, previewText: validResult.copy.previewText, contentJson: aiCampaignDocument(validResult, image), audienceFilter: validAudience?.audienceFilter || { contact_ids: ['00000000-0000-0000-0000-000000000000'] } })
          setOpen(false)
        }}>Use this email in my draft</button>
      </div>}
      <button type="button" disabled={busy} onClick={() => run(async (valid) => { const value = await aiCampaignAction(organisationId, 'usage'); if (valid()) setUsage(value.usage) })}>View recorded AI usage</button>
      {usage && <p>USD amounts track provider cost or an allowance held for uncertain failures. They are separate from delivery charges and subscription fees.</p>}
      {usage && <ul>{usage.length ? usage.map((item) => <li key={item.id}>{item.model} · {item.status} · {item.input_tokens ?? 'unknown'} input / {item.output_tokens ?? 'unknown'} output · USD {Number(item.cost_usd).toFixed(6)} · {item.funding_mode}</li>) : <li>No recorded AI usage.</li>}</ul>}
    </div>}
  </section>
}
