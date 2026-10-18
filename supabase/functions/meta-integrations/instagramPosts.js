import { isMetaId, isUuid, text } from '../_shared/metaIntegrationCore.js'
import { instagramConnectionReady, instagramPermalink, instagramPhotos, instagramSnapshot, resolveInstagramAccount } from '../_shared/instagramListing.js'

const fields = 'id,listing_id,connection_id,platform,target_account_id,target_account_name,snapshot_json,status,provider_post_id,public_url,error_message,created_at,created_by,published_at,provider_container_id,publish_requested_at,publishing_started_at'
const result = async query => { const { data, error } = await query; if (error) throw new Error(error.message); return data }
const safe = row => Object.fromEntries(fields.split(',').map(key => [key, row[key]]))
const unconfirmed = 'The publish result is unconfirmed. Check this Instagram account before creating another post.'

export async function handleInstagramPosts({ db, actor, org, action, payload, graph, decrypt, config, loadListing, assertPublishable, inspectPhoto, authorize, authorization, now }) {
  const connections = () => result(db.from('meta_lead_ads_connections').select('*').eq('organisation_id', org).eq('connection_status', 'connected'))
  if (action === 'instagram_accounts') {
    const accounts = [], issues = []
    for (const connection of await connections()) {
      if (!instagramConnectionReady(connection)) { issues.push(`${connection.page_name}: reconnect with Instagram publishing permission.`); continue }
      try { accounts.push(await resolveInstagramAccount(connection, await decrypt(connection.token_ciphertext), graph)) }
      catch { issues.push(`${connection.page_name}: check its linked professional Instagram account and permissions, then refresh.`) }
    }
    return { accounts, issues }
  }
  let job
  if (['publish_instagram_post', 'refresh_instagram_post'].includes(action)) {
    if (!isUuid(payload.postId)) throw new Error('Preview the Instagram post first.')
    job = await result(db.from('meta_listing_posts').select('*').eq('id', payload.postId).eq('organisation_id', org).eq('platform', 'instagram').eq('created_by', actor.userId).maybeSingle())
    if (!job) throw new Error('Instagram post preview not found. Prepare a new preview.')
  }
  const listingId = job?.listing_id || payload.listingId
  if (!isUuid(listingId)) throw new Error('Choose a saved listing.')
  const loaded = await loadListing(actor, org, listingId)
  if (!loaded?.listing) throw new Error('You do not have access to this listing.')
  if (action === 'instagram_listing_posts') return { posts: await result(db.from('meta_listing_posts').select(fields).eq('organisation_id', org).eq('listing_id', listingId).eq('platform', 'instagram').order('created_at', { ascending: false }).limit(10)) }
  if (action === 'instagram_listing_options') {
    const photos = instagramPhotos(loaded.media, config.storageOrigin)
    const canPublish = loaded.listing.is_active !== false && ['active', 'under_offer'].includes(text(loaded.listing.listing_status).toLowerCase())
    let caption = '', postingUnavailable = canPublish ? '' : 'Only active or under-offer listings can be published. Existing post results remain below.'
    if (canPublish && photos.length) {
      try { caption = instagramSnapshot(loaded.listing, loaded.media, {}, config.storageOrigin).caption }
      catch (error) { postingUnavailable = error.message }
    }
    return { photos, caption, canPublish, postingUnavailable }
  }
  if (job && (job.status === 'failed' || (job.status === 'published' && (action !== 'refresh_instagram_post' || job.public_url)))) return { post: safe(job) }
  if (!job && (!isUuid(payload.connectionId) || !isMetaId(text(payload.instagramAccountId)))) throw new Error('Choose a connected professional Instagram account.')
  const connection = await result(db.from('meta_lead_ads_connections').select('*').eq('id', job?.connection_id || payload.connectionId).eq('organisation_id', org).eq('connection_status', 'connected').maybeSingle())
  if (!connection) throw new Error('Reconnect this Facebook Page before publishing to Instagram.')
  const token = await decrypt(connection.token_ciphertext)
  const account = await resolveInstagramAccount(connection, token, graph)
  const target = job?.target_account_id || text(payload.instagramAccountId)
  if (account.id !== target) throw new Error('The Instagram account linked to this Page changed. Prepare a new preview for the correct account.')
  const read = () => result(db.from('meta_listing_posts').select(fields).eq('id', job.id).eq('organisation_id', org).single())
  const update = patch => result(db.from('meta_listing_posts').update(patch).eq('id', job.id).eq('organisation_id', org))
  async function publishable() {
    const currentActor = await authorize(authorization, org)
    if (currentActor?.userId !== actor.userId) throw new Error('Active staff membership is required.')
    const current = await loadListing(currentActor, org, listingId)
    if (!current?.listing) throw new Error('You do not have access to this listing.')
    await assertPublishable(currentActor, org, listingId)
    if (job && connection.publishing_version !== job.connection_version) throw new Error('This connection changed after the preview. Prepare a new preview.')
    const snapshot = instagramSnapshot(current.listing, current.media, job ? { caption: job.snapshot_json.caption, imageId: job.snapshot_json.imageId } : payload, config.storageOrigin)
    const photo = await inspectPhoto(snapshot.imageUrl)
    const verifiedAccount = await resolveInstagramAccount(connection, token, graph)
    if (verifiedAccount.id !== target) throw new Error('The Instagram account linked to this Page changed. Prepare a new preview for the correct account.')
    const checked = { ...snapshot, photoSha256: photo.sha256, photoWidth: photo.width, photoHeight: photo.height, photoBytes: photo.bytes }
    if (job && Object.keys(checked).some(key => checked[key] !== job.snapshot_json[key])) throw new Error('The listing or photo changed after this preview. Prepare and review a new preview.')
    return checked
  }
  if (action === 'preview_instagram_post') {
    const snapshot = await publishable()
    const post = await result(db.from('meta_listing_posts').insert({ organisation_id: org, listing_id: listingId, connection_id: connection.id, platform: 'instagram', target_account_id: account.id, target_account_name: account.username || account.name, connection_version: connection.publishing_version, snapshot_json: snapshot, created_by: actor.userId }).select(fields).single())
    return { post }
  }
  async function containerStatus() {
    const state = await graph(token, `${job.provider_container_id}?fields=id,status_code`)
    if (text(state.id) !== job.provider_container_id) throw new Error('Meta did not confirm the selected photo container.')
    if (state.status_code === 'PUBLISHED') {
      await update({ status: 'published', published_at: job.published_at || now().toISOString(), error_message: job.provider_post_id ? null : 'Meta confirms this photo was published. Open the Instagram account to find the post.' })
    } else if (['ERROR', 'EXPIRED'].includes(state.status_code) && !job.publish_requested_at) {
      await result(db.from('meta_listing_posts').update({ status: 'failed', error_message: 'Meta could not prepare this photo. Check its format and prepare a new preview.' }).eq('id', job.id).eq('organisation_id', org).eq('status', 'publishing').is('publish_requested_at', null))
    }
    return state.status_code
  }
  if (action === 'refresh_instagram_post') {
    if (job.provider_post_id && !job.public_url) {
      const media = await graph(token, `${job.provider_post_id}?fields=id,permalink`)
      if (text(media.id) === job.provider_post_id) await update({ public_url: instagramPermalink(media.permalink) })
    } else if (job.provider_container_id) {
      const state = await containerStatus()
      if (state !== 'PUBLISHED' && job.publish_requested_at && Date.parse(job.publish_requested_at) < now().getTime() - 90000) {
        await result(db.from('meta_listing_posts').update({ status: 'unknown', error_message: unconfirmed }).eq('id', job.id).eq('organisation_id', org).eq('status', 'publishing'))
      }
    } else if (job.status === 'publishing' && Date.parse(job.publishing_started_at) < now().getTime() - 90000) {
      await result(db.from('meta_listing_posts').update({ status: 'unknown', error_message: unconfirmed }).eq('id', job.id).eq('organisation_id', org).eq('status', 'publishing').is('provider_container_id', null).is('publish_requested_at', null))
    }
    return { post: await read() }
  }
  if (job.status === 'unknown' || job.publish_requested_at) return { post: safe(job) }
  await publishable()
  const claim = stage => result(db.rpc('meta_instagram_post_claim', { p_org: org, p_actor: actor.userId, p_post: job.id, p_stage: stage }))
  if (job.status === 'draft') {
    if (!await claim('container')) return { post: await read() }
    try {
      const created = await graph(token, `${account.id}/media`, { image_url: job.snapshot_json.imageUrl, caption: job.snapshot_json.caption })
      if (!isMetaId(text(created.id))) throw new Error('Meta did not confirm the photo container.')
      await update({ provider_container_id: created.id })
      job = { ...job, status: 'publishing', provider_container_id: created.id }
    } catch (error) {
      await update({ status: error.definitive ? 'failed' : 'unknown', error_message: error.definitive ? 'Meta rejected the photo. Check the account, permissions and JPEG requirements before preparing a new preview.' : unconfirmed })
      return { post: await read() }
    }
  }
  if (!job.provider_container_id) return { post: await read() }
  const state = await containerStatus()
  if (state !== 'FINISHED') return { post: await read() }
  // A continued request rechecks the listing, account connection and actor before
  // a service-only, transactional claim allows this container to publish once.
  await publishable()
  if (!await claim('publish')) return { post: await read() }
  try {
    const published = await graph(token, `${account.id}/media_publish`, { creation_id: job.provider_container_id })
    if (!isMetaId(text(published.id))) throw new Error('Meta did not confirm the Instagram post.')
    await update({ status: 'published', provider_post_id: published.id, published_at: now().toISOString(), error_message: null })
    try {
      const media = await graph(token, `${published.id}?fields=id,permalink`)
      if (text(media.id) === published.id) await update({ public_url: instagramPermalink(media.permalink) })
    } catch { /* A missing permalink must never repeat a successful publish. */ }
  } catch (error) {
    await update({ status: error.definitive ? 'failed' : 'unknown', error_message: error.definitive ? 'Meta rejected this publish request. Check the account and publishing limits before preparing a new preview.' : unconfirmed })
  }
  return { post: await read() }
}
