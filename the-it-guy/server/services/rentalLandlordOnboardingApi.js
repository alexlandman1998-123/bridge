import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { validateRentalDocumentUpload } from './rentalApplicationDocumentUpload.js'
import { mapRentalRequirement } from '../../src/services/rentals/rentalSavedRequirementModel.js'
import {
  rentalLandlordDiscovery,
  publicRentalLandlordDiscovery,
  mergeRentalLandlordDiscovery,
  rentalLandlordSubmissionErrors,
} from '../../src/services/rentals/rentalLandlordOnboardingModel.js'
const bucket = 'rental-landlord-onboarding'
const bearer = (headers) =>
  String(headers.authorization || headers.Authorization || '')
    .replace(/^Bearer /, '')
    .trim()
const signature = (payload, secret) =>
  createHmac('sha256', secret).update(payload).digest('base64url')
const hash = (value) => createHash('sha256').update(value).digest('hex')
const fail = (error) => ({
  status: /changed|locked/.test(error.message) ? 409 : 400,
  body: { error: error.message || 'Unable to complete landlord onboarding.' },
})
async function snapshot(db, lead, source) {
  const result = await db.rpc('rental_landlord_onboarding_snapshot', {
    p_lead_id: lead.lead_id,
    p_scope: scope(lead),
  })
  if (result.error || !result.data)
    throw new Error(
      result.error?.message ||
        'Unable to load landlord onboarding. Check that its migrations are applied.',
    )
  const saved = result.data
  const data = rentalLandlordDiscovery(saved.payload)
  const m =
    saved.payload?.rentalCrm || saved.payload?.rental_crm || saved.payload || {}
  const response = {
    id: lead.lead_id,
    version: saved.version,
    status: saved.status,
    data: source === 'landlord' ? publicRentalLandlordDiscovery(data) : data,
    requirements: (saved.requirements || []).map(mapRentalRequirement),
    documents: saved.documents || [],
    requestedChanges: m.landlordRequestedChanges || '',
  }
  if (source === 'agent') response.accessLinks = saved.accessLinks || []
  Object.defineProperty(response, 'savedDiscovery', { value: data })
  return response
}
const scope = (lead) =>
  Object.fromEntries(
    ['organisation_id', 'branch_id', 'assigned_agent_id', 'assigned_user_id']
      .filter((key) => Object.hasOwn(lead, key))
      .map((key) => [key, lead[key]]),
  )
async function command(
  db,
  lead,
  body,
  source,
  actor,
  payload = body.patch || {},
) {
  const result = await db.rpc('rental_landlord_onboarding_command', {
    p_lead_id: lead.lead_id,
    p_expected_version: body.version,
    p_command: body.action,
    p_payload: payload,
    p_scope: scope(lead),
    p_source: source,
    p_actor: actor || null,
  })
  if (result.error) throw new Error(result.error.message)
  return result.data
}
async function operate(db, lead, input, source, actor, secret) {
  const { method, body = {} } = input
  const metadata =
    lead.raw_enquiry_payload?.rentalCrm ||
    lead.raw_enquiry_payload?.rental_crm ||
    lead.raw_enquiry_payload ||
    {}
  if (metadata.role !== 'landlord') throw new Error('Choose a landlord lead.')
  const current = await snapshot(db, lead, source)
  if (method === 'GET') return { status: 200, body: { onboarding: current } }
  if (method !== 'POST' && method !== 'PATCH')
    return { status: 405, body: { error: 'Method not allowed.' } }
  const action = method === 'PATCH' ? 'save' : body.action
  if (action === 'create_access' || action === 'revoke_access') {
    if (source !== 'agent') throw new Error('Agent access management required.')
    if (action === 'revoke_access') {
      const result = await db
        .from('rental_landlord_onboarding_access')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', body.accessId)
        .eq('lead_id', lead.lead_id)
      if (result.error) throw result.error
      return { status: 200, body: { revoked: true } }
    }
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString()
    const result = await db
      .from('rental_landlord_onboarding_access')
      .insert({
        lead_id: lead.lead_id,
        organisation_id: lead.organisation_id,
        token_hash: hash(token),
        expires_at: expiresAt,
        created_by: actor,
      })
      .select('id')
      .single()
    if (result.error) throw result.error
    return {
      status: 201,
      body: { accessId: result.data.id, token, expiresAt },
    }
  }
  if (!Number.isInteger(body.version))
    throw new Error('The saved onboarding version is required.')
  // The locked handoff command recognises committed retries before checking version.
  if (!['complete_upload', 'link_property'].includes(action) && body.version !== current.version)
    throw new Error('Landlord onboarding changed; reopen before saving.')
  if (
    current.status !== 'draft' &&
    ['save', 'prepare_upload', 'submit'].includes(action)
  )
    throw new Error(
      'Submitted onboarding is locked; request corrections first.',
    )
  let result, completedId
  if (action === 'prepare_upload') {
    const requirement = current.requirements.find(
      (row) =>
        row.active &&
        row.id === body.requirementId &&
        row.generation === body.generation,
    )
    if (!requirement)
      throw new Error(
        'The saved evidence requirement changed; save discovery first.',
      )
    const policy = validateRentalDocumentUpload({
      fileName: body.fileName,
      mimeType: body.mimeType,
      binary: { length: body.fileSize },
    })
    const id = randomUUID()
    const path = `${lead.organisation_id}/${lead.lead_id}/${id}-${policy.safeFileName}`
    const signed = await db.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: false })
    if (signed.error) throw signed.error
    const value = {
      id,
      leadId: lead.lead_id,
      organisationId: lead.organisation_id,
      version: body.version,
      requirementId: requirement.id,
      generation: requirement.generation,
      source,
      fileName: policy.safeFileName,
      mimeType: policy.mimeType,
      fileSize: body.fileSize,
      storagePath: path,
      expiresAt: Date.now() + 600000,
    }
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url')
    return {
      status: 201,
      body: {
        uploadUrl: signed.data.signedUrl,
        ticket: `${payload}.${signature(payload, secret)}`,
      },
    }
  }
  if (action === 'complete_upload') {
    const [payload = '', digest = ''] = String(body.ticket || '').split('.')
    const expected = signature(payload, secret)
    if (
      digest.length !== expected.length ||
      !timingSafeEqual(Buffer.from(digest), Buffer.from(expected))
    )
      throw new Error('Invalid upload receipt.')
    const ticket = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    )
    if (
      ticket.leadId !== lead.lead_id ||
      ticket.organisationId !== lead.organisation_id ||
      ticket.source !== source ||
      ticket.expiresAt <= Date.now() ||
      ticket.version !== body.version
    )
      throw new Error('Upload receipt is unavailable or expired.')
    const info = await db.storage.from(bucket).info(ticket.storagePath)
    if (info.error || !info.data)
      throw new Error('File upload is incomplete; retry it.')
    if (
      Number(info.data.size) !== ticket.fileSize ||
      info.data.contentType !== ticket.mimeType
    )
      throw new Error('The uploaded file differs from the selected document.')
    completedId = ticket.id
    try {
      result = await command(
        db,
        lead,
        { ...body, action },
        source,
        actor,
        ticket,
      )
    } catch (cause) {
      // Do not delete bytes after an uncertain acknowledgement of a committed write.
      const stored = await db
        .from('rental_landlord_onboarding_documents')
        .select('id')
        .eq('id', ticket.id)
        .eq('lead_id', lead.lead_id)
        .maybeSingle()
        .catch(() => ({ error: true }))
      if (!stored.error && !stored.data)
        await db.storage
          .from(bucket)
          .remove([ticket.storagePath])
          .catch(() => null)
      throw cause
    }
  } else if (action === 'save') {
    const merged = mergeRentalLandlordDiscovery(
      current.savedDiscovery,
      body.patch,
      { publicSource: source === 'landlord' },
    )
    // A managed property must remain within the lead's organisation/branch.
    for (const property of merged.portfolio)
      if (property.canonicalPropertyId) {
        const managed = await db
          .from('rental_properties')
          .select('organisation_id,branch_id')
          .eq('id', property.canonicalPropertyId)
          .maybeSingle()
        if (
          managed.error ||
          !managed.data ||
          managed.data.organisation_id !== lead.organisation_id ||
          (lead.branch_id && managed.data.branch_id !== lead.branch_id)
        )
          throw new Error(
            'Choose a managed property in this landlord workspace.',
          )
      }
    result = await command(db, lead, { ...body, action }, source, actor, {
      ...merged,
      ...(body.expectedDiscovery
        ? { expectedDiscovery: body.expectedDiscovery }
        : {}),
    })
  } else if (action === 'link_property') {
    if (source !== 'agent') throw new Error('Agent handoff required.')
    const patch = body.patch || {}
    if (patch.listingId) {
      const listing = await db
        .from('private_listings')
        .select('id,organisation_id,branch_id')
        .eq('id', patch.listingId)
        .maybeSingle()
      if (
        listing.error ||
        !listing.data ||
        listing.data.organisation_id !== lead.organisation_id
      )
        throw new Error('Listing outside landlord scope.')
    }
    const linked = await db.rpc('rental_landlord_onboarding_link_property', {
      p_lead_id: lead.lead_id,
      p_expected_version: body.version,
      p_payload: patch,
      p_scope: scope(lead),
      p_actor: actor,
    })
    if (linked.error) throw linked.error
    result = linked.data
  } else if (action === 'submit') {
    const errors = rentalLandlordSubmissionErrors(current.data)
    if (errors.length) throw new Error(errors[0])
    result = await command(db, lead, { ...body, action }, source, actor, {
      declarationAccepted: body.declarationAccepted,
    })
  } else if (action === 'review_document' || action === 'request_changes') {
    if (source !== 'agent') throw new Error('Agent review required.')
    result = await command(
      db,
      lead,
      { ...body, action },
      source,
      actor,
      body.patch || {},
    )
  } else if (action === 'document_url') {
    const document = await db
      .from('rental_landlord_onboarding_documents')
      .select('storage_path')
      .eq('lead_id', lead.lead_id)
      .eq('id', body.documentId)
      .maybeSingle()
    if (
      document.error ||
      !document.data?.storage_path.startsWith(
        `${lead.organisation_id}/${lead.lead_id}/`,
      )
    )
      throw new Error('Document unavailable in this scope.')
    const signed = await db.storage
      .from(bucket)
      .createSignedUrl(document.data.storage_path, 60)
    if (signed.error) throw signed.error
    return { status: 200, body: { url: signed.data.signedUrl } }
  } else throw new Error('Unsupported landlord onboarding action.')
  // Return the committed version even when a subsequent read fails.
  try {
    const fresh = await db
      .from('leads')
      .select('*')
      .eq('lead_id', lead.lead_id)
      .maybeSingle()
    if (fresh.error || !fresh.data) throw new Error('Readback unavailable')
    return {
      status: 200,
      body: {
        onboarding: await snapshot(db, fresh.data, source),
        documentId: completedId,
      },
    }
  } catch {
    return {
      status: 200,
      body: {
        saved: true,
        version: result.version,
        status: result.status,
        documentId: completedId,
        checklistUnavailable: true,
      },
    }
  }
}
export async function handleRentalLandlordOnboarding({
  method = 'GET',
  headers = {},
  body = {},
  env = process.env,
  clientFactory = createClient,
} = {}) {
  try {
    const jwt = bearer(headers)
    if (!jwt)
      return {
        status: 401,
        body: { error: 'Sign in to manage landlord onboarding.' },
      }
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
    const scoped = clientFactory(
      url,
      env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY,
      {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    )
    const user = await scoped.auth.getUser(jwt)
    if (user.error || !user.data?.user)
      return {
        status: 401,
        body: { error: 'Sign in to manage landlord onboarding.' },
      }
    const parent = await scoped
      .from('leads')
      .select('*')
      .eq('lead_id', body.leadId)
      .maybeSingle()
    if (parent.error || !parent.data)
      return {
        status: 404,
        body: { error: 'Landlord unavailable in your current scope.' },
      }
    const branchAccess = await scoped.rpc('rental_branch_access', {
      target_org: parent.data.organisation_id,
      target_branch: parent.data.branch_id || null,
    })
    if (branchAccess.error || branchAccess.data !== true)
      return {
        status: 404,
        body: { error: 'Landlord unavailable in your current rental branch.' },
      }
    if (body.action === 'link_property' && body.patch?.listingId) {
      const listing = await scoped
        .from('private_listings')
        .select('id')
        .eq('id', body.patch.listingId)
        .eq('organisation_id', parent.data.organisation_id)
        .maybeSingle()
      if (listing.error || !listing.data)
        return {
          status: 404,
          body: { error: 'Listing unavailable in your current scope.' },
        }
    }
    const db = clientFactory(url, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    return await operate(
      db,
      parent.data,
      { method, body },
      'agent',
      user.data.user.id,
      env.SUPABASE_SERVICE_ROLE_KEY,
    )
  } catch (cause) {
    return fail(cause)
  }
}
export async function handlePublicRentalLandlordOnboarding({
  method = 'GET',
  headers = {},
  body = {},
  env = process.env,
  clientFactory = createClient,
} = {}) {
  try {
    const token = bearer(headers)
    if (!token)
      return {
        status: 401,
        body: { error: 'This onboarding link is invalid or expired.' },
      }
    const db = clientFactory(
      env.SUPABASE_URL || env.VITE_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const access = await db
      .from('rental_landlord_onboarding_access')
      .select('lead_id,organisation_id,expires_at,revoked_at')
      .eq('token_hash', hash(token))
      .maybeSingle()
    if (
      access.error ||
      !access.data ||
      access.data.revoked_at ||
      Date.parse(access.data.expires_at) <= Date.now()
    )
      return {
        status: 401,
        body: { error: 'This onboarding link is invalid or expired.' },
      }
    const parent = await db
      .from('leads')
      .select('*')
      .eq('lead_id', access.data.lead_id)
      .eq('organisation_id', access.data.organisation_id)
      .maybeSingle()
    if (parent.error || !parent.data)
      return {
        status: 404,
        body: { error: 'Landlord onboarding is unavailable.' },
      }
    return await operate(
      db,
      parent.data,
      { method, body },
      'landlord',
      null,
      env.SUPABASE_SERVICE_ROLE_KEY,
    )
  } catch (cause) {
    return fail(cause)
  }
}
