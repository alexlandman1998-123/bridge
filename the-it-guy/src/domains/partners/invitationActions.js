// Extracted without changing validation, persistence order or recovery behaviour.
import { normalizeTextValue, normalizeNullableUuid, normalizeNullableText, requireClient, isMissingTableError, isMissingSchemaError, isPermissionDeniedError, isMissingColumnError } from '../../lib/api/shared/readHelpers.js'
import { normalizeDeveloperPartnerScopeType, normalizeDeveloperPartnerType, normalizeDeveloperPartnerRelationship, getDeveloperPartnerTypeLabel } from './readApi.js'
import { normalizeEmailAddress } from '../developments/profileNormalization.js'
import { invokeEdgeFunction } from '../../lib/supabaseClient'

export function buildDeveloperPartnerInvitationUrl(token = '') {
  const safeToken = normalizeTextValue(token)
  if (!safeToken) return ''
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : ''
  return `${origin}/developer/partner-invite/${encodeURIComponent(safeToken)}`
}

export async function fetchDeveloperPartnerRelationshipById(client, relationshipId) {
  const safeRelationshipId = normalizeNullableUuid(relationshipId)
  if (!safeRelationshipId) throw new Error('Partner relationship is required.')

  const result = await client
    .from('developer_partner_relationships')
    .select(
      'id, developer_organisation_id, partner_organisation_id, partner_type, status, scope_type, scope_json, partner_display_name, partner_invitation_email, invited_by, invited_at, accepted_by, accepted_at, suspended_at, archived_at, metadata_json, created_at, updated_at',
    )
    .eq('id', safeRelationshipId)
    .maybeSingle()

  if (result.error) throw result.error
  if (!result.data) throw new Error('Partner relationship was not found.')
  return result.data
}

export function normalizeDeveloperPartnerScopeJson(scopeType = 'all_developments', scopeJson = {}) {
  const normalizedScopeType = normalizeDeveloperPartnerScopeType(scopeType)
  const source = scopeJson && typeof scopeJson === 'object' ? scopeJson : {}
  if (normalizedScopeType === 'specific_developments') {
    return {
      developmentIds: [
        ...new Set((source.developmentIds || source.development_ids || []).map(normalizeNullableUuid).filter(Boolean)),
      ],
    }
  }
  if (normalizedScopeType === 'specific_phases') {
    return {
      phaseIds: [...new Set((source.phaseIds || source.phase_ids || []).map(normalizeTextValue).filter(Boolean))],
    }
  }
  if (normalizedScopeType === 'specific_units') {
    return {
      unitIds: [...new Set((source.unitIds || source.unit_ids || []).map(normalizeNullableUuid).filter(Boolean))],
    }
  }
  return {}
}

export async function createDeveloperPartnerInvite(input = {}) {
  const developerOrganisationId = normalizeNullableUuid(
    input.developerOrganisationId || input.developer_organisation_id || input.organisationId,
  )
  if (!developerOrganisationId) {
    throw new Error('Developer organisation is required.')
  }

  const partnerType = normalizeDeveloperPartnerType(input.partnerType || input.partner_type)
  if (!['agency', 'transfer_attorney', 'bond_originator'].includes(partnerType)) {
    throw new Error('Select a valid partner type.')
  }

  const partnerOrganisationId = normalizeNullableUuid(input.partnerOrganisationId || input.partner_organisation_id)
  const invitationEmail = normalizeEmailAddress(
    input.partnerInvitationEmail || input.partner_invitation_email || input.email,
  )
  const partnerDisplayName = normalizeNullableText(
    input.partnerDisplayName || input.partner_display_name || input.organisationName,
  )
  if (!partnerOrganisationId && !invitationEmail) {
    throw new Error('Select an organisation or enter an invitation email.')
  }

  const scopeType = normalizeDeveloperPartnerScopeType(input.scopeType || input.scope_type)
  const scopeJson = normalizeDeveloperPartnerScopeJson(scopeType, input.scopeJson || input.scope_json)
  if (scopeType === 'specific_developments' && !scopeJson.developmentIds.length) {
    throw new Error('Select at least one development for this partner scope.')
  }

  const client = requireClient()
  let duplicateQuery = client
    .from('developer_partner_relationships')
    .select('id, status')
    .eq('developer_organisation_id', developerOrganisationId)
    .eq('partner_type', partnerType)
    .neq('status', 'archived')
    .limit(1)

  duplicateQuery = partnerOrganisationId
    ? duplicateQuery.eq('partner_organisation_id', partnerOrganisationId)
    : duplicateQuery.ilike('partner_invitation_email', invitationEmail)

  const duplicateResult = await duplicateQuery
  if (duplicateResult.error) {
    if (
      !isMissingTableError(duplicateResult.error, 'developer_partner_relationships') &&
      !isMissingSchemaError(duplicateResult.error) &&
      !isPermissionDeniedError(duplicateResult.error)
    ) {
      throw duplicateResult.error
    }
  } else if ((duplicateResult.data || []).length) {
    throw new Error('This partner relationship already exists.')
  }

  const payload = {
    developer_organisation_id: developerOrganisationId,
    partner_organisation_id: partnerOrganisationId,
    partner_type: partnerType,
    status: 'invited',
    scope_type: scopeType,
    scope_json: scopeJson,
    partner_display_name: partnerDisplayName,
    partner_invitation_email: invitationEmail || null,
    metadata_json: {
      source: 'developer_partners_workspace',
      inviteMode: partnerOrganisationId ? 'existing_organisation' : 'email_invite',
    },
  }

  const insertResult = await client
    .from('developer_partner_relationships')
    .insert(payload)
    .select(
      'id, developer_organisation_id, partner_organisation_id, partner_type, status, scope_type, scope_json, partner_display_name, partner_invitation_email, invited_by, invited_at, accepted_by, accepted_at, suspended_at, archived_at, metadata_json, created_at, updated_at',
    )
    .single()

  if (insertResult.error) {
    if (insertResult.error.code === '23505') {
      throw new Error('This partner relationship already exists.')
    }
    throw insertResult.error
  }

  const relationship = normalizeDeveloperPartnerRelationship(insertResult.data)
  let invitationDelivery = null
  if (input.sendEmail) {
    try {
      invitationDelivery = await sendDeveloperPartnerInvitation(relationship.id)
    } catch (deliveryError) {
      invitationDelivery = {
        ok: false,
        error: deliveryError?.message || 'Invite link was created, but delivery failed.',
      }
    }
  }

  return {
    ...relationship,
    invitationDelivery,
  }
}

export async function sendDeveloperPartnerInvitation(relationshipId) {
  const safeRelationshipId = normalizeNullableUuid(relationshipId)
  if (!safeRelationshipId) throw new Error('Partner relationship is required.')

  const client = requireClient()
  const relationship = await fetchDeveloperPartnerRelationshipById(client, safeRelationshipId)
  const prepareResult = await client.rpc('bridge_prepare_developer_partner_invitation', {
    target_relationship_id: safeRelationshipId,
  })

  if (prepareResult.error) throw prepareResult.error
  if (!prepareResult.data?.ok) {
    throw new Error(prepareResult.data?.reason || 'Unable to create partner invite link.')
  }

  const token = normalizeTextValue(prepareResult.data.token)
  const invitationUrl = buildDeveloperPartnerInvitationUrl(token)
  const recipientEmail = normalizeEmailAddress(relationship.partner_invitation_email)
  let emailResult = {
    sent: false,
    reason: recipientEmail ? 'not_sent' : 'missing_email',
  }

  if (recipientEmail) {
    const developerOrgResult = await client
      .from('organisations')
      .select('id, name, display_name, logo_url')
      .eq('id', relationship.developer_organisation_id)
      .maybeSingle()
    if (developerOrgResult.error && !isPermissionDeniedError(developerOrgResult.error)) {
      throw developerOrgResult.error
    }
    const developerName =
      normalizeTextValue(developerOrgResult.data?.display_name || developerOrgResult.data?.name) ||
      'Developer workspace'

    const { data, error } = await invokeEdgeFunction('send-email', {
      body: {
        type: 'workspace_invite',
        to: recipientEmail,
        inviteLink: invitationUrl,
        organisationName: developerName,
        inviteeName: relationship.partner_display_name || recipientEmail,
        inviterName: developerName,
        workspaceRole: getDeveloperPartnerTypeLabel(relationship.partner_type),
        organisationLogoUrl: developerOrgResult.data?.logo_url || '',
        supportEmail: 'support@arch9.co.za',
      },
    })
    emailResult = error ? { sent: false, error } : data || { sent: true }
  }

  const emailError = emailResult?.error
    ? normalizeTextValue(
        emailResult.error?.message ||
          (typeof emailResult.error === 'string' ? emailResult.error : JSON.stringify(emailResult.error)),
      )
    : null

  const invitationStatusUpdate = await client
    .from('developer_partner_relationships')
    .update({
      invitation_email_status: emailResult?.ok || emailResult?.sent ? 'sent' : emailResult.reason || 'failed',
      invitation_email_error: emailError || null,
    })
    .eq('id', safeRelationshipId)
  if (
    invitationStatusUpdate.error &&
    !isMissingColumnError(invitationStatusUpdate.error, 'invitation_email_status') &&
    !isMissingColumnError(invitationStatusUpdate.error, 'invitation_email_error')
  ) {
    throw invitationStatusUpdate.error
  }

  return {
    ok: true,
    invitationUrl,
    expiresAt: prepareResult.data.expiresAt || null,
    emailResult,
  }
}
