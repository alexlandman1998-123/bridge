import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const EMAIL_CAMPAIGN_IMAGE_BUCKET = 'email-campaign-images'
export const EMAIL_CAMPAIGN_IMAGE_MAX_BYTES = 5 * 1024 * 1024
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' }

function hostingError(error) {
  return ['PGRST202', '42P01', '42883'].includes(error?.code)
    ? new Error('Campaign image hosting is not available yet. Ask your workspace administrator to enable it.')
    : error
}

function workspaceId(value) {
  if (!isSupabaseConfigured) throw new Error('Campaign image hosting is unavailable. Check the workspace connection.')
  const id = String(value || '').trim().toLowerCase()
  if (!uuid.test(id)) throw new Error('Choose an agency before uploading campaign images.')
  return id
}

function imageWithUrl(asset) {
  const { data } = supabase.storage.from(EMAIL_CAMPAIGN_IMAGE_BUCKET).getPublicUrl(asset.storage_path)
  if (!data?.publicUrl) throw new Error('The image link could not be prepared. Refresh the image library.')
  return { ...asset, public_url: data.publicUrl }
}

function readBytes(blob) {
  if (blob.arrayBuffer) return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('This image could not be read. Choose the file again.'))
    reader.readAsArrayBuffer(blob)
  })
}

export async function validateEmailCampaignImage(file) {
  if (typeof File === 'undefined' || !(file instanceof File)) throw new Error('Choose an image to upload.')
  if (!extensions[file.type]) throw new Error('Upload a JPG, PNG, GIF or WebP image.')
  if (!file.size || file.size > EMAIL_CAMPAIGN_IMAGE_MAX_BYTES) throw new Error('Images must be non-empty and 5 MB or smaller.')
  const bytes = new Uint8Array(await readBytes(file.slice(0, 16)))
  const starts = (signature) => signature.every((byte, index) => bytes[index] === byte)
  const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end))
  const matches = {
    'image/jpeg': starts([0xff, 0xd8, 0xff]),
    'image/png': starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'image/gif': ['GIF87a', 'GIF89a'].includes(ascii(0, 6)),
    'image/webp': ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP',
  }
  if (!matches[file.type]) throw new Error('The file contents do not match its image type. Export the image again.')
  const name = file.name.split(/[\\/]/).pop()?.trim()
  if (!name || name.length > 180) throw new Error('Use an image filename between 1 and 180 characters.')
  return name
}

export async function getEmailCampaignAssets(organisationId, assetId = null) {
  const id = workspaceId(organisationId)
  const { data, error } = await supabase.rpc('email_campaign_list_assets', {
    p_organisation_id: id, p_asset_id: assetId,
  })
  if (error) throw hostingError(error)
  return (data || []).map(imageWithUrl)
}

export async function uploadEmailCampaignImage({ organisationId, file }) {
  const id = workspaceId(organisationId)
  const originalName = await validateEmailCampaignImage(file)
  const { data: reserved, error } = await supabase.rpc('email_campaign_reserve_asset', {
    p_organisation_id: id, p_original_name: originalName, p_mime_type: file.type, p_byte_size: file.size,
  })
  if (error) throw hostingError(error)
  const expectedPath = `organisations/${id}/${reserved?.id}.${extensions[file.type]}`
  if (!uuid.test(reserved?.id || '') || reserved.organisation_id !== id || reserved.storage_path !== expectedPath) {
    throw new Error('Image ownership could not be confirmed. Refresh the workspace before uploading.')
  }
  let uploadError
  try {
    const uploaded = await supabase.storage.from(EMAIL_CAMPAIGN_IMAGE_BUCKET).upload(reserved.storage_path, file, {
      contentType: file.type, cacheControl: '31536000', upsert: false,
    })
    uploadError = uploaded.error
  } catch (cause) {
    uploadError = cause
  }
  // An interrupted upload may have completed. Verify the Storage receipt before
  // reporting failure or allowing a new upload; never overwrite or delete it.
  let images
  try {
    images = await getEmailCampaignAssets(id, reserved.id)
  } catch {
    throw new Error('Image upload could not be confirmed. Refresh the image library before trying again.')
  }
  if (images[0]) return images[0]
  throw uploadError || new Error('The image upload did not finish. Choose the image and try again.')
}
