import { useCallback, useEffect, useRef, useState } from 'react'
import Button from '../ui/Button'
import { campaignResponseLabel, CLIENT_CAMPAIGN_RESPONSE_TYPES, loadClientCampaigns, logClientCampaignResponse } from '../../services/clientCampaignService'

const formatTime = value => new Date(value).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' })
const localTime = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
function ResponseForm({ client, campaign, onSaved, onCancel }) {
  const [kind, setKind] = useState('email_reply')
  const [detail, setDetail] = useState('')
  const [time, setTime] = useState(localTime)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const command = useRef(null)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  async function save(event) {
    event.preventDefault()
    const date = new Date(time)
    if (!Number.isFinite(date.getTime())) { setError('Enter a valid response time.'); return }
    const entry = { recipientId: campaign.id, kind, detail, occurredAt: date.toISOString() }
    const fingerprint = JSON.stringify(entry)
    if (command.current?.fingerprint !== fingerprint) command.current = { fingerprint, requestId: crypto.randomUUID() }
    setSaving(true); setError('')
    try {
      await logClientCampaignResponse(client, { ...entry, requestId: command.current.requestId })
      if (mounted.current) await onSaved()
    } catch (cause) { if (mounted.current) setError(cause.message || 'Unable to save this response. You can retry the same entry.') }
    finally { if (mounted.current) setSaving(false) }
  }
  return <form aria-label={`Record response for ${campaign.campaign_name}`} onSubmit={save} className="mt-4 min-w-0 space-y-3 rounded-xl bg-[#f8fafc] p-3">
    <p className="text-sm text-[#40586f]">Record a response you have confirmed belongs to this campaign. Add how you verified it.</p>
    <label className="block text-sm text-[#40586f]">Response type<select value={kind} onChange={event => setKind(event.target.value)} disabled={saving} className="mt-1 block w-full rounded-lg border border-[#d7e3ef] p-2">{CLIENT_CAMPAIGN_RESPONSE_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    <label className="block text-sm text-[#40586f]">Response time<input type="datetime-local" value={time} onChange={event => setTime(event.target.value)} required disabled={saving} className="mt-1 block w-full min-w-0 rounded-lg border border-[#d7e3ef] p-2" /></label>
    <label className="block text-sm text-[#40586f]">Response details<textarea value={detail} onChange={event => setDetail(event.target.value)} required maxLength={4000} rows={3} disabled={saving} className="mt-1 block w-full rounded-lg border border-[#d7e3ef] p-2" /></label>
    {error ? <p role="alert" className="break-words text-sm text-[#b42318]">{error}</p> : null}
    <div className="flex flex-wrap gap-2"><Button type="submit" className="max-w-full whitespace-normal" disabled={saving || !detail.trim()}>{saving ? 'Saving…' : 'Save confirmed response'}</Button><Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button></div>
  </form>
}
export default function ClientCampaignPanel({ client, onChanged, previewData }) {
  const [campaigns, setCampaigns] = useState([])
  const [summary, setSummary] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [available, setAvailable] = useState(Boolean(client.identityId))
  const [loading, setLoading] = useState(Boolean(client.identityId))
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [notice, setNotice] = useState('')
  const generation = useRef(0)
  const identityId = client.identityId
  const organisationId = client.organisationId
  const scope = useRef('')
  scope.current = `${organisationId}:${identityId}`
  const refresh = useCallback(async (nextCursor = null) => {
    const request = ++generation.current
    setLoading(true); setError('')
    try {
      const result = previewData || await loadClientCampaigns({ identityId, organisationId }, { cursor: nextCursor, includeSummary: !nextCursor })
      if (request !== generation.current) return
      setAvailable(result.available)
      setCampaigns(previous => nextCursor ? [...new Map([...previous, ...result.campaigns].map(row => [row.id, row])).values()] : result.campaigns)
      if (!nextCursor) setSummary(result.summary)
      setCursor(result.nextCursor)
    } catch (cause) { if (request === generation.current) { setError(cause.message || 'Unable to load campaign history.'); setCampaigns([]); setSummary(null); setCursor(null) } }
    finally { if (request === generation.current) setLoading(false) }
  }, [identityId, organisationId, previewData])
  useEffect(() => {
    setCampaigns([]); setSummary(null); setCursor(null); setEditing(null); setNotice('')
    void refresh()
    return () => { generation.current += 1 }
  }, [refresh, client.identityVersion])
  async function saved() {
    const savedScope = scope.current
    setEditing(null); setNotice('Confirmed response saved to campaign history and client activity.')
    await refresh()
    if (scope.current !== savedScope) return
    try { await onChanged?.(identityId) } catch { if (scope.current === savedScope) setNotice('Response saved. Reload the directory to refresh its latest activity.') }
  }
  return <section aria-label="Client campaign history" className="min-w-0 space-y-4 rounded-[18px] border border-[#e1e9f2] bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><h4 className="font-semibold text-[#17334f]">Campaign history</h4><p className="mt-1 text-sm text-[#637890]">Email campaigns addressed to this client’s known email addresses.</p></div><Button variant="ghost" disabled={loading || (!identityId && !previewData) || Boolean(editing)} onClick={() => void refresh()}>Refresh campaigns</Button></div>
    {!available ? <p className="rounded-xl bg-[#fff9ed] p-3 text-sm text-[#7f5b16]">Campaign history is awaiting database setup and a permanent client profile.</p> : null}
    {error ? <p role="alert" className="break-words rounded-xl bg-[#fff5f5] p-3 text-sm text-[#b42318]">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-[#1767b4]">{notice}</p> : null}
    {loading && !campaigns.length ? <p role="status" className="text-sm text-[#637890]">Loading campaign history…</p> : null}
    {available && summary ? <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">{[['Campaigns', summary.campaignCount], ['Emails sent', summary.sentCount], ['Delivered', summary.deliveredCount], ['Opened', summary.openedCount], ['Clicked', summary.clickedCount], ['Campaigns with a confirmed response', summary.respondedCount]].map(([label, count]) => <div key={label} className="min-w-0 rounded-xl border border-[#e1e9f2] p-3"><dt className="text-xs text-[#637890]">{label}</dt><dd className="mt-1 text-lg font-semibold text-[#17334f]">{count || 0}</dd></div>)}</dl> : null}
    {available ? <p className="text-xs leading-5 text-[#637890]">Opens and clicks are tracking signals and may include automated activity. They do not confirm a reply. Responses below are recorded by staff; mailbox replies are not automatically imported. History follows retained email aliases and reviewed client merges. Only campaigns you have permission to view are shown.</p> : null}
    {available && !loading && !error && !campaigns.length ? <p className="text-sm text-[#637890]">No matching campaigns visible yet.</p> : null}
    <ol className="space-y-3">{campaigns.map(campaign => <li key={campaign.id} className="min-w-0 rounded-xl border border-[#e1e9f2] p-3">
      <div className="flex flex-wrap justify-between gap-2"><h5 className="min-w-0 max-w-full break-words font-semibold text-[#17334f]">{campaign.campaign_name}</h5><span className="rounded-full bg-[#f1f5f9] px-2 py-1 text-xs capitalize text-[#40586f]">{campaign.status}</span></div>
      <p className="mt-1 break-words text-sm text-[#40586f]">{campaign.subject}</p><p className="mt-1 break-words text-xs text-[#637890]">To {campaign.email}</p>
      <dl className="mt-3 grid min-w-0 gap-2 text-xs text-[#637890] sm:grid-cols-2">{[['Sent', campaign.sent_at], ['Delivered', campaign.delivered_at], ['First recorded open', campaign.opened_at], ['First recorded click', campaign.clicked_at]].map(([label, time]) => <div key={label} className="min-w-0"><dt>{label}</dt><dd className="mt-1 text-[#40586f]">{time ? <time dateTime={time}>{formatTime(time)}</time> : 'Not recorded'}</dd></div>)}</dl>
      <p className="mt-3 text-xs text-[#637890]">{campaign.open_count || 0} recorded opens · {campaign.click_count || 0} recorded clicks</p>
      <p className="mt-3 text-sm font-semibold text-[#17334f]">{campaign.response_count ? `${campaign.response_count} confirmed response${campaign.response_count === 1 ? '' : 's'}` : 'No confirmed response recorded'}</p>
      {campaign.responses?.length ? <ul className="mt-2 space-y-2">{campaign.responses.map(response => <li key={response.id} className="min-w-0 rounded-lg bg-[#f8fafc] p-3 text-sm"><p className="text-[#40586f]">{campaignResponseLabel(response.response_kind)} · Staff confirmed</p><time className="mt-1 block text-xs text-[#637890]" dateTime={response.occurred_at}>{formatTime(response.occurred_at)}</time><p className="mt-2 whitespace-pre-wrap break-words text-[#40586f]">{response.detail}</p></li>)}</ul> : null}
      {campaign.response_count > (campaign.responses?.length || 0) ? <p className="mt-2 text-xs text-[#637890]">Showing the 20 most recent responses. Earlier responses remain in client Activity.</p> : null}
      {campaign.sent_at ? <Button className="mt-3 max-w-full whitespace-normal" variant="secondary" disabled={Boolean(editing) || loading || Boolean(previewData)} title={previewData ? 'Mock preview is read-only' : undefined} onClick={() => { setEditing(campaign.id); setNotice('') }} aria-label={`Record response for ${campaign.campaign_name}`}>Record confirmed response</Button> : null}
      {!previewData && editing === campaign.id ? <ResponseForm key={`${organisationId}:${identityId}:${campaign.id}`} client={client} campaign={campaign} onSaved={saved} onCancel={() => setEditing(null)} /> : null}
    </li>)}</ol>
    {cursor ? <div className="flex justify-center"><Button variant="secondary" disabled={loading || Boolean(editing)} onClick={() => void refresh(cursor)}>{loading ? 'Loading…' : 'Load older campaigns'}</Button></div> : null}
  </section>
}
