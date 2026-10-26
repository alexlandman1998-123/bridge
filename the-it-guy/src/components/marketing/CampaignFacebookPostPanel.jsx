import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Facebook, RefreshCw } from 'lucide-react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'

const unconfirmed = post => ['unknown', 'publishing'].includes(post?.status)
const statusLabel = post => unconfirmed(post) ? 'Unconfirmed · check the Facebook Page' : ({ draft: 'Reviewed preview', published: 'Published on Facebook', failed: 'Meta rejected the post' })[post?.status] || 'Result unavailable'

export default function CampaignFacebookPostPanel({ organisationId, userId, campaign, canEdit = false }) {
  const key = `${organisationId}:${userId}:${campaign?.id}:${campaign?.revision}`
  const currentKey = useRef(key), generation = useRef(0), lock = useRef(false), intent = useRef(null)
  const invalidate = useCallback(() => { generation.current++ }, [])
  currentKey.current = key
  const [state, setState] = useState({ key: '', loading: true, pages: [], posts: [], source: null, error: '', sourceError: '', canPublish: false })
  const [input, setInput] = useState({ key: '', pageId: '', mode: '', destination: '' })
  const [preview, setPreview] = useState(null), [busy, setBusy] = useState(''), [error, setError] = useState('')
  const data = state.key === key ? state : { loading: true, pages: [], posts: [], source: null, error: '', sourceError: '', canPublish: false }
  const draft = input.key === key ? input : { pageId: '', mode: '', destination: '' }
  const page = data.pages.find(row => row.id === draft.pageId) || data.pages.find(row => row.canPost)
  const mode = draft.mode || (data.source?.destinations?.length ? 'link' : 'text')
  const destination = draft.destination || data.source?.destinations?.[0]?.key || ''
  const currentPreview = preview?.key === key ? preview : null
  const mayPrepare = canEdit && data.canPublish && page?.canPost && data.source && !data.sourceError

  const refresh = useCallback(async () => {
    const request = ++generation.current
    if (!organisationId || !userId || !campaign?.id) return
    try {
      const [workspace, history] = await Promise.all([
        metaIntegrationRequest(organisationId, 'workspace'),
        metaIntegrationRequest(organisationId, 'campaign_posts', { campaignId: campaign.id }),
      ])
      if (currentKey.current === key && request === generation.current)
        setState({ key, loading: false, pages: workspace.pages || [], posts: history.posts || [], source: history.source, sourceError: history.sourceError || '', error: '', canPublish: history.canPublish === true })
    } catch (failure) {
      if (currentKey.current === key && request === generation.current)
        setState({ key, loading: false, pages: [], posts: [], source: null, sourceError: '', error: failure.message, canPublish: false })
    }
  }, [key, organisationId, userId, campaign?.id])

  useEffect(() => {
    setInput({ key, pageId: '', mode: '', destination: '' }); setPreview(null); setBusy(''); setError(''); intent.current = null
    void refresh()
    return invalidate
  }, [key, refresh, invalidate])

  function change(field, value) {
    setInput(old => ({ ...(old.key === key ? old : {}), key, [field]: value }))
    setPreview(null); setError(''); intent.current = null
  }
  async function prepare() {
    if (lock.current || !mayPrepare) return
    const current = key
    lock.current = true; setBusy('preview'); setError('')
    const fingerprint = `${key}:${page.id}:${mode}:${destination}`
    if (intent.current?.fingerprint !== fingerprint) intent.current = { fingerprint, requestId: crypto.randomUUID() }
    const requestId = intent.current.requestId
    try {
      const result = await metaIntegrationRequest(organisationId, 'preview_campaign_post', { campaignId: campaign.id, expectedRevision: campaign.revision, connectionId: page.id, mode, destination, requestId })
      if (currentKey.current === current) setPreview({ key, post: result.post, pageName: result.pageName || page.page_name, failedRequest: false })
    } catch (failure) {
      if (currentKey.current === current) setError(`${failure.message} You can check the same preview request again.`)
    } finally { lock.current = false; if (currentKey.current === current) setBusy('') }
  }
  async function publish() {
    if (lock.current || currentPreview?.post.status !== 'draft' || currentPreview.failedRequest) return
    const current = key, postId = currentPreview.post.id
    lock.current = true; setBusy('publish'); setError('')
    try {
      const result = await metaIntegrationRequest(organisationId, 'publish_campaign_post', { postId, expectedRevision: campaign.revision, confirmPublishNow: true })
      if (currentKey.current !== current) return
      setPreview(old => old?.post.id === postId ? { ...old, post: result.post } : old)
      await refresh()
    } catch (failure) {
      if (currentKey.current === current) {
        setPreview(old => old?.post.id === postId ? { ...old, failedRequest: true } : old)
        setError(`${failure.message} The result is unconfirmed. Refresh history and check the Facebook Page before preparing another post.`)
      }
    } finally { lock.current = false; if (currentKey.current === current) setBusy('') }
  }

  return <section className="rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-sm" aria-label="Campaign Facebook publishing">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-[#142132]"><Facebook size={19} aria-hidden="true" />Publish to Facebook</h2><p className="mt-1 text-sm text-slate-600">Share the saved Social wording on your connected Page. Review the exact post before publishing it now.</p></div><Button variant="ghost" size="sm" disabled={Boolean(busy) || data.loading} onClick={() => void refresh()} aria-label="Refresh Facebook campaign history"><RefreshCw size={15} aria-hidden="true" />Refresh</Button></header>
    {(error || data.error || data.sourceError) && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error || data.error || data.sourceError}</p>}
    {data.loading ? <p role="status" className="mt-4 text-sm">Loading Facebook publishing…</p> : <>
      {data.source && <div className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm font-semibold">Saved Social wording<textarea className="min-h-36 rounded-xl border bg-slate-50 p-3 font-normal" value={data.source.caption} readOnly /></label>
        <p className="text-xs text-slate-600">To change this wording, edit and save the campaign first. Text and links are supported here. The campaign pack provides photos and timing guidance for manual sharing.</p>
        {canEdit && data.canPublish && data.pages.some(row => row.canPost) ? <>
          <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">Facebook Page<select className="rounded-lg border p-2.5 font-normal" value={page?.id || ''} disabled={Boolean(busy)} onChange={event => change('pageId', event.target.value)}>{data.pages.map(row => <option key={row.id} value={row.id} disabled={!row.canPost}>{row.page_name}{row.canPost ? '' : ' · reconnect for posting'}</option>)}</select></label>
            <label className="grid gap-2 text-sm font-semibold">Post format<select className="rounded-lg border p-2.5 font-normal" value={mode} disabled={Boolean(busy)} onChange={event => change('mode', event.target.value)}><option value="text">Text</option><option value="link" disabled={!data.source.destinations?.length}>Saved campaign link</option></select></label>
          </div>
          {mode === 'link' && <label className="grid gap-2 text-sm font-semibold">Reviewed destination<select className="rounded-lg border p-2.5 font-normal" value={destination} disabled={Boolean(busy)} onChange={event => change('destination', event.target.value)}>{data.source.destinations.map(item => <option key={item.key} value={item.key}>{item.label} · {item.url}</option>)}</select></label>}
          <div><Button disabled={Boolean(busy) || !mayPrepare} onClick={() => void prepare()}>{busy === 'preview' ? 'Preparing…' : 'Preview Facebook post'}</Button></div>
        </> : canEdit && data.canPublish ? <div className="rounded-xl bg-slate-50 p-4 text-sm"><p>{data.pages.length ? 'Reconnect your Facebook Page with permission to create Page posts.' : 'Connect a Facebook Page before publishing this campaign.'}</p><Link className="mt-3 inline-block font-semibold text-blue-800" to="/settings/integrations/meta">Connect Facebook Page</Link></div> : <p className="text-sm text-slate-600">The campaign owner or an agency manager can prepare a Facebook post.</p>}
      </div>}
      <div className="mt-5 border-t pt-4"><h3 className="font-semibold">Facebook post history</h3>{data.posts.length ? <ul className="mt-3 space-y-2 text-sm">{data.posts.map(post => <li key={post.id} className="rounded-xl bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span>{statusLabel(post)} · campaign revision {post.campaign_revision}</span>{post.public_url && <a className="font-semibold text-blue-800" href={post.public_url} target="_blank" rel="noreferrer">Open Facebook post</a>}</div><p className="mt-1 text-xs text-slate-600">Prepared {new Date(post.created_at).toLocaleString()}{post.published_at ? ` · Published ${new Date(post.published_at).toLocaleString()}` : ''}</p>{post.error_message && <p className="mt-2 text-red-800">{post.error_message}</p>}</li>)}</ul> : <p className="mt-2 text-sm text-slate-600">No native Facebook posts recorded for this campaign.</p>}</div>
    </>}
    <Modal open={Boolean(currentPreview)} title="Review campaign Facebook post" subtitle={currentPreview?.pageName || ''} onClose={busy === 'publish' ? undefined : () => setPreview(null)} footer={currentPreview?.post.status === 'draft' && !currentPreview.failedRequest ? <Button disabled={Boolean(busy)} onClick={() => void publish()}>{busy === 'publish' ? 'Publishing…' : 'Publish now'}</Button> : <Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>}>
      <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm">{currentPreview?.post.snapshot_json?.caption}</p>
      {currentPreview?.post.snapshot_json?.link && <a className="mt-3 block break-all text-sm font-semibold text-blue-800" href={currentPreview.post.snapshot_json.link} target="_blank" rel="noreferrer">{currentPreview.post.snapshot_json.link}</a>}
      {currentPreview?.post.status === 'draft' && !currentPreview.failedRequest ? <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm">Publish now will share this exact post publicly on {currentPreview.pageName}.</p> : currentPreview?.post.status === 'published' ? <p role="status" className="mt-4 text-sm text-green-800">Meta confirmed this Facebook post. <a className="underline" href={currentPreview.post.public_url} target="_blank" rel="noreferrer">Open the published post</a></p> : <p role="alert" className="mt-4 text-sm text-red-800">{currentPreview?.post.error_message || 'The publish result is unconfirmed. Refresh history and check the Facebook Page before preparing another post.'}</p>}
    </Modal>
  </section>
}
