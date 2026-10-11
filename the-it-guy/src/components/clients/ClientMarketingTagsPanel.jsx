import { Plus, RotateCw, Tags, UsersRound, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '../ui/Button'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { getClientAudienceMemberships, getClientMarketingWorkspace, saveClientMarketingTags } from '../../services/emailCampaignService'

export default function ClientMarketingTagsPanel({ client }) {
  const [tags, setTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(Boolean(isSupabaseConfigured && client.organisationId && client.email))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saveError, setSaveError] = useState('')
  const [savedAudiences, setSavedAudiences] = useState([])
  const [audiences, setAudiences] = useState([])
  const [audienceLoading, setAudienceLoading] = useState(loading)
  const [audienceError, setAudienceError] = useState('')
  const generation = useRef(0)
  const audienceGeneration = useRef(0)
  const organisationId = client.organisationId
  const email = client.email
  const available = Boolean(isSupabaseConfigured && organisationId && email)
  const loadAudiences = useCallback(async (marketingContact, definitions, request) => {
    const audienceRequest = ++audienceGeneration.current
    setAudienceLoading(true); setAudienceError('')
    try {
      const memberships = await getClientAudienceMemberships({ organisationId, marketingContact, savedAudiences: definitions })
      if (request === generation.current && audienceRequest === audienceGeneration.current) setAudiences(memberships)
    } catch (cause) {
      if (request === generation.current && audienceRequest === audienceGeneration.current) { setAudiences([]); setAudienceError(cause.message || 'Unable to load audience memberships.') }
    } finally { if (request === generation.current && audienceRequest === audienceGeneration.current) setAudienceLoading(false) }
  }, [organisationId])
  const refresh = useCallback(async () => {
    const request = ++generation.current
    setError(''); setSaveError(''); setNotice(''); setLoading(true); setAudienceLoading(true); setAudienceError('')
    try {
      if (!isSupabaseConfigured || !organisationId || !email) { setTags([]); setAudiences([]); setAudienceLoading(false); return }
      const result = await getClientMarketingWorkspace({ organisationId, email })
      if (request !== generation.current) return
      setTags(result.marketingContact?.tags || [])
      setSavedAudiences(result.savedAudiences || [])
      setLoading(false)
      await loadAudiences(result.marketingContact, result.savedAudiences || [], request)
    } catch (cause) {
      if (request === generation.current) { setError(cause.message || 'Unable to load client tags.'); setAudienceError('Unable to load audience memberships. Refresh to try again.'); setAudienceLoading(false) }
    }
    finally { if (request === generation.current) setLoading(false) }
  }, [organisationId, email, loadAudiences])
  useEffect(() => {
    setTags([]); setTagInput(''); setSaving(false); setSavedAudiences([]); setAudiences([])
    void refresh()
    return () => { generation.current += 1 }
  }, [refresh, client.identityVersion])
  function addTag() {
    const value = tagInput.trim().toLowerCase()
    if (!value) return
    setTags(previous => previous.includes(value) ? previous : [...previous, value])
    setTagInput(''); setNotice('')
  }
  async function save() {
    const request = generation.current
    setSaving(true); setSaveError(''); setNotice('')
    try {
      const contact = await saveClientMarketingTags({ organisationId, client, tags })
      if (request !== generation.current) return
      setTags(contact.tags || []); setNotice('Client tags saved.')
      await loadAudiences(contact, savedAudiences, request)
    } catch (cause) { if (request === generation.current) setSaveError(cause.message || 'Unable to save client tags.') }
    finally { if (request === generation.current) setSaving(false) }
  }
  const disabled = !available || loading || saving || Boolean(error)
  return <div className="grid min-w-0 gap-5 xl:grid-rows-[minmax(min-content,1.3fr)_minmax(min-content,1fr)]">
    <section aria-label="Client marketing tags" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[#e0e7e3] bg-white p-5 sm:p-6">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eff5f1] text-[#49705c]"><Tags size={18} /></span>
        <div className="min-w-0"><h3 className="text-base font-semibold tracking-tight text-[#243c2f]">Bulk-email tags</h3><p className="mt-0.5 text-xs text-[#63766a]">Organise your email audiences</p></div>
      </div>
      <Button variant="ghost" size="sm" className="h-9 w-9 shrink-0 px-0" aria-label="Refresh tags" title="Refresh tags" disabled={!available || loading || saving} onClick={() => void refresh()}><RotateCw size={15} /></Button>
    </div>
    {!email ? <p className="text-sm text-[#7f5b16]">Add an email address to this client before assigning marketing tags.</p> : null}
    {email && !available ? <p className="text-sm text-[#7f5b16]">Marketing tags require a workspace database connection.</p> : null}
    {loading ? <p role="status" className="text-sm text-[#637890]">Loading client tags…</p> : null}
    {tags.length ? <div className="flex flex-wrap gap-2">{tags.map(tag => <button type="button" key={tag} className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg bg-[#edf4ee] px-3 py-2 text-xs font-medium text-[#42634d] transition-colors hover:bg-[#dfece1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176b50] disabled:opacity-50" disabled={disabled} onClick={() => { setTags(previous => previous.filter(item => item !== tag)); setNotice('') }}><span className="break-all">{tag}</span><X aria-hidden="true" size={12} className="shrink-0" /><span className="sr-only">Remove {tag}</span></button>)}</div> : !loading && !error ? <div className="rounded-xl border border-dashed border-[#dce6de] bg-[#fafcf9] px-4 py-3"><p className="text-sm font-medium text-[#657a69]">No tags yet.</p><p className="mt-1 text-xs text-[#64776a]">Add a tag to group this client.</p></div> : null}
    <div className="flex min-w-0 flex-wrap gap-2">
      <label className="min-w-0 flex-1"><span className="sr-only">Add a client tag</span><input className="block min-h-10 w-full min-w-0 rounded-lg border border-[#e0e7e2] bg-white px-3 text-sm text-[#334b3e] placeholder:text-[#728176] focus:border-[#176b50] focus:outline-none focus:ring-1 focus:ring-[#176b50] disabled:bg-[#f8faf8]" value={tagInput} onChange={event => setTagInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} placeholder="e.g. show-day" disabled={disabled} /></label>
      <Button className="px-3 shadow-none" size="sm" variant="secondary" onClick={addTag} disabled={disabled || !tagInput.trim()}><Plus aria-hidden="true" size={14} />Add tag</Button>
    </div>
    {error || saveError ? <p role="alert" className="break-words text-sm text-[#b42318]">{error || saveError}</p> : null}
    {notice ? <p role="status" className="text-sm text-[#1767b4]">{notice}</p> : null}
    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1ee] pt-3">
      <p className="text-xs text-[#63766a]">{tags.length} {tags.length === 1 ? 'tag' : 'tags'}</p>
      <Button size="sm" className="shadow-none" onClick={() => void save()} disabled={disabled}>{saving ? 'Saving…' : 'Save tags'}</Button>
    </div>
    <details className="text-xs text-[#63766a]"><summary className="cursor-pointer font-medium hover:text-[#354a41]">About audience tags</summary><p className="mt-2 leading-5">Tags organise audiences. They never override consent, unsubscribe, suppression, or subscription checks.</p>{available ? <p className="mt-2 break-words leading-5">Tags apply to {email}.</p> : null}</details>
    </section>
    <section aria-label="Client audiences" aria-busy={audienceLoading} className="flex min-w-0 flex-col gap-4 rounded-2xl border border-[#e0e7e3] bg-white p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eff5f1] text-[#49705c]"><UsersRound size={18} /></span>
        <div className="min-w-0 flex-1"><h3 className="text-base font-semibold tracking-tight text-[#243c2f]">Audiences</h3><p className="mt-0.5 text-xs text-[#63766a]">Audiences this client belongs to</p></div>
        {available && !audienceLoading && !audienceError ? <span className="rounded-full bg-[#eff5f1] px-2.5 py-1 text-xs font-semibold text-[#49705c]" aria-label={`${audiences.length} audiences`}>{audiences.length}</span> : null}
      </div>
      {!available ? <p className="text-sm text-[#63766a]">{!email ? 'Add an email address to see audience memberships.' : 'Audience memberships require a workspace database connection.'}</p>
        : audienceLoading ? <p role="status" className="text-sm text-[#63766a]">Loading audiences…</p>
          : audienceError ? <p role="alert" className="break-words text-sm text-[#b42318]">{audienceError}</p>
            : audiences.length ? <ul className="space-y-2">{audiences.map(audience => <li key={audience.id} className="rounded-xl border border-[#e7ede8] bg-[#fafcf9] px-3 py-2.5"><p className="break-words text-sm font-medium text-[#334b3e]">{audience.name}</p>{audience.description ? <p className="mt-1 break-words text-xs leading-5 text-[#63766a]">{audience.description}</p> : null}</li>)}</ul>
              : <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[#dce6de] bg-[#fafcf9] px-4 py-4 text-center"><UsersRound aria-hidden="true" size={22} className="text-[#b0c0b2]" /><p className="mt-2 text-sm font-medium text-[#657a69]">No audience memberships yet</p><p className="mt-1 text-xs leading-5 text-[#64776a]">Matching audiences appear here automatically.</p></div>}
    </section>
  </div>
}
