import { useRef, useState } from 'react'
import { Copy, Download, ExternalLink, IdCard, Mail, MessageCircle, Pencil, Phone, QrCode, X } from 'lucide-react'

const controlClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50'
const buttonClass = `${controlClass} border-[#dde4ee] bg-white text-[#253d55] hover:bg-[#f7fafc]`
const primaryClass = `${controlClass} border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800`
const number = new Intl.NumberFormat('en-ZA')
const text = (value) => String(value ?? '').trim()

function buildDashboardCardDraft(agent = {}, link = null) {
  return {
    name: text(agent.name), jobTitle: text(agent.jobTitle), email: text(agent.email),
    phone: text(agent.phone), whatsapp: text(agent.whatsapp ?? agent.phone), avatarUrl: text(agent.avatarUrl),
    heading: text(link?.heading), introduction: text(link?.introduction),
    buyerCtaLabel: text(link?.buyerCtaLabel) || 'I am looking to buy',
    sellerCtaLabel: text(link?.sellerCtaLabel) || 'I am looking to sell',
    buyEnabled: (link?.enabledIntents || ['buy', 'sell']).includes('buy'),
    sellEnabled: (link?.enabledIntents || ['buy', 'sell']).includes('sell'),
  }
}

export default function AgentDigitalCardPanel({
  loading = false, error = '', link = null, agent = {}, organisationName = '', shareUrl = '', urls = {},
  insights = null, feedback = '', busyAction = '', canManage = false, onSave,
  onCopy, onOpenPreview, onShareWhatsApp, onDownloadVcard, onDownloadQr,
}) {
  const formRef = useRef(null)
  const [draft, setDraft] = useState(null)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [failedAvatar, setFailedAvatar] = useState('')
  const active = Boolean(link?.id && link.status === 'active' && shareUrl)
  const features = link?.agentDigitalCard?.features || {}
  const display = draft || agent
  const avatarUrl = /^https?:\/\//i.test(display.avatarUrl || '') ? display.avatarUrl : ''
  const initials = (display.name || 'Agent').split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  const disabled = loading || saving || Boolean(busyAction)
  const stats = [ ['Card views', 'views'], ['Contact clicks', 'contactClicks'], ['WhatsApp clicks', 'whatsappClicks'], ['Buyer enquiries', 'buyerLeads'], ['Seller enquiries', 'sellerLeads'], ['Listing clicks', 'listingClicks'] ]
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }))
  async function save(status) {
    if (!draft || saving) return
    if (formRef.current && !formRef.current.reportValidity()) return
    if (!draft.name.trim()) { setSaveError('Add a display name for your card.'); return }
    if (!draft.buyEnabled && !draft.sellEnabled) { setSaveError('Enable at least one enquiry action.'); return }
    if (draft.avatarUrl && !/^https?:\/\//i.test(draft.avatarUrl)) { setSaveError('Use an http or https URL for your photo.'); return }
    setSaving(true)
    setSaveError('')
    try {
      await onSave(draft, status)
      setDraft(null)
    } catch (saveFailure) {
      setSaveError(saveFailure?.message || 'Your card could not be saved. Try again.')
    } finally { setSaving(false) }
  }
  const startEditing = () => { setSaveError(''); setDraft(buildDashboardCardDraft(agent, link)) }

  return (
    <section aria-label="My digital business card" className="mt-6 overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e8eef4] px-5 py-5 sm:px-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium tracking-tight text-[#162334]"><IdCard size={20} className="text-emerald-700" /> My digital business card</h2>
          <p className="mt-1 text-sm text-[#71849a]">Your profile, enquiries and sharing tools in one place.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{loading ? 'Loading…' : active ? 'Active' : link?.status === 'draft' ? 'Draft' : link ? 'Inactive' : 'Not set up'}</span>
          {canManage && !draft ? <button className={active ? buttonClass : primaryClass} disabled={disabled} onClick={startEditing}><Pencil size={15} />{link ? 'Edit card' : 'Set up card'}</button> : null}
        </div>
      </header>
      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <article className="min-w-0 rounded-2xl border border-[#dce8e2] bg-[#f6faf8] p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-emerald-100 bg-white text-2xl font-medium text-emerald-800">
              {avatarUrl && failedAvatar !== avatarUrl ? <img src={avatarUrl} alt={`${display.name || 'Agent'} profile`} className="h-full w-full object-cover" onError={() => setFailedAvatar(avatarUrl)} /> : <span aria-label="Profile initials">{initials}</span>}
            </div>
            <div className="min-w-0">
              <h3 className="break-words text-xl font-medium tracking-tight text-[#162334]">{display.name || 'Agent'}</h3>
              <p className="mt-1 text-sm text-[#536b61]">{display.jobTitle || 'Property Practitioner'}</p>
              <p className="mt-1 text-sm text-[#7a8d83]">{organisationName || 'Agency'}</p>
            </div>
          </div>
          {(draft ? draft.introduction : link?.introduction) ? <p className="mt-5 text-sm leading-6 text-[#536b61]">{draft ? draft.introduction : link.introduction}</p> : null}
          <div className="mt-5 grid gap-2 border-t border-[#dce8e2] pt-4 text-sm text-[#536b61]">
            {display.email ? <a href={`mailto:${display.email}`} className="flex items-center gap-2 break-all"><Mail size={15} className="shrink-0" />{display.email}</a> : null}
            {display.phone ? <a href={`tel:${display.phone}`} className="flex items-center gap-2"><Phone size={15} />{display.phone}</a> : null}
            {!display.email && !display.phone ? <p>Add your contact details when setting up your card.</p> : null}
          </div>
          {!active && !draft ? <p className="mt-5 text-sm leading-6 text-[#71849a]">{canManage ? 'Add your photo and details, then activate your card here to start sharing.' : 'Your principal or admin can activate your card. Your sharing tools will appear here when it is ready.'}</p> : null}
        </article>
        <div className="flex min-w-0 flex-col">
          {error ? <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
          {draft ? (
            <form ref={formRef} onSubmit={(event) => { event.preventDefault(); void save('active') }} aria-label="Digital card setup">
              <div className="mb-4 flex items-center justify-between"><h3 className="font-medium text-[#162334]">{link ? 'Edit your card' : 'Set up your card'}</h3><button type="button" aria-label="Close card setup" disabled={saving} onClick={() => setDraft(null)} className="rounded-lg p-2 text-slate-500"><X size={18} /></button></div>
              <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">
                {[[ 'name', 'Display name', 'text' ], [ 'jobTitle', 'Job title', 'text' ], [ 'email', 'Email', 'email' ], [ 'phone', 'Phone', 'tel' ], [ 'whatsapp', 'WhatsApp', 'tel' ], [ 'avatarUrl', 'Profile photo URL', 'url' ], [ 'heading', 'Card heading', 'text' ], [ 'buyerCtaLabel', 'Buyer button label', 'text' ], [ 'sellerCtaLabel', 'Seller button label', 'text' ]].map(([key, label, type]) => (
                  <label key={key} className="grid gap-1.5 text-sm text-[#53677e]">{label}<input type={type} required={key === 'name'} value={draft[key]} onChange={(event) => update(key, event.target.value)} className="min-h-11 w-full rounded-xl border border-[#dde4ee] bg-white px-3 text-[#162334] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>
                ))}
                <label className="grid gap-1.5 text-sm text-[#53677e] sm:col-span-2">Personal introduction<textarea rows={3} value={draft.introduction} onChange={(event) => update('introduction', event.target.value)} className="w-full rounded-xl border border-[#dde4ee] p-3 text-[#162334] outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100" /></label>
                {[[ 'buyEnabled', 'Buyer enquiries' ], [ 'sellEnabled', 'Seller enquiries' ]].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm text-[#53677e]"><input type="checkbox" checked={draft[key]} onChange={(event) => update(key, event.target.checked)} className="accent-emerald-700" />{label}</label>)}
              </fieldset>
              {saveError ? <p role="alert" className="mt-3 text-sm text-red-700">{saveError}</p> : null}
              <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} className={buttonClass} onClick={() => setDraft(null)}>Cancel</button><button type="button" disabled={saving} className={buttonClass} onClick={() => void save('draft')}>Save draft</button><button disabled={saving} className={primaryClass} type="submit">{saving ? 'Saving…' : active ? 'Save changes' : 'Activate card'}</button></div>
            </form>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-medium text-[#253d55]">Card performance</h3><span className="text-xs text-[#71849a]">Last {insights?.windowDays || 30} days</span></div>
              <dl className="mt-3 grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
                {stats.map(([label, key]) => <div key={key} className="rounded-xl border border-[#e8eef4] p-3"><dt className="text-xs text-[#71849a]">{label}</dt><dd className="mt-1 text-xl font-medium tabular-nums text-[#162334]">{insights?.summary && !insights.missingSchema ? number.format(insights.summary[key] || 0) : '—'}</dd></div>)}
              </dl>
              {!insights?.summary || insights?.missingSchema ? <p className="mt-2 text-xs text-[#71849a]">{active ? 'Card statistics are currently unavailable.' : 'Statistics will appear once your card is active and receives visits.'}</p> : null}
              {active ? <>
                <div className="mt-5 rounded-xl border border-[#e8eef4] bg-[#f9fbfc] p-3"><p className="text-xs text-[#71849a]">Your card link</p><a href={shareUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all text-sm text-emerald-700">{shareUrl}</a></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {features.share !== false ? <button disabled={disabled} className={buttonClass} onClick={() => onCopy(shareUrl, 'Card link copied')}><Copy size={16} />Copy link</button> : null}
                  <button disabled={disabled} className={buttonClass} onClick={onOpenPreview}><ExternalLink size={16} />Preview card</button>
                  {features.share !== false ? <button disabled={disabled} className={buttonClass} onClick={onShareWhatsApp}><MessageCircle size={16} />Share on WhatsApp</button> : null}
                  {features.qr !== false ? <button disabled={disabled} className={buttonClass} onClick={onDownloadQr}><QrCode size={16} />{busyAction === 'qr' ? 'Preparing…' : 'Download QR'}</button> : null}
                  {features.vcf !== false ? <button disabled={disabled} className={`${buttonClass} sm:col-span-2`} onClick={onDownloadVcard}><Download size={16} />Download contact</button> : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-emerald-700">
                  {link.enabledIntents?.includes('buy') && urls.buyerUrl ? <a href={urls.buyerUrl} target="_blank" rel="noreferrer">Buyer enquiry ↗</a> : null}
                  {link.enabledIntents?.includes('sell') && urls.sellerUrl ? <a href={urls.sellerUrl} target="_blank" rel="noreferrer">Seller enquiry ↗</a> : null}
                </div>
              </> : null}
            </>
          )}
          <p role="status" aria-live="polite" className={`${feedback ? 'mt-3' : ''} text-sm text-emerald-700`}>{feedback}</p>
        </div>
      </div>
    </section>
  )
}
