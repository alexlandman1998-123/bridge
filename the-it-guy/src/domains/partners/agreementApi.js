// partners owns these operations and their existing recovery behavior.
import { fetchDeveloperPartnerRelationshipById } from './invitationActions.js'
import { normalizeDeveloperPartnerType, getDeveloperPartnerTypeLabel, normalizeDeveloperPartnerOrganisation, normalizeDeveloperPartnerAgreementTerm, normalizeDeveloperPartnerAgreement, normalizeDeveloperPartnerRelationship, normalizeDeveloperPartnerScopeType } from './readApi.js'
import { normalizeNullableUuid, normalizeNullableText, requireClient, isMissingTableError, isMissingColumnError, isMissingSchemaError, isPermissionDeniedError, normalizeTextValue } from '../../lib/api/shared/readHelpers.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { getCurrentSupabaseUserId } from '../access/currentUser.js'
import { setDeveloperCanonicalPartnerDefault } from '../transactions/detailApi.js'

function getDeveloperPartnerAgreementTypeForRelationship(partnerType = '') {
  const normalized = normalizeDeveloperPartnerType(partnerType)
  if (normalized === 'transfer_attorney') return 'transfer_attorney_sla'
  if (normalized === 'bond_originator') return 'bond_originator_sla'
  return 'agency_mandate'
}

function getDeveloperPartnerAgreementTemplateKey(agreementType = '') {
  const normalized = normalizeTextValue(agreementType).toLowerCase()
  if (normalized === 'transfer_attorney_sla') return 'developer_transfer_attorney_sla_v1'
  if (normalized === 'bond_originator_sla') return 'developer_bond_originator_sla_v1'
  return 'developer_agency_mandate_v1'
}

function buildDeveloperPartnerAgreementTerms({ relationship = {}, agreementType = '' } = {}) {
  const normalizedAgreementType = normalizeTextValue(agreementType).toLowerCase()
  const baseTerms = {
    version: 1,
    agreementType: normalizedAgreementType,
    partnerType: normalizeDeveloperPartnerType(relationship.partner_type || relationship.partnerType),
    scopeType: normalizeDeveloperPartnerScopeType(relationship.scope_type || relationship.scopeType),
    scopeJson:
      relationship.scope_json && typeof relationship.scope_json === 'object'
        ? relationship.scope_json
        : relationship.scopeJson && typeof relationship.scopeJson === 'object'
          ? relationship.scopeJson
          : {},
    commercialTerms: {
      status: 'to_be_confirmed',
    },
    escalation: {
      primaryContact: '',
      escalationContact: '',
      reviewCadence: 'Monthly',
    },
  }

  if (normalizedAgreementType === 'agency_mandate') {
    return {
      ...baseTerms,
      mandate: {
        developmentsCovered: baseTerms.scopeType,
        commissionStructure: 'to_be_confirmed',
        leadOwnership: 'developer_retains_master_record',
        reservationProcess: 'arch9_transaction_flow',
        marketingPermissions: 'subject_to_developer_approval',
        reportingExpectations: 'weekly_sales_pipeline_update',
      },
    }
  }

  if (normalizedAgreementType === 'transfer_attorney_sla') {
    return {
      ...baseTerms,
      serviceLevels: {
        instructionAcceptanceTarget: '1 business day',
        buyerDocumentReviewTarget: '2 business days',
        weeklyStatusFeedback: true,
        escalationAfterDays: 3,
      },
      responsibilities: {
        transferWorkflow: true,
        documentRequests: true,
        registrationFeedback: true,
      },
    }
  }

  return {
    ...baseTerms,
    serviceLevels: {
      buyerHandoffTarget: '1 business day',
      prequalificationTarget: '2 business days',
      bankSubmissionTarget: '3 business days after complete docs',
      feedbackCadence: 'Twice weekly',
    },
    responsibilities: {
      financeWorkflow: true,
      bankSubmissions: true,
      buyerFeedback: true,
    },
  }
}

function normalizeDeveloperPartnerInvitationContext(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const relationship = source.relationship && typeof source.relationship === 'object' ? source.relationship : {}
  const developer = source.developer && typeof source.developer === 'object' ? source.developer : {}
  const partner = source.partner && typeof source.partner === 'object' ? source.partner : null
  return {
    ok: Boolean(source.ok),
    reason: normalizeTextValue(source.reason),
    relationship: {
      id: normalizeTextValue(relationship.id),
      partnerType: normalizeDeveloperPartnerType(relationship.partnerType || relationship.partner_type),
      partnerTypeLabel: getDeveloperPartnerTypeLabel(relationship.partnerType || relationship.partner_type),
      status: normalizeTextValue(relationship.status),
      scopeType: normalizeDeveloperPartnerScopeType(relationship.scopeType || relationship.scope_type),
      scopeJson:
        relationship.scopeJson && typeof relationship.scopeJson === 'object'
          ? relationship.scopeJson
          : relationship.scope_json && typeof relationship.scope_json === 'object'
            ? relationship.scope_json
            : {},
      partnerDisplayName: normalizeTextValue(relationship.partnerDisplayName || relationship.partner_display_name),
      partnerInvitationEmail: normalizeEmailAddress(
        relationship.partnerInvitationEmail || relationship.partner_invitation_email,
      ),
      invitedAt: relationship.invitedAt || relationship.invited_at || null,
      expiresAt: relationship.expiresAt || relationship.expires_at || null,
    },
    developer: {
      id: normalizeTextValue(developer.id),
      name: normalizeTextValue(developer.name || developer.displayName || developer.display_name) || 'Developer',
    },
    partner: partner
      ? {
          id: normalizeTextValue(partner.id),
          name: normalizeTextValue(partner.name || partner.displayName || partner.display_name) || 'Partner',
        }
      : null,
  }
}

function normalizeDeveloperPartnerInviteDevelopment(row = null) {
  if (!row || typeof row !== 'object') return null
  return {
    id: normalizeTextValue(row.id),
    name: normalizeTextValue(row.name) || 'Untitled development',
    status: normalizeTextValue(row.status),
    location: normalizeTextValue(row.location),
  }
}

export async function fetchDeveloperPartnerInviteOptions({ organisationId } = {}) {
  const developerOrganisationId = normalizeNullableUuid(organisationId)
  if (!developerOrganisationId) {
    return { organisations: [], developments: [] }
  }

  const client = requireClient()
  let organisationsResult = await client
    .from('organisations')
    .select('id, name, display_name, legal_name, type, logo_url, status')
    .neq('id', developerOrganisationId)
    .order('display_name', { ascending: true })

  if (organisationsResult.error && isMissingColumnError(organisationsResult.error)) {
    organisationsResult = await client
      .from('organisations')
      .select('id, name, type')
      .neq('id', developerOrganisationId)
      .order('name', { ascending: true })
  }

  if (organisationsResult.error) {
    if (
      !isMissingTableError(organisationsResult.error, 'organisations') &&
      !isPermissionDeniedError(organisationsResult.error)
    ) {
      throw organisationsResult.error
    }
    organisationsResult = { data: [] }
  }

  let developmentsResult = await client
    .from('developments')
    .select('id, name, status, location, organisation_id')
    .eq('organisation_id', developerOrganisationId)
    .order('name', { ascending: true })

  if (
    developmentsResult.error &&
    (isMissingColumnError(developmentsResult.error, 'status') ||
      isMissingColumnError(developmentsResult.error, 'location'))
  ) {
    developmentsResult = await client
      .from('developments')
      .select('id, name, organisation_id')
      .eq('organisation_id', developerOrganisationId)
      .order('name', { ascending: true })
  }

  if (developmentsResult.error) {
    if (
      !isMissingTableError(developmentsResult.error, 'developments') &&
      !isMissingColumnError(developmentsResult.error, 'organisation_id') &&
      !isPermissionDeniedError(developmentsResult.error)
    ) {
      throw developmentsResult.error
    }
    developmentsResult = { data: [] }
  }

  return {
    organisations: (organisationsResult.data || [])
      .map((row) => normalizeDeveloperPartnerOrganisation(row))
      .filter(Boolean),
    developments: (developmentsResult.data || [])
      .map((row) => normalizeDeveloperPartnerInviteDevelopment(row))
      .filter(Boolean),
  }
}

export async function setDeveloperPartnerDefault(relationshipId) {
  const safeRelationshipId = normalizeNullableUuid(relationshipId)
  if (!safeRelationshipId) throw new Error('Partner relationship is required.')

  const client = requireClient()
  const relationship = await fetchDeveloperPartnerRelationshipById(client, safeRelationshipId)
  const developerOrganisationId = normalizeNullableUuid(relationship.developer_organisation_id)
  const partnerType = normalizeDeveloperPartnerType(relationship.partner_type)
  if (!developerOrganisationId) throw new Error('Developer organisation is required.')
  if (relationship.status !== 'agreement_active') {
    throw new Error('Activate or waive the partner agreement before setting this partner as a default.')
  }

  const agreementResult = await client
    .from('developer_partner_agreements')
    .select('id, status')
    .eq('relationship_id', safeRelationshipId)
    .in('status', ['active', 'signed', 'waived'])
    .limit(1)

  if (agreementResult.error) {
    if (
      !isMissingTableError(agreementResult.error, 'developer_partner_agreements') &&
      !isMissingSchemaError(agreementResult.error) &&
      !isPermissionDeniedError(agreementResult.error)
    ) {
      throw agreementResult.error
    }
  } else if (!(agreementResult.data || []).length) {
    throw new Error('This partner needs an active, signed or waived agreement before it can become a default.')
  }

  let partnerOrganisation = null
  const partnerOrganisationId = normalizeNullableUuid(relationship.partner_organisation_id)
  if (partnerOrganisationId) {
    const organisationResult = await client
      .from('organisations')
      .select('id, name, display_name, legal_name, type, website, phone, email, province')
      .eq('id', partnerOrganisationId)
      .maybeSingle()
    if (organisationResult.error && !isPermissionDeniedError(organisationResult.error)) {
      if (isMissingColumnError(organisationResult.error)) {
        const fallbackOrganisationResult = await client
          .from('organisations')
          .select('id, name, type')
          .eq('id', partnerOrganisationId)
          .maybeSingle()
        if (fallbackOrganisationResult.error && !isPermissionDeniedError(fallbackOrganisationResult.error)) {
          throw fallbackOrganisationResult.error
        }
        partnerOrganisation = fallbackOrganisationResult.data || null
      } else {
        throw organisationResult.error
      }
    } else {
      partnerOrganisation = organisationResult.data || null
    }
  }

  const companyName = normalizeTextValue(
    partnerOrganisation?.display_name ||
      partnerOrganisation?.legal_name ||
      partnerOrganisation?.name ||
      relationship.partner_display_name ||
      relationship.partner_invitation_email,
  )

  if (!companyName) throw new Error('This partner needs a name before it can be used as a default.')

  return setDeveloperCanonicalPartnerDefault({
    developerOrganisationId,
    preferredPartnerId: null,
    partnerOrganisationId: partnerOrganisationId || null,
    partnerType,
    companyName,
    contactPerson: normalizeNullableText(relationship.partner_display_name) || companyName,
    email: normalizeEmailAddress(relationship.partner_invitation_email || partnerOrganisation?.email) || null,
    phone: normalizeNullableText(partnerOrganisation?.phone),
    website: normalizeNullableText(partnerOrganisation?.website),
    province: normalizeNullableText(partnerOrganisation?.province),
    notes: `${getDeveloperPartnerTypeLabel(partnerType)} synced from Developer Partners.`,
    source: 'developer_partner_relationship',
    scopeType: normalizeDeveloperPartnerScopeType(relationship.scope_type),
    scopeJson:
      relationship.scope_json && typeof relationship.scope_json === 'object'
        ? relationship.scope_json
        : {},
  })
}

export async function acceptDeveloperPartnerRelationship(relationshipId) {
  const safeRelationshipId = normalizeNullableUuid(relationshipId)
  if (!safeRelationshipId) throw new Error('Partner relationship is required.')

  const client = requireClient()
  const currentUserId = await getCurrentSupabaseUserId(client)
  const payload = {
    status: 'accepted',
    accepted_at: new Date().toISOString(),
  }
  if (currentUserId) payload.accepted_by = currentUserId

  const result = await client
    .from('developer_partner_relationships')
    .update(payload)
    .eq('id', safeRelationshipId)
    .select(
      'id, developer_organisation_id, partner_organisation_id, partner_type, status, scope_type, scope_json, partner_display_name, partner_invitation_email, invited_by, invited_at, accepted_by, accepted_at, suspended_at, archived_at, metadata_json, created_at, updated_at',
    )
    .single()

  if (result.error) throw result.error
  return normalizeDeveloperPartnerRelationship(result.data)
}

export async function generateDeveloperPartnerAgreement(relationshipId) {
  const safeRelationshipId = normalizeNullableUuid(relationshipId)
  if (!safeRelationshipId) throw new Error('Partner relationship is required.')

  const client = requireClient()
  const relationship = await fetchDeveloperPartnerRelationshipById(client, safeRelationshipId)
  const relationshipStatus = normalizeTextValue(relationship.status).toLowerCase()
  if (relationshipStatus === 'archived' || relationshipStatus === 'suspended') {
    throw new Error('This partner relationship is not available for agreement generation.')
  }

  const agreementType = getDeveloperPartnerAgreementTypeForRelationship(relationship.partner_type)
  const existingAgreement = await client
    .from('developer_partner_agreements')
    .select(
      'id, relationship_id, agreement_type, status, template_key, generated_document_id, packet_id, effective_date, expiry_date, signed_at, terminated_at, waived_at, metadata_json, created_by, created_at, updated_at',
    )
    .eq('relationship_id', safeRelationshipId)
    .eq('agreement_type', agreementType)
    .not('status', 'in', '(terminated,expired)')
    .order('updated_at', { ascending: false })
    .limit(1)

  if (existingAgreement.error) throw existingAgreement.error
  if ((existingAgreement.data || []).length) {
    return normalizeDeveloperPartnerAgreement(existingAgreement.data[0])
  }

  const currentUserId = await getCurrentSupabaseUserId(client)
  const agreementPayload = {
    relationship_id: safeRelationshipId,
    agreement_type: agreementType,
    status: 'generated',
    template_key: getDeveloperPartnerAgreementTemplateKey(agreementType),
    effective_date: new Date().toISOString().slice(0, 10),
    metadata_json: {
      source: 'developer_partners_workspace',
      generationMode: 'manual_operational_record',
    },
  }
  if (currentUserId) agreementPayload.created_by = currentUserId

  const agreementResult = await client
    .from('developer_partner_agreements')
    .insert(agreementPayload)
    .select(
      'id, relationship_id, agreement_type, status, template_key, generated_document_id, packet_id, effective_date, expiry_date, signed_at, terminated_at, waived_at, metadata_json, created_by, created_at, updated_at',
    )
    .single()

  if (agreementResult.error) throw agreementResult.error

  const termsPayload = {
    agreement_id: agreementResult.data.id,
    terms_json: buildDeveloperPartnerAgreementTerms({
      relationship,
      agreementType,
    }),
  }
  const termsResult = await client
    .from('developer_partner_agreement_terms')
    .insert(termsPayload)
    .select('id, agreement_id, terms_json, created_at, updated_at')
    .single()

  if (termsResult.error) throw termsResult.error

  const relationshipUpdate = await client
    .from('developer_partner_relationships')
    .update({
      status: 'agreement_pending',
      accepted_at: relationship.accepted_at || new Date().toISOString(),
      ...(currentUserId && !relationship.accepted_by ? { accepted_by: currentUserId } : {}),
    })
    .eq('id', safeRelationshipId)

  if (relationshipUpdate.error) throw relationshipUpdate.error

  return normalizeDeveloperPartnerAgreement(
    agreementResult.data,
    new Map([[termsResult.data.agreement_id, normalizeDeveloperPartnerAgreementTerm(termsResult.data)]]),
  )
}

export async function activateDeveloperPartnerAgreement(agreementId) {
  const safeAgreementId = normalizeNullableUuid(agreementId)
  if (!safeAgreementId) throw new Error('Partner agreement is required.')

  const client = requireClient()
  const existing = await client
    .from('developer_partner_agreements')
    .select(
      'id, relationship_id, agreement_type, status, template_key, generated_document_id, packet_id, effective_date, expiry_date, signed_at, terminated_at, waived_at, metadata_json, created_by, created_at, updated_at',
    )
    .eq('id', safeAgreementId)
    .maybeSingle()

  if (existing.error) throw existing.error
  if (!existing.data) throw new Error('Partner agreement was not found.')

  const now = new Date().toISOString()
  const updateResult = await client
    .from('developer_partner_agreements')
    .update({
      status: 'active',
      signed_at: existing.data.signed_at || now,
      effective_date: existing.data.effective_date || now.slice(0, 10),
    })
    .eq('id', safeAgreementId)
    .select(
      'id, relationship_id, agreement_type, status, template_key, generated_document_id, packet_id, effective_date, expiry_date, signed_at, terminated_at, waived_at, metadata_json, created_by, created_at, updated_at',
    )
    .single()

  if (updateResult.error) throw updateResult.error

  const relationshipUpdate = await client
    .from('developer_partner_relationships')
    .update({ status: 'agreement_active' })
    .eq('id', updateResult.data.relationship_id)

  if (relationshipUpdate.error) throw relationshipUpdate.error
  return normalizeDeveloperPartnerAgreement(updateResult.data)
}

export async function waiveDeveloperPartnerAgreement(relationshipId) {
  const safeRelationshipId = normalizeNullableUuid(relationshipId)
  if (!safeRelationshipId) throw new Error('Partner relationship is required.')

  const client = requireClient()
  const relationship = await fetchDeveloperPartnerRelationshipById(client, safeRelationshipId)
  const agreementType = getDeveloperPartnerAgreementTypeForRelationship(relationship.partner_type)
  const currentUserId = await getCurrentSupabaseUserId(client)
  const now = new Date().toISOString()

  const existingAgreement = await client
    .from('developer_partner_agreements')
    .select(
      'id, relationship_id, agreement_type, status, template_key, generated_document_id, packet_id, effective_date, expiry_date, signed_at, terminated_at, waived_at, metadata_json, created_by, created_at, updated_at',
    )
    .eq('relationship_id', safeRelationshipId)
    .eq('agreement_type', agreementType)
    .not('status', 'in', '(terminated,expired)')
    .order('updated_at', { ascending: false })
    .limit(1)

  if (existingAgreement.error) throw existingAgreement.error

  let agreementResult
  if ((existingAgreement.data || []).length) {
    agreementResult = await client
      .from('developer_partner_agreements')
      .update({
        status: 'waived',
        waived_at: now,
        effective_date: existingAgreement.data[0].effective_date || now.slice(0, 10),
      })
      .eq('id', existingAgreement.data[0].id)
      .select(
        'id, relationship_id, agreement_type, status, template_key, generated_document_id, packet_id, effective_date, expiry_date, signed_at, terminated_at, waived_at, metadata_json, created_by, created_at, updated_at',
      )
      .single()
  } else {
    const payload = {
      relationship_id: safeRelationshipId,
      agreement_type: agreementType,
      status: 'waived',
      template_key: getDeveloperPartnerAgreementTemplateKey(agreementType),
      effective_date: now.slice(0, 10),
      waived_at: now,
      metadata_json: {
        source: 'developer_partners_workspace',
        waiverMode: 'manual',
      },
    }
    if (currentUserId) payload.created_by = currentUserId
    agreementResult = await client
      .from('developer_partner_agreements')
      .insert(payload)
      .select(
        'id, relationship_id, agreement_type, status, template_key, generated_document_id, packet_id, effective_date, expiry_date, signed_at, terminated_at, waived_at, metadata_json, created_by, created_at, updated_at',
      )
      .single()
  }

  if (agreementResult.error) throw agreementResult.error

  const relationshipUpdate = await client
    .from('developer_partner_relationships')
    .update({
      status: 'agreement_active',
      accepted_at: relationship.accepted_at || now,
      ...(currentUserId && !relationship.accepted_by ? { accepted_by: currentUserId } : {}),
    })
    .eq('id', safeRelationshipId)

  if (relationshipUpdate.error) throw relationshipUpdate.error
  return normalizeDeveloperPartnerAgreement(agreementResult.data)
}

export async function fetchDeveloperPartnerInvitation(token) {
  const safeToken = normalizeTextValue(token)
  if (!safeToken) throw new Error('Invite token is required.')
  const client = requireClient()
  const result = await client.rpc('bridge_get_developer_partner_invitation', {
    p_token: safeToken,
  })
  if (result.error) throw result.error
  const context = normalizeDeveloperPartnerInvitationContext(result.data || {})
  if (!context.ok) {
    const reason = context.reason || 'invite_not_found'
    const error = new Error(
      reason === 'invite_expired'
        ? 'This partner invite has expired.'
        : reason === 'relationship_unavailable'
          ? 'This partner relationship is no longer available.'
          : 'This partner invite could not be found.',
    )
    error.reason = reason
    throw error
  }
  return context
}

export async function acceptDeveloperPartnerInvitationByToken(token, input = {}) {
  const safeToken = normalizeTextValue(token)
  if (!safeToken) throw new Error('Invite token is required.')
  const client = requireClient()
  const result = await client.rpc('bridge_accept_developer_partner_invitation', {
    p_token: safeToken,
    p_partner_display_name: normalizeNullableText(input.partnerDisplayName || input.partner_display_name),
    p_partner_email: normalizeEmailAddress(input.partnerEmail || input.partner_email || input.email) || null,
    p_partner_organisation_id: normalizeNullableUuid(
      input.partnerOrganisationId || input.partner_organisation_id || input.organisationId,
    ),
  })
  if (result.error) throw result.error
  if (!result.data?.ok) {
    const reason = normalizeTextValue(result.data?.reason) || 'accept_failed'
    const error = new Error(
      reason === 'invite_expired'
        ? 'This partner invite has expired.'
        : reason === 'relationship_unavailable'
          ? 'This partner relationship is no longer available.'
          : reason === 'authentication_required'
            ? 'Sign in before accepting this partner invite.'
            : reason === 'organisation_required'
              ? 'Complete workspace setup before accepting this partner invite.'
              : reason === 'not_workspace_admin'
                ? 'Only a workspace admin can accept this partner invite.'
                : reason === 'wrong_workspace'
                  ? 'This invite is linked to another workspace. Switch workspace and retry.'
                  : reason === 'self_relationship'
                    ? 'You cannot accept a partner invite into the developer workspace that sent it.'
                    : 'Unable to accept this partner invite.',
    )
    error.reason = reason
    throw error
  }
  return result.data
}
