import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, ChevronDown, Eye, Mail, ShieldCheck, Sparkles, Undo2, X } from 'lucide-react'
import { aiCampaignAction, aiCampaignDocument } from '../../services/aiCampaignService'
import { loadPropertyShowDays } from '../../services/justListedCampaignService'
import { renderEmail } from '../../../../supabase/functions/_shared/emailDocument.js'
import './AiCampaignAssistant.css'
import { SHOW_CAMPAIGN_WORKSPACE } from '../../lib/featureFlags'
import LegacyAiCampaignAssistant from './LegacyAiCampaignAssistant'

const fields = { subject: 'Subject', previewText: 'Preview text', heading: 'Heading', intro: 'Introduction', cta: 'Call to action' }
const objectives = ['new_listing', 'price_reduction', 'show_day']
const creativeKey = (draft) => JSON.stringify([draft.subject || '', draft.previewText || '', draft.contentJson])
const settingsFor = (listing, objective, language, start, end, price, event) => JSON.stringify([listing, objective, language, start, end, price, event])
const eventTime = (value) => {
  if (!value || !Number.isFinite(Date.parse(value))) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value))
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}
function CampaignAssistantStudio({ organisationId, draft, listings, persist, onApply, initialListingId = '', initialObjective = 'new_listing', initialEventId = '', initiallyOpen = false, onContinueManual, subscriptionTypes = [], onPermissionChange, agencyName = '' }) {
  const saved = draft.contentJson.ai_campaign
  const [open, setOpen] = useState(initiallyOpen)
  const [listingId, setListingId] = useState(saved?.listing_id || initialListingId)
  const [objective, setObjective] = useState(saved?.objective || (objectives.includes(initialObjective) ? initialObjective : 'new_listing'))
  const [language, setLanguage] = useState(saved?.language || 'en')
  const [brief, setBrief] = useState('')
  const [eventId, setEventId] = useState(saved?.event?.id || initialEventId)
  const [showStart, setShowStart] = useState(eventTime(saved?.event?.start))
  const [showEnd, setShowEnd] = useState(eventTime(saved?.event?.end))
  const [previousPrice, setPreviousPrice] = useState(saved?.previous_price || '')
  const [result, setResult] = useState(null), [proposal, setProposal] = useState(null), [undo, setUndo] = useState(null)
  const [targetField, setTargetField] = useState('intro')
  const [audience, setAudience] = useState(null), [audienceSource, setAudienceSource] = useState('matched')
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [usage, setUsage] = useState(null), [choices, setChoices] = useState([]), [loadingChoices, setLoadingChoices] = useState(false)
  const [previewMode, setPreviewMode] = useState('desktop'), [mobileTab, setMobileTab] = useState('edit'), [showText, setShowText] = useState(false)
  const active = useRef(0), controller = useRef(null)
  const mobileSurface = useRef(null)
  const draftCurrent = useRef(draft); draftCurrent.current = draft
  const resultCurrent = useRef(result); resultCurrent.current = result
  const settingsKey = settingsFor(listingId, objective, language, showStart, showEnd, previousPrice, eventId)
  const audienceKey = JSON.stringify([listingId, draft.subscriptionTypeId, audienceSource, audienceSource === 'current' ? draft.audienceFilter || {} : null])
  const current = useRef(settingsKey); current.current = settingsKey
  const currentAudience = useRef(audienceKey); currentAudience.current = audienceKey
  useEffect(() => { const lifetime = active; lifetime.current++; return () => { lifetime.current++; controller.current?.abort() } }, [organisationId])
  useEffect(() => {
    if (!open) return
    let live = true
    setLoadingChoices(true)
    aiCampaignAction(organisationId, 'listings', initialListingId ? { listingId: initialListingId } : {}).then((value) => { if (live) setChoices(value.listings || []) }).catch((e) => { if (live) setError(e.message) }).finally(() => { if (live) setLoadingChoices(false) })
    return () => { live = false }
  }, [organisationId, open, initialListingId])
  useEffect(() => {
    if (!initialEventId || saved?.event || objective !== 'show_day') return
    let live = true
    loadPropertyShowDays(organisationId).then((events) => {
      if (!live) return
      const event = events.find((event) => event.id === initialEventId && event.listingId === listingId)
      if (!event) { setError('The suggested show day is no longer available. Confirm the current event before preparing an invitation.'); return }
      setShowStart(`${event.date}T${event.startTime}`); setShowEnd(`${event.date}T${event.endTime}`)
    }).catch(() => { if (live) setError('The saved show day could not be checked. Reopen the event and confirm its current times.') })
    return () => { live = false }
  }, [organisationId, initialEventId, listingId, objective, saved?.event])
  const run = async (task) => {
    const version = ++active.current, key = current.current
    const abort = new AbortController(); controller.current = abort
    setBusy(true); setError(''); setNotice('')
    try { await task(() => active.current === version && current.current === key && !abort.signal.aborted, abort.signal) }
    catch (e) { if (active.current === version && e.name !== 'AbortError') setError(e.message || 'The assistant could not complete this request. Your draft is safe.') }
    finally { if (active.current === version) { setBusy(false); controller.current = null } }
  }
  const previewAudience = () => run(async (valid) => {
    const key = currentAudience.current
    const value = await aiCampaignAction(organisationId, 'audience', { listingId, subscriptionTypeId: draft.subscriptionTypeId, ...(audienceSource === 'current' ? { useCurrentAudience: true, audienceFilter: draft.audienceFilter || {} } : {}) })
    if (valid() && currentAudience.current === key) setAudience({ ...value, key })
  })
  const generate = (revision = '', targetLanguage = language, selectedField = 'all') => run(async (valid, signal) => {
    const baseCreative = creativeKey(draftCurrent.current)
    const activeResult = resultCurrent.current?.key === current.current ? resultCurrent.current : null
    const savedCopy = saved?.listing_id === listingId && saved?.objective === objective ? saved.copy : null
    const baseCopy = activeResult?.copy || savedCopy || null, copyKey = JSON.stringify(baseCopy)
    const campaignId = await persist()
    if (!valid()) return
    if (creativeKey(draftCurrent.current) !== baseCreative) { setNotice('The draft changed while saving. Review your latest edits before generating.'); return }
    const value = await aiCampaignAction(organisationId, 'generate', { listingId, campaignId, requestId: crypto.randomUUID(), objective, language: targetLanguage, brief: revision || brief, previous: baseCopy, targetField: selectedField, previousPrice, ...(draftCurrent.current.updatedAt ? { expectedCampaignUpdatedAt: draftCurrent.current.updatedAt } : {}), ...(objective === 'show_day' && eventId ? { eventId } : {}), showStart: showStart ? `${showStart}:00+02:00` : '', showEnd: showEnd ? `${showEnd}:00+02:00` : '' }, { signal })
    if (!valid()) return
    const latestCopy = resultCurrent.current?.key === current.current ? resultCurrent.current.copy : savedCopy
    if (creativeKey(draftCurrent.current) !== baseCreative || JSON.stringify(latestCopy || null) !== copyKey) { setNotice('Your content changed while AI was working. The late result was kept out of your draft. Generate again from your latest edits.'); return }
    const next = { ...value, key: settingsFor(listingId, objective, targetLanguage, showStart, showEnd, previousPrice, eventId), baseCreative }
    if (activeResult) setProposal({ result: next, baseCopy: copyKey, baseSettings: current.current, language: targetLanguage, changedFields: value.changedFields || (selectedField === 'all' ? Object.keys(fields) : [selectedField]) })
    else { setLanguage(targetLanguage); setResult(next); setProposal(null); setUndo(null); setMobileTab('edit') }
  })
  const validResult = result?.key === settingsKey ? result : null
  const validAudience = audience?.key === audienceKey ? audience : null
  const selectedListing = choices.find((item) => item.id === listingId)
  const image = listings.find((item) => item.id === listingId)?.image || ''
  const preview = useMemo(() => validResult ? renderEmail(aiCampaignDocument(validResult, image), { agencyName: validResult.brand?.name || '', previewText: validResult.copy.previewText }) : '', [validResult, image])
  const validProposal = proposal?.baseSettings === settingsKey && proposal.baseCopy === JSON.stringify(validResult?.copy) ? proposal : null
  function applyProposal() {
    if (!validProposal || creativeKey(draftCurrent.current) !== validProposal.result.baseCreative) { setError('The draft has changed. Request a fresh proposal before applying it.'); return }
    setUndo({ result, language }); setResult(validProposal.result); setLanguage(validProposal.language); setProposal(null); setNotice('Proposed wording applied. You can undo this change.')
  }
  function applyDraft() {
    if (!validResult || creativeKey(draftCurrent.current) !== validResult.baseCreative) { setError('Your email changed after generation. Generate from your latest draft before replacing its content.'); return }
    onApply({ subject: validResult.copy.subject, previewText: validResult.copy.previewText, contentJson: aiCampaignDocument(validResult, image), audienceFilter: validAudience?.audienceFilter || { contact_ids: ['00000000-0000-0000-0000-000000000000'] } }); setOpen(false)
  }
  function cancel() { active.current++; controller.current?.abort(); setBusy(false); setNotice('Stopped waiting. Your draft is unchanged. A request already accepted by the provider may still appear in recorded usage.') }
  function switchSurface(next) {
    setMobileTab(next)
    const scroll = () => mobileSurface.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
    if (window.requestAnimationFrame) window.requestAnimationFrame(scroll)
    else scroll()
  }
  return <section className={`ai-campaign${open ? ' ai-campaign-open' : ''}`} aria-label="AI campaign assistant">
    <button type="button" className="ai-campaign-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><Sparkles size={17} aria-hidden="true" /><span>Create with AI<small>Grounded in your listing. Edited by you.</small></span><ChevronDown size={17} aria-hidden="true" /></button>
    {open && <div className="ai-campaign-panel">
      <header className="ai-studio-heading"><div><span className="ai-eyebrow">Arch9 campaign studio</span><h2>A property. A story.<br/>Your next conversation.</h2><p>Use approved property facts and your agency identity to prepare an email you can make your own.</p></div><span className="ai-studio-assurance"><ShieldCheck size={16} aria-hidden="true" />You review before sending</span></header>
      <nav className="ai-mobile-tabs" aria-label="Assistant working surface"><button type="button" aria-pressed={mobileTab === 'edit'} onClick={() => switchSurface('edit')}>Brief & copy</button><button type="button" aria-pressed={mobileTab === 'preview'} onClick={() => switchSurface('preview')}><Eye size={15} aria-hidden="true" />Email preview</button></nav>
      <div ref={mobileSurface} className={`ai-studio-grid ai-mobile-${mobileTab}`}>
        <div className="ai-studio-controls">
          <section className="ai-studio-section" aria-labelledby="ai-source-heading"><div className="ai-section-label"><span>01</span><h3 id="ai-source-heading">Start with what you know</h3></div><div className="ai-campaign-fields">
            <label>Listing<select value={listingId} disabled={busy || loadingChoices} onChange={(e) => { setListingId(e.target.value); setEventId(''); setShowStart(''); setShowEnd(''); setUndo(null) }}><option value="">{loadingChoices ? 'Loading your listings…' : 'Choose a listing'}</option>{choices.map((item) => <option key={item.id} value={item.id}>{item.title || item.address_line_1 || item.suburb || item.id}</option>)}</select></label>
            <label>Objective<select value={objective} disabled={busy} onChange={(e) => setObjective(e.target.value)}><option value="new_listing">New listing</option><option value="price_reduction">Price reduction</option><option value="show_day">Show day</option></select></label>
            <label>Language<select value={language} disabled={busy} onChange={(e) => setLanguage(e.target.value)}><option value="en">English</option><option value="af">Afrikaans</option></select></label>
            <label>Audience to preview<select value={audienceSource} disabled={busy} onChange={(e) => setAudienceSource(e.target.value)}><option value="matched">Buyers with matching saved preferences</option><option value="current">Current audience from the Audience step</option></select></label>
            {objective === 'price_reduction' && <label className="ai-full">Confirmed previous price (ZAR)<input type="number" min="0" value={previousPrice} disabled={busy} onChange={(e) => setPreviousPrice(e.target.value)} /><small>Confirm the previous amount. The current price comes from the saved listing.</small></label>}
            {objective === 'show_day' && <><label>Show day starts (SAST)<input type="datetime-local" value={showStart} disabled={busy} onChange={(e) => { setShowStart(e.target.value); setEventId('') }} /></label><label>Show day ends (SAST)<input type="datetime-local" value={showEnd} disabled={busy} onChange={(e) => { setShowEnd(e.target.value); setEventId('') }} /></label><p className="ai-full ai-source-note">{eventId ? 'Using a saved show day. Its current date, time and availability will be checked before sending.' : 'Confirm the event time and location visibility. Missing details will not be invented.'}</p></>}
          </div><label className="ai-brief">Optional brief or revision<textarea maxLength={1500} value={brief} disabled={busy} onChange={(e) => setBrief(e.target.value)} placeholder="For example: invite local buyers to arrange a viewing. Keep it warm and professional." rows={3} /><small>{brief.length}/1500 · Facts, price and links stay connected to the saved property.</small></label></section>
          <section className="ai-studio-section" aria-labelledby="ai-audience-heading"><div className="ai-section-label"><span>02</span><h3 id="ai-audience-heading">Choose a useful audience</h3></div>{subscriptionTypes.length > 0 && onPermissionChange && <label>Marketing permission category<select value={draft.subscriptionTypeId || ''} disabled={busy} onChange={(e) => onPermissionChange(e.target.value)}><option value="">Choose a permission category</option>{subscriptionTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select><small>Only contacts eligible for this category can receive the campaign.</small></label>}<p className="ai-source-note">Matching uses recorded preferences and marketing permission. Unknown preferences are never guessed.</p><div className="ai-campaign-actions"><button type="button" disabled={busy || !listingId || !draft.subscriptionTypeId} onClick={previewAudience}>{audienceSource === 'matched' ? 'Preview matching buyers' : 'Preview current audience'}</button><button type="button" className="ai-primary" disabled={busy || !listingId || !validAudience} onClick={() => generate()}><Sparkles size={15} aria-hidden="true" />{validResult ? 'Propose a fresh version' : 'Generate email'}</button></div>
            {!draft.subscriptionTypeId && <p className="ai-source-note">Choose a send permission category in Details to preview eligible buyers.</p>}{validAudience && <div className="ai-audience-result" role="status"><span><Check size={16} aria-hidden="true" /><strong>{validAudience.count} eligible recipients</strong></span><p>{validAudience.explanation}</p><button disabled={busy} type="button" onClick={() => onApply({ audienceFilter: validAudience.audienceFilter })}>Use this audience<ArrowRight size={14} aria-hidden="true" /></button></div>}<p className="ai-source-note">You can also choose a saved audience or specific contacts in the Audience step. Zero matches never selects everyone.</p></section>
          {busy && <div className="ai-progress" role="status"><span><Sparkles size={16} aria-hidden="true" />Preparing your campaign…</span><button type="button" onClick={cancel}>Stop waiting<X size={14} aria-hidden="true" /></button></div>}{error && <p className="ai-error" role="alert">{error}</p>}{notice && <p className="ai-notice" role="status">{notice}</p>}
          {validResult && <section className="ai-campaign-copy ai-studio-section" aria-labelledby="ai-copy-heading"><div className="ai-section-label"><span>03</span><h3 id="ai-copy-heading">Make it yours</h3></div>{Object.entries(fields).map(([key, label]) => <label key={key}>{label}<textarea value={validResult.copy[key]} maxLength={key === 'intro' ? 1600 : key === 'cta' ? 80 : 200} disabled={busy} rows={key === 'intro' ? 4 : 2} onChange={(e) => { setResult((r) => ({ ...r, copy: { ...r.copy, [key]: e.target.value } })); setProposal(null); setUndo(null) }} /></label>)}
            <div className="ai-refine"><label>Refine one part<select value={targetField} disabled={busy} onChange={(e) => setTargetField(e.target.value)}>{Object.entries(fields).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><div className="ai-campaign-actions">{['Shorter', 'More conversational', 'Clearer call to action'].map((instruction) => <button key={instruction} type="button" disabled={busy} onClick={() => void generate(instruction, language, instruction === 'Clearer call to action' ? 'cta' : targetField)}>{instruction}</button>)}<button type="button" disabled={busy} onClick={() => void generate(brief || `Refine the ${fields[targetField].toLowerCase()}`, language, targetField)}>Use my instruction</button><button type="button" disabled={busy} onClick={() => void generate('Translate to Afrikaans', 'af', 'all')}>Translate to Afrikaans</button></div><small>Only the chosen field changes. Translation proposes the full copy for review.</small></div>
            {validProposal && <section className="ai-proposal" aria-label="Proposed AI change"><h4>A proposal for your review</h4>{validProposal.changedFields.map((key) => <div key={key}><strong>{fields[key]}</strong><del>{validResult.copy[key]}</del><ins>{validProposal.result.copy[key]}</ins></div>)}<div className="ai-campaign-actions"><button type="button" className="ai-primary" onClick={applyProposal}>Apply proposed change</button><button type="button" onClick={() => setProposal(null)}>Keep my current copy</button></div></section>}{undo && <button type="button" className="ai-undo" disabled={busy} onClick={() => { setResult(undo.result); setLanguage(undo.language); setUndo(null); setProposal(null); setNotice('Previous wording restored.') }}><Undo2 size={14} aria-hidden="true" />Undo last AI change</button>}
            <p className="ai-source-note">Check the wording and property facts. Address, price, highlights and show-day times use saved or confirmed facts. A public property link is required before sending.</p><button type="button" className="ai-primary ai-apply" disabled={busy} onClick={applyDraft}>Use this email in my draft<ArrowRight size={16} aria-hidden="true" /></button></section>}
          <footer className="ai-usage"><button type="button" disabled={busy} onClick={() => run(async (valid) => { const value = await aiCampaignAction(organisationId, 'usage'); if (valid()) setUsage(value.usage) })}>View recorded AI usage</button>{onContinueManual && <button type="button" onClick={() => { setOpen(false); onContinueManual() }}>Continue in manual editor<ArrowRight size={14} aria-hidden="true" /></button>}<p>AI usage is separate from email delivery. The manual editor remains available if AI is unconfigured or unavailable.</p>{usage && <><p>USD amounts track provider cost or an allowance held for uncertain failures. They are separate from delivery charges and subscription fees.</p><ul>{usage.length ? usage.map((item) => <li key={item.id}>{item.model} · {item.status} · {item.input_tokens ?? 'unknown'} input / {item.output_tokens ?? 'unknown'} output · USD {Number(item.cost_usd).toFixed(6)} · {item.funding_mode}</li>) : <li>No recorded AI usage.</li>}</ul></>}</footer>
        </div>
        <aside className="ai-studio-preview" aria-label="Campaign creative preview"><div className="ai-preview-toolbar"><span><Eye size={16} aria-hidden="true" />Email preview</span><div role="group" aria-label="Preview size"><button type="button" aria-pressed={previewMode === 'desktop'} onClick={() => setPreviewMode('desktop')}>Desktop</button><button type="button" aria-pressed={previewMode === 'mobile'} onClick={() => setPreviewMode('mobile')}>Mobile</button></div></div>{validResult ? <><div className="ai-preview-envelope"><strong>{validResult.copy.subject}</strong><p>{validResult.copy.previewText}</p></div><div className={`ai-email-frame ai-email-${previewMode}`}><iframe title="Property email preview" sandbox="" srcDoc={preview} /></div><button className="ai-text-toggle" type="button" aria-expanded={showText} onClick={() => setShowText(!showText)}>Readable copy</button>{showText && <pre className="ai-readable-copy">{Object.values(validResult.copy).join('\n\n')}</pre>}<div className="ai-preview-source"><ShieldCheck size={16} aria-hidden="true" /><p><strong>Source: {validResult.listing?.title || selectedListing?.title || 'Selected property'}</strong><span>{validResult.brand?.name || 'Saved agency identity'} · {language === 'af' ? 'Afrikaans' : 'English'}{validAudience ? ` · ${validAudience.count} eligible recipients` : ''}</span></p></div><p className="ai-source-note">This uses the delivery renderer. Final review checks sender, links, images, permissions and current property facts.</p></> : saved ? <><div className="ai-preview-envelope"><strong>{draft.subject || 'Saved property email'}</strong><p>{draft.previewText || 'Your saved draft'}</p></div><div className={`ai-email-frame ai-email-${previewMode}`}><iframe title="Saved property email preview" sandbox="" srcDoc={renderEmail(draft.contentJson, { agencyName, previewText: draft.previewText })} /></div><p className="ai-source-note">Your saved email, including manual edits. Continue in the manual editor to keep working on this version.</p></> : <div className="ai-preview-empty"><span><Mail size={32} strokeWidth={1.2} aria-hidden="true" /></span><small>Your next property story</small><h3>{selectedListing?.title || 'Start with a property.'}</h3><p>{selectedListing ? 'Preview an eligible audience and generate your first draft. Your actual email will appear here.' : 'Choose a listing and an objective. We’ll bring the source facts into one branded, editable email.'}</p><div><span>Property facts</span><span>Agency identity</span><span>Your voice</span></div></div>}</aside>
      </div>
    </div>}
  </section>
}

export default function AiCampaignAssistant(props) {
  return SHOW_CAMPAIGN_WORKSPACE ? <CampaignAssistantStudio {...props} /> : <LegacyAiCampaignAssistant {...props} />
}
