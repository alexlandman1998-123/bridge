import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../ui/Button'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'
import { advanceScreening, screeningAnswerText, screeningOpening, screeningQuestions, validateScreeningContext } from '../../../../supabase/functions/_shared/whatsappScreening.js'
import { screeningTemplate } from '../../../../supabase/functions/_shared/whatsappScreeningTemplate.js'
import { templateFields } from '../../../../supabase/functions/_shared/whatsappCampaign.js'

const inputClass = 'w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const contextFields = {
  agencyName: 'Agency legal name', conditions: 'Verified property conditions', petPolicy: 'Verified pet policy',
  privacyUrl: 'Full privacy notice URL', privacyContact: 'Privacy contact email / phone', retention: 'Approved retention period or criteria',
  rates: 'Monthly rates and taxes (R)', levy: 'Monthly levy (R; zero if not applicable)',
  deposit: 'Rental deposit (R; zero if none)', availableFrom: 'Available from', leaseTerm: 'Offered lease term',
  depositDue: 'When the deposit is due', fees: 'All fees, billing basis, due stages and refund terms (including VAT where applicable)',
}
const draftFor = listing => ({ listingId: listing?.id || '', kind: listing?.listing_category === 'rental' ? 'tenant' : 'buyer', deliveryMode: 'test', testPhone: '', senderId: '', template: null, values: {}, context: {
  propertyLabel: listing?.title || '', location: [listing?.suburb, listing?.city].filter(Boolean).join(', '), price: listing?.asking_price || '',
  agencyName: '', conditions: '', petPolicy: '', privacyUrl: '', privacyContact: '', retention: '', rates: '', levy: '', deposit: '', availableFrom: '', leaseTerm: '', depositDue: '', fees: '',
} })

export function ScreeningChatPreview({ profile }) {
  const fresh = () => ({ kind: profile.kind, context_snapshot: profile.context, answers: {}, status: 'awaiting_start', current_key: null })
  const [session, setSession] = useState(fresh), [reply, setReply] = useState(''), [error, setError] = useState('')
  const [messages, setMessages] = useState(() => [{ role: 'bot', body: screeningOpening(profile.kind, profile.context, 'Example Applicant') }])
  const log = useRef(null)
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight }, [messages.length])
  function send(value) {
    if (!value.trim()) return
    if (['completed', 'handoff', 'stopped'].includes(session.status)) { setError('This preview has ended. Restart it to try another path.'); return }
    const next = advanceScreening(session, value)
    setSession(old => ({ ...old, ...next }))
    setMessages(old => [...old, { role: 'applicant', body: value }, ...(next.body ? [{ role: 'bot', body: next.body }] : [])])
    setReply(''); setError('')
  }
  return <section className="my-4 space-y-3 rounded-xl border border-emerald-200 bg-white p-4" aria-label="Screening conversation simulator"><div className="flex justify-between gap-3"><h4 className="font-semibold">Try the conversation</h4><Button size="sm" variant="secondary" onClick={() => { setSession(fresh()); setMessages([{ role: 'bot', body: screeningOpening(profile.kind, profile.context, 'Example Applicant') }]); setReply(''); setError('') }}>Restart preview</Button></div>
    <p className="text-xs text-slate-600">Example data only. Preview replies are held on this screen and never sent or saved.</p>
    <div ref={log} role="log" aria-label="Example screening messages" aria-live="polite" className="max-h-96 space-y-3 overflow-y-auto rounded-lg bg-slate-100 p-3">{messages.map((message, index) => <div key={index} className={`max-w-[95%] whitespace-pre-wrap rounded-lg p-3 text-sm ${message.role === 'bot' ? 'mr-auto bg-white' : 'ml-auto bg-emerald-100'}`}><strong className="mb-1 block text-xs">{message.role === 'bot' ? 'Agency assistant' : 'Example applicant'}</strong>{message.body}</div>)}</div>
    <label className="grid gap-1 text-sm">Preview reply<input className={inputClass} value={reply} onChange={event => setReply(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); send(reply) } }} /></label>
    <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => send(reply)}>Send preview reply</Button>{['START', 'PAUSE', 'RESUME', 'AGENT', 'STOP'].map(command => <Button key={command} size="sm" variant="secondary" onClick={() => send(command)}>{command}</Button>)}</div>
    <p role="status" className="text-xs text-slate-600">Preview: {session.status.replaceAll('_', ' ')} · {Object.keys(session.answers).length} {Object.keys(session.answers).length === 1 ? 'answer' : 'answers'}</p>
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
  </section>
}

export function ScreeningPreview({ profile }) {
  const [answers, setAnswers] = useState({})
  const questions = screeningQuestions(profile.kind, profile.context)
  return <details className="rounded-lg border bg-slate-50 p-4">
    <summary className="cursor-pointer font-semibold">Preview the conversation · up to {questions.length} questions</summary>
    <ScreeningChatPreview key={`${profile.kind}:${profile.context.propertyLabel}`} profile={profile} />
    <p className="mt-3 whitespace-pre-wrap text-sm">{screeningOpening(profile.kind, profile.context, 'Example Applicant')}</p>
    <p className="my-3 text-xs text-slate-600">Preview only. Example answers below change the conditional questions; nothing is saved or sent.</p>
    <ol className="space-y-3">{questions.filter(q => !q.when || q.when(answers)).map(q => <li key={q.key} className="rounded-lg border bg-white p-3 text-sm">
      <p className="whitespace-pre-wrap font-medium">{q.label}</p>
      {q.options ? <label className="mt-2 grid gap-1"><span className="text-xs">Example answer</span><select aria-label={`Preview: ${q.key}`} className={inputClass} value={answers[q.key] || ''} onChange={event => setAnswers(old => ({ ...old, [q.key]: event.target.value }))}><option value="">Choose example answer</option>{q.options.map(option => <option key={option}>{option}</option>)}</select></label> : <p className="mt-1 text-xs text-slate-500">{q.optional ? 'Optional · SKIP is accepted' : `Reply with ${q.type === 'money' ? 'an amount' : q.type === 'date' ? 'a date (YYYY-MM-DD)' : 'your answer'}`}</p>}
    </li>)}</ol>
  </details>
}

function ScreeningEditor({ workspace, saved, listings, onSaved, onCancel }) {
  const [draft, setDraft] = useState(() => saved ? { deliveryMode: 'test', testPhone: '', ...saved.config } : draftFor())
  const [templates, setTemplates] = useState([]), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('')
  const active = useRef(true)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    let cancelled = false
    if (!draft.senderId) return undefined
    setLoading(true)
    metaIntegrationRequest(workspace.organisationId, 'automation_templates', { senderId: draft.senderId })
      .then(data => { if (!cancelled) setTemplates(data.templates || []) })
      .catch(failure => { if (!cancelled) setError(failure.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspace.organisationId, draft.senderId])
  function change(key, value) { setDraft(old => ({ ...old, [key]: value })); setError('') }
  function context(key, value) { setDraft(old => ({ ...old, context: { ...old.context, [key]: value } })); setError('') }
  const keys = ['agencyName', 'conditions', 'petPolicy', ...(draft.kind === 'tenant' ? ['deposit', 'availableFrom', 'leaseTerm', 'depositDue', 'fees'] : ['rates', 'levy']), 'privacyUrl', 'privacyContact', 'retention']
  const definition = templateFields(draft.template)
  let opening = '', ready = false, contextReady = false
  try {
    validateScreeningContext(draft.kind, draft.context)
    contextReady = true
    opening = screeningTemplate(draft, { phone: '27820000000', full_name: 'Example Applicant' }).body
    ready = Boolean(draft.listingId && draft.senderId)
  } catch { /* The save action explains the first incomplete requirement. */ }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      validateScreeningContext(draft.kind, draft.context)
      screeningTemplate(draft, { phone: '27820000000', full_name: 'Example Applicant' })
      await metaIntegrationRequest(workspace.organisationId, 'screening_save', { id: saved?.id, version: saved?.version, profile: draft })
      if (active.current) onSaved()
    } catch (failure) { if (active.current) setError(failure.message) } finally { if (active.current) setBusy(false) }
  }
  return <form onSubmit={save} className="space-y-4 rounded-xl border bg-white p-4">
    <h3 className="text-lg font-semibold">{saved ? 'Edit property screening' : 'Set up property screening'}</h3>
    <p className="text-sm text-slate-600">Saving switches screening off. Review the exact property terms and approved opening message, then enable future enquiries separately.</p>
    <fieldset disabled={busy} className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1 text-sm font-medium">Who can receive screening?<select className={inputClass} value={draft.deliveryMode} onChange={event => change('deliveryMode', event.target.value)}><option value="test">Test recipient only</option><option value="live">Future property enquiries</option></select></label>
      {draft.deliveryMode === 'test' ? <label className="grid gap-1 text-sm font-medium">Test recipient mobile number<input required type="tel" placeholder="+27821234567" className={inputClass} value={draft.testPhone} onChange={event => change('testPhone', event.target.value)} /><span className="text-xs font-normal text-slate-600">Only enquiries using this number can start screening. Other leads keep their usual workflow.</span></label> : <p className="text-sm text-amber-900">When enabled, this property can screen future enquiries with recorded WhatsApp permission. Save and review before enabling.</p>}
      <label className="grid gap-1 text-sm font-medium">Property<select required className={inputClass} value={draft.listingId} onChange={event => setDraft(draftFor(listings.find(row => row.id === event.target.value)))}><option value="">Choose a saved listing</option>{listings.map(row => <option key={row.id} value={row.id}>{row.title} · {row.listing_category === 'rental' ? 'Tenant' : 'Buyer'}</option>)}</select></label>
      <label className="grid gap-1 text-sm font-medium">Shared company WhatsApp number<select required className={inputClass} value={draft.senderId} onChange={event => setDraft(old => ({ ...old, senderId: event.target.value, template: null, values: {} }))}><option value="">Choose connected company number</option>{workspace.senders.filter(row => !row.owner_user_id && row.connection_status === 'connected').map(row => <option key={row.id} value={row.id}>{row.display_phone_number || row.business_display_name || 'Company WhatsApp'}</option>)}</select></label>
      {draft.listingId ? <p className="text-sm md:col-span-2">{draft.kind === 'tenant' ? 'Tenant' : 'Buyer'} screening · Saved {draft.kind === 'tenant' ? 'monthly rental' : 'asking price'}: R {Number(draft.context.price).toLocaleString('en-ZA')} · {draft.context.location}. Update the listing first if these details are wrong.</p> : null}
      {keys.map(key => <label key={key} className={`grid gap-1 text-sm font-medium ${['conditions', 'fees', 'petPolicy', 'retention'].includes(key) ? 'md:col-span-2' : ''}`}>{contextFields[key]}
        {['conditions', 'fees', 'petPolicy', 'retention'].includes(key) ? <textarea required rows={3} maxLength={1800} className={inputClass} value={draft.context[key] || ''} onChange={event => context(key, event.target.value)} /> : <input required type={['rates', 'levy', 'deposit'].includes(key) ? 'number' : key === 'privacyUrl' ? 'url' : 'text'} min="0" step="0.01" className={inputClass} value={draft.context[key] ?? ''} onChange={event => context(key, event.target.value)} />}
      </label>)}
      <label className="grid gap-1 text-sm font-medium md:col-span-2">Meta-approved opening template<select required disabled={!draft.senderId || loading} className={inputClass} value={draft.template?.id || ''} onChange={event => setDraft(old => ({ ...old, template: templates.find(row => row.id === event.target.value) || null, values: {} }))}><option value="">{loading ? 'Loading approved templates…' : 'Choose opening template'}</option>{templates.map(row => <option key={row.id} value={row.id}>{row.name} · {row.language}</option>)}</select><span className="text-xs font-normal text-slate-600">Include the property/reference and instructions to reply START, AGENT or STOP. Submit a template in WhatsApp Manager if no suitable approved one exists.</span></label>
      {draft.template ? definition.fields.map(field => <label key={field.key} className="grid gap-1 text-sm font-medium">{field.label}<select className={inputClass} value={draft.values[field.key]?.source || ''} onChange={event => change('values', { ...draft.values, [field.key]: { source: event.target.value, text: '' } })}><option value="">Choose value</option>{[['property', 'Property name/reference'], ['location', 'Property location'], ['agency', 'Agency legal name'], ['question_count', 'Maximum question count'], ['first_name', 'Contact first name'], ['full_name', 'Contact full name'], ['text', 'Fixed text']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{draft.values[field.key]?.source === 'text' ? <input required aria-label={`${field.label} fixed text`} className={inputClass} value={draft.values[field.key].text} onChange={event => change('values', { ...draft.values, [field.key]: { source: 'text', text: event.target.value } })} /> : null}</label>) : null}
    </fieldset>
    {opening ? <div className="rounded-lg bg-emerald-50 p-3 text-sm"><h4 className="font-semibold">Actual opening template preview</h4><p className="mt-2 whitespace-pre-wrap">{opening}</p></div> : null}
    {contextReady ? <ScreeningPreview key={`${draft.kind}:${draft.listingId}`} profile={draft} /> : <p className="text-sm text-slate-600">Complete the property terms above to preview the exact question sequence.</p>}
    <p className="text-sm text-slate-600">Messages require recorded WhatsApp permission for this sender. Identity documents use the agency’s secure upload process; requesting a link creates agent follow-up. Screening does not book viewings, reject applicants, run credit checks or approve finance.</p>
    {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : null}
    <div className="flex gap-3"><Button type="submit" disabled={busy || loading}>{busy ? 'Saving…' : ready ? 'Save switched off' : 'Check and save switched off'}</Button><Button variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button></div>
  </form>
}

export function WhatsAppScreeningSessions({ organisationId, conversationId = '', leadId = '', revision = 0 }) {
  const [sessions, setSessions] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(''), [refresh, setRefresh] = useState(0)
  const scope = `${organisationId}:${conversationId}:${leadId}`
  const [loadedScope, setLoadedScope] = useState('')
  const active = useRef(true), lock = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    let cancelled = false
    setLoading(true); setSessions([]); setError('')
    metaIntegrationRequest(organisationId, 'screening_sessions', { conversationId: conversationId || undefined, leadId: leadId || undefined })
      .then(data => { if (!cancelled) { setSessions(data.sessions || []); setLoadedScope(`${organisationId}:${conversationId}:${leadId}`) } })
      .catch(failure => { if (!cancelled) setError(failure.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [organisationId, conversationId, leadId, revision, refresh])
  async function control(session, operation) {
    if (lock.current) return
    lock.current = true; setBusy(session.id); setError('')
    try {
      await metaIntegrationRequest(organisationId, `screening_${operation}`, { id: session.id, version: session.version })
      if (active.current) setRefresh(v => v + 1)
    } catch (failure) { if (active.current) setError(failure.message) } finally { lock.current = false; if (active.current) setBusy('') }
  }
  return <section className="space-y-3" aria-label="WhatsApp screening answers"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Screening progress and answers</h3><Button size="sm" variant="secondary" disabled={loading || Boolean(busy)} onClick={() => setRefresh(v => v + 1)}>Refresh screening</Button></div>
    {loading ? <p role="status" className="text-sm">Loading saved screening…</p> : null}
    {error ? <p role="alert" className="text-sm text-red-800">Screening is unavailable: {error}</p> : null}
    {!loading && !error && !sessions.length ? <p className="text-sm text-slate-600">No screening is recorded in your current scope.</p> : null}
    {(loadedScope === scope ? sessions : []).map(session => <article key={session.id} className="space-y-2 rounded-lg border bg-white p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{session.context_snapshot.propertyLabel}</strong><span>{session.status.replaceAll('_', ' ')} · {Object.keys(session.answers).length} answers saved</span></div>
      {session.reason ? <p className="text-amber-900">{session.reason}</p> : null}
      <Link className="text-blue-800 underline" to={session.kind === 'tenant' ? `/agent/rentals/pipeline/leads/${session.lead_id}` : `/agency/leads/${session.lead_id}`}>Open {session.kind === 'tenant' ? 'tenant' : 'buyer'} lead</Link>
      <details><summary className="cursor-pointer font-medium">Review saved answers</summary><dl className="mt-3 space-y-3">{screeningQuestions(session.kind, session.context_snapshot).filter(q => Object.hasOwn(session.answers, q.key)).map(q => <div key={q.key}><dt className="whitespace-pre-wrap text-slate-600">{q.label}</dt><dd className="mt-1 whitespace-pre-wrap font-medium">{screeningAnswerText(session.answers[q.key])}</dd></div>)}</dl><p className="mt-3 text-xs text-slate-500">Recorded answers support agent review. Identity, credit checks and viewing confirmation remain separate.</p></details>
      {!['completed', 'handoff', 'stopped'].includes(session.status) ? <div className="flex flex-wrap gap-2">{['active', 'awaiting_start', 'queued'].includes(session.status) ? <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => void control(session, 'pause')}>Pause bot</Button> : null}{session.status === 'paused' ? <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => void control(session, 'resume')}>Invite to resume</Button> : null}{session.status === 'blocked' && !session.last_prompt_id ? <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => void control(session, 'retry')}>Recheck opening</Button> : null}<Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => void control(session, 'handoff')}>Hand over to agent</Button></div> : null}
    </article>)}
  </section>
}

export default function WhatsAppScreening({ workspace }) {
  const [profiles, setProfiles] = useState([]), [listings, setListings] = useState([]), [editor, setEditor] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(''), [confirmed, setConfirmed] = useState({}), [revision, setRevision] = useState(0)
  const active = useRef(true), lock = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    Promise.all([metaIntegrationRequest(workspace.organisationId, 'screening_list'), metaIntegrationRequest(workspace.organisationId, 'screening_listings')])
      .then(([rules, choices]) => { if (!cancelled) { setProfiles(rules.profiles || []); setListings(choices.listings || []) } })
      .catch(failure => { if (!cancelled) { setProfiles([]); setError(failure.message) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [workspace.organisationId, revision])
  async function toggle(profile) {
    if (lock.current) return
    lock.current = true; setBusy(profile.id); setError('')
    try {
      await metaIntegrationRequest(workspace.organisationId, profile.enabled ? 'screening_disable' : 'screening_enable', { id: profile.id, version: profile.version, confirmed: confirmed[profile.id] === true })
      if (active.current) { setRevision(v => v + 1); setConfirmed({}) }
    } catch (failure) { if (active.current) setError(failure.message) } finally { lock.current = false; if (active.current) setBusy('') }
  }
  return <section className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4" aria-label="Automatic lead screening"><header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Automatic buyer and tenant screening</h2><p className="mt-1 max-w-3xl text-sm text-slate-600">Ask the property’s questions one at a time in WhatsApp, save progress and send the answers to the assigned agent for review.</p></div><Button disabled={loading || Boolean(busy)} onClick={() => setEditor({ id: 'new' })}>Set up property screening</Button></header>
    {error ? <p role="alert" className="text-sm text-red-800">Screening setup is unavailable: {error}</p> : null}
    {loading ? <p role="status">Loading screening settings…</p> : null}
    {editor ? <ScreeningEditor key={editor.id} workspace={workspace} saved={editor.id === 'new' ? null : editor} listings={listings} onCancel={() => setEditor(null)} onSaved={() => { setEditor(null); setRevision(v => v + 1) }} /> : null}
    {profiles.map(profile => <article key={profile.id} className="space-y-3 rounded-lg border bg-white p-4"><div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{profile.config.context.propertyLabel} · {profile.kind === 'tenant' ? 'Tenant' : 'Buyer'} · {profile.enabled ? 'On' : 'Off'}</h3><p className="text-sm text-slate-600">{profile.config.deliveryMode === 'live' ? 'Future enquiries for this property.' : `Test recipient only: +${profile.config.testPhone || 'not configured'}.`} Missing permission or changed property/sender details block automatic sending.</p></div><Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => setEditor(profile)}>Edit screening</Button></div>
      {!profile.enabled ? <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed[profile.id] === true} onChange={event => setConfirmed(old => ({ ...old, [profile.id]: event.target.checked }))} />I reviewed the property terms and opening template, and allow {profile.config.deliveryMode === 'live' ? 'automatic screening for future enquiries' : `screening only for +${profile.config.testPhone || 'the configured test recipient'}`}.</label> : null}
      <Button size="sm" variant="secondary" disabled={Boolean(busy) || !profile.enabled && !confirmed[profile.id]} onClick={() => void toggle(profile)}>{profile.enabled ? 'Switch screening off' : profile.config.deliveryMode === 'live' ? 'Enable future enquiries' : 'Enable test recipient'}</Button>
    </article>)}
    <WhatsAppScreeningSessions key={workspace.accessScope || workspace.organisationId} organisationId={workspace.organisationId} revision={revision} />
  </section>
}
