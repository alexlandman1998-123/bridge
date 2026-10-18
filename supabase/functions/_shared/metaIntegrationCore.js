export const META_ADMIN_ROLES = ['owner','principal','director','admin','super_admin','developer','agency_admin']
export const META_STAFF_ROLES = [...META_ADMIN_ROLES,'agent','senior_agent','manager','branch_manager','broker','assistant']
export const text = (value) => typeof value === 'string' ? value.trim() : ''
export const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
export const isMetaId = (value) => /^\d{1,32}$/.test(text(value))
export const canReply = (conversation, now = Date.now()) => {
  const last = Date.parse(conversation?.last_inbound_at || '')
  return Number.isFinite(last) && last <= now + 60000 && last > now - 86400000
}
export const canPublishPage = (page) => page?.connection_status === 'connected'
  && page.granted_scopes?.includes('pages_manage_posts')
  && page.page_tasks?.some(task => ['CREATE_CONTENT', 'MANAGE', 'PROFILE_PLUS_CREATE_CONTENT'].includes(task))

export function httpsUrl(value) {
  try {
    const url = new URL(text(value))
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')
      || /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[)/i.test(url.hostname)
      || /^172\.(?:1[6-9]|2\d|3[01])\./.test(url.hostname)) return ''
    return url.href
  } catch { return '' }
}

export function publicListingPost(listing, media = [], input = {}, storageOrigin = '') {
  if (!listing?.id || listing.is_active === false || !['active', 'under_offer'].includes(text(listing.listing_status).toLowerCase())) {
    throw new Error('Choose a saved, active listing before posting to Facebook.')
  }
  const title = text(listing.title)
  if (!title) throw new Error('Add a public listing headline before posting.')
  const location = [listing.suburb, listing.city].map(text).filter(Boolean).join(', ')
  const price = Number(listing.asking_price)
  const defaults = [title, location, Number.isFinite(price) && price > 0 ? `R ${new Intl.NumberFormat('en-ZA').format(price)}` : '', text(listing.description).slice(0,1200)].filter(Boolean).join('\n\n')
  const caption = input.caption === undefined ? defaults : text(input.caption)
  if (!caption || caption.length > 5000) throw new Error('Write a Facebook caption of 1 to 5,000 characters.')
  const link = [listing.bridge_listing_public_url, listing.property24_listing_url, listing.private_property_listing_url].map(httpsUrl).find(Boolean) || ''
  const images = media.filter(item => item.media_type === 'image' && httpsUrl(item.file_url))
  const selected = input.imageId ? images.find(item => item.id === input.imageId) : images[0]
  let imageUrl = ''
  if (selected) {
    const url = new URL(selected.file_url)
    if (url.origin === storageOrigin && url.pathname.startsWith('/storage/v1/object/public/listing-media/') && !url.search) imageUrl = url.href
  }
  const mode = input.mode || (imageUrl ? 'photo' : link ? 'link' : 'text')
  if (!['photo','link','text'].includes(mode)) throw new Error('Choose a photo, link or text post.')
  if (mode === 'photo' && !imageUrl) throw new Error('Choose a public listing photo before posting.')
  if (mode === 'link' && !link) throw new Error('Publish a public listing link before choosing a link post.')
  return { title, caption, mode, link: mode === 'text' ? '' : link, imageUrl: mode === 'photo' ? imageUrl : '', imageId: mode === 'photo' ? selected.id : null, listingUpdatedAt: listing.updated_at }
}

export function inboundWhatsApp(message, value, entry) {
  const from = text(message?.from)
  const seconds = Number(message?.timestamp)
  const at = new Date(seconds * 1000)
  if (!/^[1-9][0-9]{6,14}$/.test(from) || !text(message?.id) || !Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(at.getTime())) return null
  const type = text(message.type) || 'unsupported'
  const attachment = message[type] && typeof message[type] === 'object' ? message[type] : {}
  const contact = (value.contacts || []).find(item => text(item.wa_id) === from)
  return {
    p_phone_id: text(value.metadata?.phone_number_id), p_waba_id: text(entry.id), p_from: from,
    p_message_id: text(message.id), p_at: at.toISOString(), p_type: type,
    p_body: text(message.text?.body || attachment.caption || message.button?.text || message.interactive?.button_reply?.title || message.interactive?.list_reply?.title).slice(0,16000),
    p_media: ['image','document','audio','video','sticker'].includes(type) ? { id: text(attachment.id), mimeType: text(attachment.mime_type), filename: text(attachment.filename), caption: text(attachment.caption) } : {},
    p_name: text(contact?.profile?.name).slice(0,160),
  }
}

export async function applyWhatsAppInboxWebhook(db, payload) {
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) {
    for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
      const value = change.value || {}
      if (change.field !== 'messages' || !isMetaId(text(entry.id)) || !isMetaId(text(value.metadata?.phone_number_id))) continue
      for (const message of Array.isArray(value.messages) ? value.messages : []) {
        const inbound = inboundWhatsApp(message, value, entry)
        if (inbound) {
          const saved = await db.rpc('whatsapp_inbox_receive', inbound)
          if (saved.error) throw new Error('Unable to save incoming WhatsApp message.')
        }
      }
      for (const item of Array.isArray(value.statuses) ? value.statuses : []) {
        const seconds = Number(item.timestamp), at = new Date(seconds * 1000)
        if (!['sent','delivered','read','failed'].includes(item.status) || !text(item.id) || !Number.isFinite(seconds) || seconds <= 0 || !Number.isFinite(at.getTime())) continue
        const saved = await db.rpc('whatsapp_inbox_status', { p_phone_id: text(value.metadata.phone_number_id), p_waba_id: text(entry.id), p_message_id: text(item.id), p_callback: text(item.biz_opaque_callback_data), p_status: item.status, p_at: at.toISOString(), p_error: text(item.errors?.[0]?.error_data?.details || item.errors?.[0]?.title).slice(0,500) })
        if (saved.error) throw new Error('Unable to save WhatsApp inbox delivery status.')
      }
    }
  }
}
