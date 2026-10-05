import { useEffect, useRef, useState } from 'react'
import { createRecruitmentIntakeLink, listRecruitmentIntakeLinks, revokeRecruitmentIntakeLink } from '../../services/recruitmentIntakeService'
export default function RecruitmentIntakeLinks({ organisationId, leadId, eligible = true }) {
  const [links, setLinks] = useState([]), [created, setCreated] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0), [copied, setCopied] = useState(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true; let active = true
    if (organisationId) listRecruitmentIntakeLinks(organisationId, leadId).then((rows) => { if (active) { setLinks(rows); setError('') } }).catch((failure) => { if (active) setError(failure.message) })
    return () => { active = false; mounted.current = false }
  }, [organisationId, leadId, reload])
  async function create(channel) {
    setBusy(true); setError(''); setCopied(false)
    try {
      const result = await createRecruitmentIntakeLink(organisationId, channel, leadId)
      if (mounted.current) { setCreated(result); setReload((value) => value + 1) }
    } catch (failure) { if (mounted.current) setError(failure.message) }
    finally { if (mounted.current) setBusy(false) }
  }
  async function revoke(id) {
    setBusy(true); setError('')
    try {
      await revokeRecruitmentIntakeLink(organisationId, id)
      if (mounted.current) { if (created?.id === id) setCreated(null); setReload((value) => value + 1) }
    } catch (failure) { if (mounted.current) setError(failure.message) }
    finally { if (mounted.current) setBusy(false) }
  }
  if (!organisationId) return null
  const active = links.filter((link) => !link.revoked_at && !link.submitted_at && new Date(link.expires_at) > new Date())
  return <section className="rounded-2xl border border-[#dbe7f2] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-semibold text-[#20364c]">{leadId ? 'Join Us invitation' : 'Recruitment intake links'}</h2><p className="mt-1 text-sm text-[#60758b]">{leadId ? 'Create a private link for this lead. Their application updates this record.' : 'Use the public link in campaigns and the website link for your website’s Join Us button or embedded form.'}</p></div><div className="flex flex-wrap gap-2">{(leadId ? [['private_link','Create private link']] : [['public_link','Create public link'],['website','Create website link']]).map(([channel,label]) => <button key={channel} type="button" disabled={busy || !eligible} onClick={() => create(channel)} className="rounded-xl border border-[#dbe4ee] px-4 py-3 text-sm font-semibold text-[#405b75] disabled:opacity-50">{busy ? 'Working…' : label}</button>)}</div></div>{!eligible && <p className="mt-3 text-xs text-[#7890a8]">Applications are accepted while the lead is at Lead Received. Save any edits before creating a link.</p>}{error && <p role="alert" className="mt-4 text-sm text-[#9f3028]">{error}<button className="ml-3 underline" disabled={busy} onClick={() => setReload((value) => value + 1)}>Retry</button></p>}{created && <div className="mt-4 rounded-xl bg-[#f4f8fb] p-4"><label className="text-sm font-semibold text-[#405b75]">Copy this link<input readOnly aria-label="Generated Join Us link" className="mt-2 w-full rounded-lg border border-[#dbe4ee] bg-white p-3 text-sm" value={created.url} onFocus={(event) => event.target.select()} /></label><p className="mt-2 text-xs text-[#60758b]">Copy it now; the address is only shown when created. Expires {new Date(created.expires_at).toLocaleDateString('en-ZA')}. Creating a link does not send an email.</p><button type="button" className="mt-3 text-sm font-semibold text-[#315b7a]" onClick={async () => { try { await navigator.clipboard.writeText(created.url); setCopied(true) } catch { setCopied(false) } }}>{copied ? 'Copied' : 'Copy link'}</button></div>}{active.length > 0 && <ul className="mt-4 space-y-2">{active.map((link) => <li key={link.id} className="flex flex-wrap justify-between gap-3 border-t border-[#edf2f7] pt-3 text-xs text-[#60758b]"><span>{link.channel === 'website' ? 'Website intake' : link.channel === 'public_link' ? 'Public link' : 'Private invitation'} · Expires {new Date(link.expires_at).toLocaleDateString('en-ZA')}</span><button type="button" className="font-semibold text-[#9f3028]" disabled={busy} onClick={() => revoke(link.id)}>Revoke link</button></li>)}</ul>}</section>
}
