import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Instagram, RefreshCw } from 'lucide-react'
import { useAuthSession } from '../../context/AuthSessionContext'
import { metaIntegrationRequest } from '../../services/metaIntegrationService'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

export default function ListingInstagramPostPanel(props) {
  const { authState } = useAuthSession()
  const member = authState?.currentMembership || {}
  const workspaceId = String(authState?.currentWorkspace?.id || member.workspaceId || member.workspace_id || '')
  const scope = [workspaceId, props.organisationId, props.listingId, authState?.user?.id, member.role, member.workspaceRole, member.workspace_role, member.organisationRole, member.organisation_role, member.status, member.membershipStatus].filter(Boolean).join(':')
  if (workspaceId && props.organisationId && workspaceId !== props.organisationId) return <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm">Open this listing in its agency workspace to publish to Instagram.</p>
  return <InstagramPostEditor key={scope} {...props} viewerId={authState?.user?.id} />
}

const empty = { accounts: [], issues: [], photos: [], posts: [], caption: '', loading: true, error: '' }
function statusLabel(post) {
  if (post.status === 'unknown' || (post.status === 'publishing' && post.publish_requested_at)) return 'Unconfirmed · check Instagram before posting again'
  if (post.status === 'publishing') return 'Photo processing · check and finish publishing'
  return post.status
}

function InstagramPostEditor({ organisationId, listingId, viewerId }) {
  const [data, setData] = useState(empty)
  const [draft, setDraft] = useState({ accountId: '', photoId: '', caption: undefined })
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(''), [error, setError] = useState('')
  const generation = useRef(0), lock = useRef(false)
  const invalidate = useCallback(() => { generation.current++ }, [])
  const refresh = useCallback(async () => {
    const current = ++generation.current
    if (!organisationId || !listingId || !viewerId) { setData({ ...empty, loading: false, error: 'Sign in and choose a saved listing.' }); return }
    try {
      const [accounts, options, history] = await Promise.all([
        metaIntegrationRequest(organisationId, 'instagram_accounts'),
        metaIntegrationRequest(organisationId, 'instagram_listing_options', { listingId }),
        metaIntegrationRequest(organisationId, 'instagram_listing_posts', { listingId }),
      ])
      if (generation.current === current) setData({ ...accounts, ...options, posts: history.posts || [], loading: false, error: '' })
    } catch (failure) {
      if (generation.current === current) { setData({ ...empty, loading: false, error: failure.message }); setPreview(null); setDraft({ accountId: '', photoId: '', caption: undefined }) }
    }
  }, [organisationId, listingId, viewerId])
  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh() }, 0)
    return () => { window.clearTimeout(timer); invalidate() }
  }, [refresh, invalidate])
  const account = data.accounts.find(row => row.id === draft.accountId) || data.accounts[0]
  const photo = data.photos.find(row => row.id === draft.photoId) || data.photos[0]
  const caption = draft.caption ?? data.caption
  function edit(field, value) { setDraft(old => ({ ...old, [field]: value })); setPreview(null); setError('') }
  async function request(action, fields) {
    if (lock.current) return
    lock.current = true; setBusy(action); setError('')
    const current = generation.current
    try {
      const response = await metaIntegrationRequest(organisationId, action, fields)
      if (generation.current !== current) return
      setPreview(response.post)
      if (action === 'preview_instagram_post') setDraft({ accountId: account.id, photoId: response.post.snapshot_json.imageId, caption: response.post.snapshot_json.caption })
      else await refresh()
    } catch (failure) {
      if (generation.current === current) setError(`${failure.message}${action === 'publish_instagram_post' ? ' Check post history before submitting again.' : ''}`)
    } finally { lock.current = false; setBusy('') }
  }
  const preparing = busy === 'preview_instagram_post'
  const continuePublishing = preview?.status === 'publishing' && preview.provider_container_id && !preview.publish_requested_at
  return <section className="overflow-hidden rounded-[22px] border border-[#dde4ee] bg-white p-5 shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-base font-semibold text-[#142132]"><Instagram size={18} />Post to Instagram</h3><p className="mt-1 text-sm text-slate-600">Choose a professional account and a listing photo, review the caption, then publish.</p></div>
      <Button variant="ghost" size="sm" disabled={Boolean(busy)} onClick={() => void refresh()}><RefreshCw size={15} />Refresh Instagram</Button>
    </header>
    {error || data.error ? <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error || data.error}</p> : null}
    {data.postingUnavailable ? <p role="status" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{data.postingUnavailable}</p> : null}
    {data.loading ? <p role="status" className="mt-4 text-sm">Loading Instagram connections…</p> : data.accounts.length ? <div className="mt-5 grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold">Instagram account<select className="rounded-lg border p-2.5 font-normal" value={account?.id || ''} disabled={Boolean(busy)} onChange={event => edit('accountId', event.target.value)}>{data.accounts.map(row => <option key={`${row.connectionId}:${row.id}`} value={row.id}>@{row.username || row.name} · {row.pageName}</option>)}</select></label>
        <label className="grid gap-2 text-sm font-semibold">Instagram listing photo<select className="rounded-lg border p-2.5 font-normal" value={photo?.id || ''} disabled={Boolean(busy) || !data.photos.length} onChange={event => edit('photoId', event.target.value)}>{data.photos.length ? data.photos.map(row => <option key={row.id} value={row.id}>{row.label}</option>) : <option value="">Add a public listing photo first</option>}</select></label>
      </div>
      {photo ? <img className="max-h-64 rounded-xl object-contain" src={photo.url} alt="Selected listing photo for Instagram" /> : null}
      <p className="text-xs text-slate-600">Choose a JPG of up to 8 MB, at least 320 pixels wide, between portrait 4:5 and landscape 1.91:1. Instagram captions include any listing link.</p>
      <label className="grid gap-2 text-sm font-semibold">Instagram caption<textarea className="min-h-28 rounded-xl border p-3 font-normal" value={caption} disabled={Boolean(busy)} onChange={event => edit('caption', event.target.value)} aria-describedby="instagram-caption-limit" /></label>
      <p id="instagram-caption-limit" className="text-xs text-slate-600">{Array.from(caption).length.toLocaleString()} / 2,200 characters</p>
      <div><Button disabled={Boolean(busy) || data.canPublish === false || !account || !photo || !caption.trim() || Array.from(caption).length > 2200} onClick={() => void request('preview_instagram_post', { listingId, connectionId: account.connectionId, instagramAccountId: account.id, imageId: photo.id, caption })}>{preparing ? 'Preparing…' : 'Preview Instagram post'}</Button></div>
    </div> : <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><p>Link a professional Instagram account to your Facebook Page, then reconnect Meta and approve Instagram publishing.</p><Link className="mt-3 inline-block font-semibold text-blue-800" to="/settings/integrations/meta">Manage Meta connection</Link></div>}
    {data.issues.length ? <ul className="mt-3 space-y-1 text-sm text-amber-800">{data.issues.map(issue => <li key={issue}>{issue}</li>)}</ul> : null}
    {data.posts.length ? <div className="mt-5 border-t pt-4"><h4 className="text-sm font-semibold">Recent Instagram posts</h4><ul className="mt-2 space-y-2 text-sm">{data.posts.map(post => <li key={post.id} className="flex flex-wrap justify-between gap-2 rounded-lg bg-slate-50 p-3">
      <span>@{post.target_account_name} · {statusLabel(post)}</span>
      {post.public_url ? <a className="font-semibold text-blue-800" href={post.public_url} target="_blank" rel="noreferrer">Open Instagram post</a> : null}
      {post.created_by === viewerId ? <button className="font-semibold text-blue-800" disabled={Boolean(busy)} onClick={() => { setPreview(post); setError('') }}>Review post details</button> : null}
      {post.error_message ? <p className="w-full text-xs text-red-800">{post.error_message}</p> : null}
    </li>)}</ul></div> : null}
    <Modal open={Boolean(preview)} title="Review Instagram post" subtitle={preview?.target_account_name ? `@${preview.target_account_name}` : ''} onClose={busy ? undefined : () => setPreview(null)} footer={<div className="flex flex-wrap gap-2">
      {preview?.status === 'draft' || continuePublishing ? <Button disabled={Boolean(busy)} onClick={() => void request('publish_instagram_post', { postId: preview.id })}>{busy ? 'Publishing…' : continuePublishing ? 'Check and finish publishing' : 'Publish to Instagram'}</Button> : null}
      {preview && preview.status !== 'draft' && preview.status !== 'failed' ? <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void request('refresh_instagram_post', { postId: preview.id })}>Check Instagram status</Button> : null}
      <Button variant="secondary" disabled={Boolean(busy)} onClick={() => setPreview(null)}>Close</Button>
    </div>}>
      {preview?.snapshot_json?.imageUrl ? <img className="mb-4 max-h-80 w-full rounded-xl object-contain" src={preview.snapshot_json.imageUrl} alt="Reviewed listing photo for Instagram" /> : null}
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{preview?.snapshot_json?.caption}</p>
      {preview?.status === 'draft' ? <p className="mt-5 rounded-lg bg-blue-50 p-3 text-sm">Publish will share this photo and caption publicly on @{preview.target_account_name}.</p> : <p role={preview?.status === 'failed' || preview?.status === 'unknown' ? 'alert' : 'status'} className="mt-4 text-sm">{preview?.error_message || (preview?.status === 'published' ? 'Meta accepted this Instagram post.' : statusLabel(preview || {}))}</p>}
      {preview?.public_url ? <a className="mt-3 inline-block font-semibold text-blue-800" href={preview.public_url} target="_blank" rel="noreferrer">Open on Instagram</a> : null}
    </Modal>
  </section>
}
