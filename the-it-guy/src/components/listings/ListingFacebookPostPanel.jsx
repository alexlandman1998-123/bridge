import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Facebook, RefreshCw } from 'lucide-react'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'

export default function ListingFacebookPostPanel({ organisationId, listingId }) {
  const key = `${organisationId}:${listingId}`, generation = useRef(0), lock = useRef(false)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const [state, setState] = useState({ key: '', pages: [], posts: [], loading: true, error: '' })
  const [draft, setDraft] = useState({ key: '', pageId: '', caption: undefined, mode: undefined }), [preview, setPreview] = useState(null), [busy, setBusy] = useState(''), [error, setError] = useState('')
  const data = state.key === key ? state : { pages: [], posts: [], loading: true, error: '' }
  const input = draft.key === key ? draft : { pageId: '', caption: undefined, mode: undefined }
  const currentPreview = preview?.key === key ? preview.post : null
  const refresh = useCallback(async () => {
    const current = ++generation.current
    if (!organisationId || !listingId) return
    try {
      const [workspace, posts] = await Promise.all([metaIntegrationRequest(organisationId, 'workspace'), metaIntegrationRequest(organisationId, 'listing_posts', { listingId })])
      if (current === generation.current) setState({ key, pages: workspace.pages || [], posts: posts.posts || [], error: '', loading: false })
    } catch (failure) { if (current === generation.current) setState({ key, pages: [], posts: [], error: failure.message, loading: false }) }
  }, [key, organisationId, listingId])
  useEffect(() => { setDraft({ key, pageId: '', caption: undefined, mode: undefined }); setPreview(null); setBusy(''); setError(''); void refresh(); return invalidate }, [key, refresh, invalidate])
  const page = data.pages.find(row => row.id === input.pageId) || data.pages.find(row => row.canPost)
  function update(field, value) { setDraft(old => ({ ...(old.key === key ? old : {}), key, [field]: value })); setPreview(null); setError('') }
  async function prepare() {
    if (lock.current) return
    lock.current = true; setBusy('preview'); setError('')
    const current = generation.current
    try {
      const response = await metaIntegrationRequest(organisationId, 'preview_post', { listingId, connectionId: page?.id, ...(input.caption !== undefined ? { caption: input.caption } : {}), ...(input.mode ? { mode: input.mode } : {}) })
      if (current !== generation.current) return
      setDraft({ key, pageId: page.id, caption: response.post.snapshot_json.caption, mode: response.post.snapshot_json.mode })
      setPreview({ key, post: response.post })
    } catch (failure) { if (current === generation.current) setError(failure.message) }
    finally { lock.current = false; if (current === generation.current) setBusy('') }
  }
  async function publish() {
    if (lock.current || !currentPreview || currentPreview.status !== 'draft') return
    lock.current = true; setBusy('publish'); setError('')
    const current = generation.current
    try {
      const response = await metaIntegrationRequest(organisationId, 'publish_post', { postId: currentPreview.id })
      if (current !== generation.current) return
      setPreview({ key, post: response.post })
      await refresh()
    } catch (failure) { if (current === generation.current) setError(`${failure.message} Refresh post history before submitting again.`) }
    finally { lock.current = false; setBusy('') }
  }
  return <section className="overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-base font-semibold text-[#142132]"><Facebook size={18} />Post to Facebook</h3><p className="mt-1 text-sm text-slate-600">Review a post from this listing’s public details, then publish it to your connected Page.</p></div><Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => void refresh()}><RefreshCw size={15} />Refresh</Button></header>
    {(error || data.error) ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error || data.error}</p> : null}
    {data.loading ? <p role="status" className="mt-4 text-sm">Loading Facebook connections…</p> : data.pages.some(row => row.canPost) ? <div className="mt-5 grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-semibold">Facebook Page<select className="rounded-lg border p-2.5 font-normal" value={page?.id || ''} disabled={Boolean(busy)} onChange={event => update('pageId', event.target.value)}>{data.pages.map(row => <option key={row.id} value={row.id} disabled={!row.canPost}>{row.page_name}{row.canPost ? '' : ' · reconnect for posting'}</option>)}</select></label><label className="grid gap-2 text-sm font-semibold">Post format<select className="rounded-lg border p-2.5 font-normal" value={input.mode || ''} disabled={Boolean(busy)} onChange={event => update('mode', event.target.value || undefined)}><option value="">Choose from listing details</option><option value="photo">Listing photo</option><option value="link">Public listing link</option><option value="text">Text</option></select></label></div>
      <label className="grid gap-2 text-sm font-semibold">Caption<textarea className="min-h-28 rounded-xl border p-3 font-normal" maxLength={5000} disabled={Boolean(busy)} value={input.caption ?? ''} placeholder="Leave empty for a caption from the saved public listing details." onChange={event => update('caption', event.target.value || undefined)} /></label>
      <div><Button disabled={Boolean(busy) || !page?.canPost} onClick={() => void prepare()}>{busy === 'preview' ? 'Preparing…' : 'Preview Facebook post'}</Button></div>
    </div> : <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><p>{data.pages.length ? 'Reconnect your Facebook Page with permission to create Page posts.' : 'Connect a Facebook Page to publish this listing from Arch9.'}</p><Link className="mt-3 inline-block font-semibold text-blue-800" to="/settings/integrations/meta">Connect Facebook Page</Link></div>}
    {data.posts.length ? <div className="mt-5 border-t pt-4"><h4 className="text-sm font-semibold">Recent posts</h4><ul className="mt-2 space-y-2 text-sm">{data.posts.map(post => <li key={post.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3"><span>{new Date(post.created_at).toLocaleString()} · {post.status === 'unknown' || post.status === 'publishing' ? 'Unconfirmed—check the Facebook Page' : post.status}</span>{post.public_url ? <a className="font-semibold text-blue-800" href={post.public_url} target="_blank" rel="noreferrer">Open post</a> : null}{post.error_message ? <p className="w-full text-xs text-red-800">{post.error_message}</p> : null}</li>)}</ul></div> : null}
    <Modal open={Boolean(currentPreview)} title="Review Facebook post" subtitle={page?.page_name} onClose={busy === 'publish' ? undefined : () => setPreview(null)} footer={currentPreview?.status === 'draft' ? <Button disabled={Boolean(busy)} onClick={() => void publish()}>{busy === 'publish' ? 'Publishing…' : 'Publish to Facebook'}</Button> : <Button variant="secondary" onClick={() => setPreview(null)}>Close</Button>}>
      {currentPreview?.snapshot_json?.imageUrl ? <img className="mb-4 max-h-80 w-full rounded-xl object-cover" src={currentPreview.snapshot_json.imageUrl} alt="Listing photo for the Facebook post" /> : null}
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{currentPreview?.snapshot_json?.caption}</p>
      {currentPreview?.snapshot_json?.link ? <p className="mt-3 break-all text-sm text-blue-800">{currentPreview.snapshot_json.link}</p> : null}
      {currentPreview?.status === 'draft' ? <p className="mt-5 rounded-lg bg-blue-50 p-3 text-sm">Publish will share this preview publicly on {page?.page_name}.</p> : currentPreview?.status === 'published' ? <p role="status" className="mt-4 text-green-800">Meta accepted this post. <a href={currentPreview.public_url} target="_blank" rel="noreferrer" className="font-semibold underline">Open it on Facebook</a></p> : <p role="alert" className="mt-4 text-red-800">{currentPreview?.error_message || 'The publish result is unconfirmed. Check the Page before posting again.'}</p>}
    </Modal>
  </section>
}
