import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'
import { canTransitionRentalVacancyMarketing, createRentalVacancyMarketingPayload, mapRentalVacancyMarketing } from './rentalVacancyMarketingModel.js'

const text = (value) => String(value ?? '').trim()
const FIELDS = 'id, organisation_id, vacancy_id, branch_id, title, description, features_json, visibility, status, version, approved_at, approved_by, paused_at, archived_at, created_at, updated_at'
const MEDIA_FIELDS = 'id, storage_bucket, storage_path, media_type, alt_text, sort_order, created_at'

export const RENTAL_MEDIA_UPLOAD_MAX_BYTES = 20 * 1024 * 1024
export const RENTAL_MEDIA_UPLOAD_MIME_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
export const RENTAL_MEDIA_UPLOAD_ACCEPT = RENTAL_MEDIA_UPLOAD_MIME_TYPES.join(',')

export function validateRentalMediaUpload(file) {
  if (!file) throw new Error('Choose a rental media file first.')
  if (Number(file.size || 0) > RENTAL_MEDIA_UPLOAD_MAX_BYTES) throw new Error('Rental media must be 20 MB or smaller.')
  if (!RENTAL_MEDIA_UPLOAD_MIME_TYPES.includes(text(file.type).toLowerCase())) throw new Error('Rental media must be a JPEG, PNG, WebP, MP4, or MOV file.')
  return file
}

export function inferRentalMediaType(file) {
  return text(file?.type).toLowerCase().startsWith('video/') ? 'video' : 'image'
}

function client(value = supabase) { if (!isSupabaseConfigured || !value) throw new Error('Rental marketing requires Supabase configuration.'); return value }
function unavailable(error = {}) { const missing = ['42P01', 'PGRST204', 'PGRST205'].includes(String(error.code || '').toUpperCase()); return new Error(missing ? 'Rental marketing schema is not yet applied to this environment.' : (error.message || 'Rental marketing request failed.')) }

export async function getRentalVacancyMarketing(vacancyId, { client: db = supabase } = {}) {
  if (!text(vacancyId)) return null
  const result = await client(db).from('rental_vacancy_marketing').select(FIELDS).eq('vacancy_id', text(vacancyId)).maybeSingle()
  if (result.error) throw unavailable(result.error)
  return result.data ? mapRentalVacancyMarketing(result.data) : null
}

export async function saveRentalVacancyMarketing(values, { client: db = supabase } = {}) {
  const payload = createRentalVacancyMarketingPayload(values)
  const existing = await getRentalVacancyMarketing(payload.vacancy_id, { client: db })
  const query = existing
    ? client(db).from('rental_vacancy_marketing').update(payload).eq('id', existing.id).eq('version', Number(values.expectedVersion ?? existing.version)).select(FIELDS).maybeSingle()
    : client(db).from('rental_vacancy_marketing').insert({ ...payload, created_by: text(values.createdBy || values.created_by) || null }).select(FIELDS).single()
  const result = await query
  if (result.error) throw unavailable(result.error)
  if (!result.data) throw new Error('Marketing record changed elsewhere. Refresh and try again.')
  return mapRentalVacancyMarketing(result.data)
}

export async function transitionRentalVacancyMarketing(marketing, toStatus, { client: db = supabase } = {}) {
  if (!marketing?.id || !canTransitionRentalVacancyMarketing(marketing.status, toStatus)) throw new Error('Invalid rental marketing transition.')
  const result = await client(db).from('rental_vacancy_marketing').update({ status: text(toStatus) }).eq('id', marketing.id).eq('version', Number(marketing.version)).select(FIELDS).maybeSingle()
  if (result.error) throw unavailable(result.error)
  if (!result.data) throw new Error('Marketing record changed elsewhere. Refresh and try again.')
  return mapRentalVacancyMarketing(result.data)
}

export async function listRentalVacancyMedia(vacancyId, { client: db = supabase } = {}) {
  const result = await client(db).from('rental_vacancy_media').select(MEDIA_FIELDS).eq('vacancy_id', text(vacancyId)).order('sort_order')
  if (result.error) throw unavailable(result.error)
  return result.data || []
}

export async function uploadRentalVacancyMedia({ organisationId, vacancyId, branchId = '', file, mediaType = '', altText = '', createdBy = '' } = {}, { client: db = supabase } = {}) {
  if (!file || !text(organisationId) || !text(vacancyId)) throw new Error('A file, organisation and vacancy are required.')
  validateRentalMediaUpload(file)
  const resolvedMediaType = text(mediaType) || inferRentalMediaType(file)
  if (!['image', 'floorplan', 'video'].includes(resolvedMediaType)) throw new Error('Unsupported rental media type.')
  const extension = text(file.name).split('.').pop().replace(/[^a-z0-9]/gi, '').slice(0, 10) || 'bin'
  const objectPath = `${text(organisationId)}/${text(vacancyId)}/${crypto.randomUUID()}.${extension}`
  const storage = client(db).storage.from('rental-vacancy-media')
  const uploaded = await storage.upload(objectPath, file, { cacheControl: '3600', contentType: text(file.type) || undefined, upsert: false })
  if (uploaded.error) throw unavailable(uploaded.error)
  const result = await client(db).from('rental_vacancy_media').insert({ organisation_id: text(organisationId), vacancy_id: text(vacancyId), branch_id: text(branchId) || null, storage_bucket: 'rental-vacancy-media', storage_path: objectPath, media_type: resolvedMediaType, alt_text: text(altText) || null, created_by: text(createdBy) || null }).select(MEDIA_FIELDS).single()
  if (result.error) { await storage.remove([objectPath]); throw unavailable(result.error) }
  return result.data
}

export async function deleteRentalVacancyMedia(media, { client: db = supabase } = {}) {
  if (!media?.id || !text(media.storage_bucket) || !text(media.storage_path)) throw new Error('Rental media is required.')
  const storageResult = await client(db).storage.from(media.storage_bucket).remove([media.storage_path])
  if (storageResult.error) throw unavailable(storageResult.error)
  const result = await client(db).from('rental_vacancy_media').delete().eq('id', media.id)
  if (result.error) throw unavailable(result.error)
}
