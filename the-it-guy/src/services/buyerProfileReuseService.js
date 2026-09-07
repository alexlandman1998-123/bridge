import { BUYER_PROFILE_REUSE_POLICY_VERSION, buildBuyerProfileReuseReceipt, normalizeBuyerProfileKey, resolveBuyerProfileReusePolicy } from '../core/buyers/reusableBuyerProfilePolicy.js'
import { supabase } from '../lib/supabaseClient.js'

const text = (value) => String(value || '').trim()

function requireClient(client) {
  if (!client) throw new Error('Supabase is not configured.')
  return client
}

function profilePayload(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

async function recordBuyerPartyEvent(db, transactionId, eventType, eventData) {
  const result = await db.from('transaction_events').insert({
    transaction_id: transactionId,
    event_type: eventType,
    event_data: { source: 'transaction_buyer_parties_phase5', ...eventData },
  })
  if (result.error) throw result.error
}

export async function listReusableBuyerProfiles({ organisationId = null, limit = 100, client = supabase } = {}) {
  const db = requireClient(client)
  let query = db
    .from('buyers')
    .select('id, organisation_id, name, email, phone')
    .order('name', { ascending: true })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 250)))
  if (text(organisationId)) query = query.eq('organisation_id', text(organisationId))
  const result = await query
  if (result.error) throw result.error
  return result.data || []
}

export async function createReusableBuyerProfile({ name, email = '', phone = '', organisationId, profileData = {}, client = supabase } = {}) {
  const db = requireClient(client)
  const normalizedName = text(name)
  const normalizedEmail = text(email).toLowerCase() || null
  const normalizedPhone = text(phone) || null
  const normalizedOrganisationId = text(organisationId)
  if (!normalizedName) throw new Error('Buyer full name is required.')
  if (!normalizedOrganisationId) throw new Error('An organisation is required to create a buyer profile.')

  let existing = null
  if (normalizedEmail) {
    const result = await db.from('buyers').select('id, organisation_id, name, email, phone')
      .eq('organisation_id', normalizedOrganisationId).ilike('email', normalizedEmail).limit(1).maybeSingle()
    if (result.error) throw result.error
    existing = result.data || null
  }
  if (!existing && normalizedPhone) {
    const result = await db.from('buyers').select('id, organisation_id, name, email, phone')
      .eq('organisation_id', normalizedOrganisationId).eq('phone', normalizedPhone).limit(1).maybeSingle()
    if (result.error) throw result.error
    existing = result.data || null
  }
  if (existing) return { buyer: existing, created: false }

  const result = await db.from('buyers').insert({
    organisation_id: normalizedOrganisationId,
    name: normalizedName,
    email: normalizedEmail,
    phone: normalizedPhone,
  }).select('id, organisation_id, name, email, phone').single()
  if (result.error) throw result.error
  const profile = await saveReusableBuyerProfile({ buyerId: result.data.id, profileData, client: db })
  return { buyer: result.data, profile, created: true }
}

export async function getReusableBuyerProfile({ buyerId, client = supabase } = {}) {
  const normalizedBuyerId = text(buyerId)
  if (!normalizedBuyerId) throw new Error('Buyer is required.')
  const db = requireClient(client)
  const [buyerResult, profileResult, documentsResult] = await Promise.all([
    db.from('buyers').select('id, organisation_id, name, email, phone').eq('id', normalizedBuyerId).maybeSingle(),
    db.from('buyer_profile_data').select('buyer_id, profile_data, profile_version, policy_version, updated_at').eq('buyer_id', normalizedBuyerId).maybeSingle(),
    db.from('buyer_profile_documents').select('id, buyer_id, document_key, document_name, storage_bucket, storage_path, file_url, mime_type, content_sha256, source_version, policy_version, updated_at').eq('buyer_id', normalizedBuyerId).eq('is_active', true).order('updated_at', { ascending: false }),
  ])
  if (buyerResult.error) throw buyerResult.error
  if (profileResult.error) throw profileResult.error
  if (documentsResult.error) throw documentsResult.error
  if (!buyerResult.data) throw new Error('Buyer not found.')
  return { buyer: buyerResult.data, profile: profileResult.data || null, documents: documentsResult.data || [] }
}

export async function saveBuyerProfileIdentity({ buyerId, name, email, phone, client = supabase } = {}) {
  const normalizedBuyerId = text(buyerId)
  if (!normalizedBuyerId) throw new Error('Buyer is required.')
  const db = requireClient(client)
  const identity = {
    name: text(name) || 'Client / Buyer',
    email: text(email).toLowerCase() || null,
    phone: text(phone) || null,
  }
  const result = await db.from('buyers').update(identity).eq('id', normalizedBuyerId).select('id, organisation_id, name, email, phone').single()
  if (result.error) throw result.error
  const participantResult = await db.from('transaction_participants').update({
    participant_name: identity.name,
    participant_email: identity.email,
    participant_phone: identity.phone,
    updated_at: new Date().toISOString(),
  }).eq('buyer_party_id', normalizedBuyerId)
  if (participantResult.error) throw participantResult.error
  return result.data
}

export async function listBuyerProfileTransactions({ buyerId, client = supabase } = {}) {
  const normalizedBuyerId = text(buyerId)
  if (!normalizedBuyerId) throw new Error('Buyer is required.')
  const db = requireClient(client)
  const result = await db.from('transactions')
    .select('id, transaction_reference, development_id, unit_id, stage, current_main_stage, purchase_price, sales_price, updated_at, development:developments(name), unit:units(unit_number)')
    .eq('buyer_id', normalizedBuyerId)
    .order('updated_at', { ascending: false })
  if (result.error) throw result.error
  return result.data || []
}

export async function listReusableBuyerProfileTransactionIds({ buyerId, client = supabase } = {}) {
  const normalizedBuyerId = text(buyerId)
  if (!normalizedBuyerId) throw new Error('Buyer is required.')
  const db = requireClient(client)
  const result = await db.from('transaction_participants')
    .select('transaction_id')
    .eq('buyer_party_id', normalizedBuyerId)
    .is('removed_at', null)
  if (result.error) throw result.error
  return [...new Set((result.data || []).map((row) => text(row.transaction_id)).filter(Boolean))]
}

export async function saveReusableBuyerProfile({ buyerId, profileData, actorUserId = null, client = supabase } = {}) {
  const normalizedBuyerId = text(buyerId)
  if (!normalizedBuyerId) throw new Error('Buyer is required.')
  const db = requireClient(client)
  const existing = await db.from('buyer_profile_data').select('profile_version').eq('buyer_id', normalizedBuyerId).maybeSingle()
  if (existing.error) throw existing.error
  const payload = {
    buyer_id: normalizedBuyerId,
    profile_data: profilePayload(profileData),
    profile_version: Number(existing.data?.profile_version || 0) + 1,
    policy_version: BUYER_PROFILE_REUSE_POLICY_VERSION,
    updated_by: actorUserId || null,
    updated_at: new Date().toISOString(),
  }
  const result = await db.from('buyer_profile_data').upsert(payload, { onConflict: 'buyer_id' }).select('buyer_id, profile_data, profile_version, policy_version, updated_at').single()
  if (result.error) throw result.error
  return result.data
}

export async function registerReusableBuyerDocument({ buyerId, documentKey, documentName, sourceDocumentId = null, storageBucket = null, storagePath = null, fileUrl = null, mimeType = null, contentSha256 = null, actorUserId = null, client = supabase } = {}) {
  const normalizedBuyerId = text(buyerId)
  const key = normalizeBuyerProfileKey(documentKey)
  if (!normalizedBuyerId || !key) throw new Error('Buyer and document key are required.')
  const db = requireClient(client)
  const policy = resolveBuyerProfileReusePolicy(key, { kind: 'document' })
  const existing = await db.from('buyer_profile_documents').select('id, source_version').eq('buyer_id', normalizedBuyerId).eq('document_key', key).maybeSingle()
  if (existing.error) throw existing.error
  const payload = {
    buyer_id: normalizedBuyerId,
    source_document_id: text(sourceDocumentId) || null,
    document_key: key,
    document_name: text(documentName) || key.replace(/_/g, ' '),
    storage_bucket: text(storageBucket) || null,
    storage_path: text(storagePath) || null,
    file_url: text(fileUrl) || null,
    mime_type: text(mimeType) || null,
    content_sha256: text(contentSha256) || null,
    source_version: Number(existing.data?.source_version || 0) + 1,
    policy_version: policy.policyVersion,
    is_active: true,
    updated_by: actorUserId || null,
    updated_at: new Date().toISOString(),
  }
  const result = existing.data?.id
    ? await db.from('buyer_profile_documents').update(payload).eq('id', existing.data.id).select('id, buyer_id, document_key, source_version, policy_version').single()
    : await db.from('buyer_profile_documents').insert(payload).select('id, buyer_id, document_key, source_version, policy_version').single()
  if (result.error) throw result.error
  return result.data
}

export async function reuseBuyerProfileSourceForTransaction({ transactionId, buyerId, profileKey, kind = 'input', buyerProfileDocumentId = null, sourceVersion = 1, actorUserId = null, client = supabase } = {}) {
  const normalizedTransactionId = text(transactionId)
  const normalizedBuyerId = text(buyerId)
  const normalizedKind = normalizeBuyerProfileKey(kind)
  const sourceKind = normalizedKind === 'document' ? 'profile_document' : 'profile_data'
  const receipt = buildBuyerProfileReuseReceipt({ buyerId: normalizedBuyerId, sourceId: buyerProfileDocumentId, sourceVersion, key: profileKey, kind: normalizedKind })
  if (!normalizedTransactionId || !normalizedBuyerId || !receipt.key) throw new Error('Transaction, buyer, and profile key are required.')
  if (sourceKind === 'profile_document' && !text(buyerProfileDocumentId)) throw new Error('A reusable buyer document must have a profile document source.')
  const db = requireClient(client)
  const payload = {
    transaction_id: normalizedTransactionId,
    buyer_id: normalizedBuyerId,
    buyer_profile_document_id: sourceKind === 'profile_document' ? text(buyerProfileDocumentId) : null,
    profile_key: receipt.key,
    source_kind: sourceKind,
    source_version: Number(sourceVersion) || 1,
    policy_version: receipt.policyVersion,
    used_by: actorUserId || null,
    used_at: receipt.usedAt,
  }
  let lookup = db.from('transaction_buyer_profile_references')
    .select('id')
    .eq('transaction_id', normalizedTransactionId)
    .eq('buyer_id', normalizedBuyerId)
    .eq('profile_key', receipt.key)
    .eq('source_kind', sourceKind)
    .eq('source_version', payload.source_version)
  lookup = sourceKind === 'profile_document'
    ? lookup.eq('buyer_profile_document_id', payload.buyer_profile_document_id)
    : lookup.is('buyer_profile_document_id', null)
  const existing = await lookup.maybeSingle()
  if (existing.error) throw existing.error
  const result = existing.data?.id
    ? await db.from('transaction_buyer_profile_references').update(payload).eq('id', existing.data.id).select().single()
    : await db.from('transaction_buyer_profile_references').insert(payload).select().single()
  if (result.error) throw result.error
  return result.data
}

// Records immutable receipts rather than copying profile inputs or files into a
// transaction. A later profile edit creates a new version; existing matters
// continue to point at the version used when the transaction was opened.
export async function reuseBuyerProfileForTransaction({ transactionId, buyerId, actorUserId = null, client = supabase } = {}) {
  const reusable = await getReusableBuyerProfile({ buyerId, client })
  const profile = reusable.profile || {}
  const profileData = profilePayload(profile.profile_data)
  const profileKeys = Object.keys(profileData)
  const references = await Promise.all([
    ...profileKeys.map((profileKey) =>
      reuseBuyerProfileSourceForTransaction({
        transactionId,
        buyerId,
        profileKey,
        kind: 'input',
        sourceVersion: Number(profile.profile_version) || 1,
        actorUserId,
        client,
      }),
    ),
    ...(reusable.documents || []).map((document) =>
      reuseBuyerProfileSourceForTransaction({
        transactionId,
        buyerId,
        profileKey: document.document_key,
        kind: 'document',
        buyerProfileDocumentId: document.id,
        sourceVersion: Number(document.source_version) || 1,
        actorUserId,
        client,
      }),
    ),
  ])
  return { buyer: reusable.buyer, references }
}

export async function listTransactionBuyerParties({ transactionId, client = supabase } = {}) {
  const db = requireClient(client)
  const id = text(transactionId)
  if (!id) throw new Error('Transaction is required.')
  const result = await db.from('transaction_participants')
    .select('id, transaction_id, buyer_party_id, participant_name, participant_email, participant_phone, buyer_party_role, buyer_party_position, is_primary_buyer, buyer_profile_status, buyer_onboarding_status, buyer_onboarding_completed_at, buyer_source, buyer_metadata, ownership_percentage, signing_required')
    .eq('transaction_id', id)
    .eq('transaction_role', 'buyer')
    .is('removed_at', null)
    .order('buyer_party_position', { ascending: true })
  if (result.error) throw result.error
  return result.data || []
}

export async function updateTransactionBuyerParty({ transactionId, participantId, ownershipPercentage = null, signingRequired = true, partyRole = '', client = supabase } = {}) {
  const db = requireClient(client)
  const id = text(transactionId)
  const participant = text(participantId)
  if (!id || !participant) throw new Error('Transaction buyer party is required.')
  const parsedOwnership = ownershipPercentage === '' || ownershipPercentage === null || ownershipPercentage === undefined
    ? null
    : Number(ownershipPercentage)
  if (parsedOwnership !== null && (!Number.isFinite(parsedOwnership) || parsedOwnership < 0 || parsedOwnership > 100)) {
    throw new Error('Ownership must be between 0 and 100%.')
  }
  const current = await db.from('transaction_participants').select('buyer_metadata, ownership_percentage, signing_required').eq('transaction_id', id).eq('id', participant).single()
  if (current.error) throw current.error
  const result = await db.from('transaction_participants').update({
    ownership_percentage: parsedOwnership,
    signing_required: Boolean(signingRequired),
    buyer_metadata: { ...(current.data?.buyer_metadata || {}), partyRole: text(partyRole) || null, modelVersion: 'transaction_buyers_phase4_v1' },
    updated_at: new Date().toISOString(),
  }).eq('transaction_id', id).eq('id', participant).select().single()
  if (result.error) throw result.error
  await recordBuyerPartyEvent(db, id, 'BuyerPartyUpdated', {
    participantId: participant,
    before: { ownershipPercentage: current.data?.ownership_percentage ?? null, signingRequired: current.data?.signing_required !== false, partyRole: current.data?.buyer_metadata?.partyRole || null },
    after: { ownershipPercentage: parsedOwnership, signingRequired: Boolean(signingRequired), partyRole: text(partyRole) || null },
  })
  return result.data
}

export async function setTransactionPrimaryBuyerParty({ transactionId, participantId, client = supabase } = {}) {
  const db = requireClient(client)
  const transaction = text(transactionId)
  const participant = text(participantId)
  if (!transaction || !participant) throw new Error('Transaction buyer party is required.')

  const current = await db.from('transaction_participants')
    .select('id, buyer_party_id, participant_name')
    .eq('transaction_id', transaction)
    .eq('id', participant)
    .eq('transaction_role', 'buyer')
    .is('removed_at', null)
    .single()
  if (current.error) throw current.error

  const reset = await db.from('transaction_participants')
    .update({ is_primary_buyer: false, buyer_party_role: 'additional_buyer', updated_at: new Date().toISOString() })
    .eq('transaction_id', transaction)
    .eq('transaction_role', 'buyer')
    .is('removed_at', null)
  if (reset.error) throw reset.error

  const primary = await db.from('transaction_participants')
    .update({ is_primary_buyer: true, buyer_party_role: 'primary_buyer', updated_at: new Date().toISOString() })
    .eq('id', participant)
    .select('id, buyer_party_id, participant_name')
    .single()
  if (primary.error) throw primary.error

  const transactionPatch = {
    primary_buyer_participant_id: primary.data.id,
    buyer_parties_model_version: 'transaction_buyers_phase4_v1',
    updated_at: new Date().toISOString(),
  }
  if (primary.data.buyer_party_id) transactionPatch.buyer_id = primary.data.buyer_party_id
  const transactionUpdate = await db.from('transactions').update(transactionPatch).eq('id', transaction)
  if (transactionUpdate.error) throw transactionUpdate.error

  await recordBuyerPartyEvent(db, transaction, 'BuyerPartyPrimaryAssigned', {
    participantId: primary.data.id,
    buyerId: primary.data.buyer_party_id || null,
    buyerName: primary.data.participant_name || null,
  })
  return primary.data
}

export async function linkReusableBuyerProfileToTransaction({ transactionId, buyerId, isPrimary = false, partyRole = 'co_purchaser', ownershipPercentage = null, signingRequired = true, client = supabase } = {}) {
  const db = requireClient(client)
  const transaction = text(transactionId)
  const buyer = text(buyerId)
  if (!transaction || !buyer) throw new Error('Transaction and buyer profile are required.')
  const profile = await db.from('buyers').select('id, name, email, phone').eq('id', buyer).single()
  if (profile.error) throw profile.error
  if (isPrimary) {
    const reset = await db.from('transaction_participants').update({ is_primary_buyer: false, buyer_party_role: 'additional_buyer' }).eq('transaction_id', transaction).eq('transaction_role', 'buyer').eq('is_primary_buyer', true)
    if (reset.error) throw reset.error
  }
  const existing = await db.from('transaction_participants').select('id').eq('transaction_id', transaction).eq('buyer_party_id', buyer).maybeSingle()
  if (existing.error) throw existing.error
  const payload = {
    transaction_id: transaction, buyer_party_id: buyer, participant_name: profile.data.name, participant_email: profile.data.email, participant_phone: profile.data.phone,
    role_type: 'buyer', legal_role: 'none', transaction_role: 'buyer', status: 'active',
    buyer_party_role: isPrimary ? 'primary_buyer' : 'additional_buyer', is_primary_buyer: Boolean(isPrimary), buyer_source: 'reusable_buyer_profile',
    ownership_percentage: ownershipPercentage === '' || ownershipPercentage === null ? null : Number(ownershipPercentage), signing_required: Boolean(signingRequired),
    buyer_metadata: { modelVersion: 'transaction_buyers_phase4_v1', partyRole: text(partyRole) || null, reusedBuyerProfile: true }, updated_at: new Date().toISOString(),
  }
  const saved = existing.data?.id ? await db.from('transaction_participants').update(payload).eq('id', existing.data.id).select().single() : await db.from('transaction_participants').insert(payload).select().single()
  if (saved.error) throw saved.error
  if (isPrimary) {
    const transactionUpdate = await db.from('transactions').update({ buyer_id: buyer, primary_buyer_participant_id: saved.data.id, buyer_parties_model_version: 'transaction_buyers_phase4_v1' }).eq('id', transaction)
    if (transactionUpdate.error) throw transactionUpdate.error
  }
  await reuseBuyerProfileForTransaction({ transactionId: transaction, buyerId: buyer, client: db })
  await recordBuyerPartyEvent(db, transaction, 'BuyerPartyLinked', { participantId: saved.data.id, buyerId: buyer, isPrimary: Boolean(isPrimary), partyRole: text(partyRole) || null })
  return saved.data
}

export async function removeTransactionBuyerParty({ transactionId, participantId, client = supabase } = {}) {
  const db = requireClient(client)
  const transaction = text(transactionId)
  const participant = text(participantId)
  if (!transaction || !participant) throw new Error('Transaction buyer party is required.')
  const existing = await db.from('transaction_participants').select('id, buyer_party_id, participant_name, is_primary_buyer').eq('transaction_id', transaction).eq('id', participant).single()
  if (existing.error) throw existing.error
  if (existing.data?.is_primary_buyer) throw new Error('Assign another buyer as primary before removing this buyer party.')
  const now = new Date().toISOString()
  const result = await db.from('transaction_participants').update({ status: 'removed', removed_at: now, updated_at: now }).eq('transaction_id', transaction).eq('id', participant).select('id').single()
  if (result.error) throw result.error
  await recordBuyerPartyEvent(db, transaction, 'BuyerPartyRemoved', { participantId: participant, buyerId: existing.data?.buyer_party_id || null, buyerName: existing.data?.participant_name || null, removedAt: now })
  return result.data
}

export async function listTransactionBuyerPartyHistory({ transactionId, client = supabase } = {}) {
  const db = requireClient(client)
  const transaction = text(transactionId)
  if (!transaction) throw new Error('Transaction is required.')
  const result = await db.from('transaction_events').select('id, event_type, event_data, created_at, created_by, created_by_role').eq('transaction_id', transaction).in('event_type', ['BuyerPartyUpdated', 'BuyerPartyLinked', 'BuyerPartyRemoved']).order('created_at', { ascending: false }).limit(30)
  if (result.error) throw result.error
  return result.data || []
}
