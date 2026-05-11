import { AlertCircle, ArrowLeft } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import LegalDocumentWorkspace from '../components/documents/LegalDocumentWorkspace'
import Button from '../components/ui/Button'
import { useWorkspace } from '../context/WorkspaceContext'
import { generatePacketVersion, listPacketTemplates } from '../core/documents/packetService'
import { resolveDocumentPacketStatus } from '../core/documents/packetStatusResolver'
import { OTP_DOCUMENT_TYPES } from '../core/transactions/salesWorkflow'
import { getAgencyPipelineSnapshot, updateAgencyLead } from '../lib/agencyPipelineService'
import {
  createDocumentPacket,
  fetchDocumentPacket,
  listDocumentPackets,
  resolveDocumentPacketBranding,
} from '../lib/documentPacketsApi'
import { fetchTransactionById, updateOtpDocumentWorkflowState } from '../lib/api'
import { fetchOrganisationSettings } from '../lib/settingsApi'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizeText(value))
}

function normalizeLeadUuid(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  if (isUuidLike(raw)) return raw
  const withoutPrefix = raw.replace(/^lead_/i, '')
  return isUuidLike(withoutPrefix) ? withoutPrefix : ''
}

function resolveModeFromQuery(mode = '') {
  const key = normalizeKey(mode)
  if (['generate', 'edit', 'send', 'signed', 'view'].includes(key)) return key
  if (key === 'view_signed') return 'signed'
  return 'view'
}

function resolveDocumentLabel(packetType = '') {
  return normalizeKey(packetType) === 'otp' ? 'Offer to Purchase' : 'Mandate Agreement'
}

function toFriendlyPageError(error = null) {
  const raw = normalizeText(error?.message || error)
  const message = raw.toLowerCase()
  if (message.includes('invalid input syntax for type uuid')) {
    return 'The transaction or packet reference in this link is invalid. Check the link and try again.'
  }
  if (message.includes('permission denied') || message.includes('row-level security')) {
    return 'You do not have permission to view this legal document workspace.'
  }
  if (message.includes('failed to fetch') || message.includes('network')) {
    return 'Bridge could not reach the legal document service. Please retry.'
  }
  return raw || 'Unable to load this legal document workspace.'
}

function resolveSafeReturnPath(value = '') {
  const text = normalizeText(value)
  if (!text || !text.startsWith('/')) return ''
  if (text.startsWith('//')) return ''
  return text
}

function resolveTransactionReference(detail = null, fallback = '') {
  const unit = detail?.unit || null
  const transaction = detail?.transaction || null
  const buyer = detail?.buyer || null
  return [
    unit?.unit_number ? `Unit ${unit.unit_number}` : '',
    unit?.development?.name || '',
    buyer?.name ? `Buyer: ${buyer.name}` : '',
    transaction?.stage || transaction?.current_main_stage || '',
  ].filter(Boolean).join(' · ') || fallback || 'Transaction document context'
}

function buildAgentFromProfile(profile = null) {
  return {
    id: normalizeText(profile?.id),
    fullName:
      normalizeText(profile?.fullName) ||
      [profile?.firstName, profile?.lastName].map(normalizeText).filter(Boolean).join(' ') ||
      'Bridge User',
    email: normalizeText(profile?.email).toLowerCase(),
  }
}

function findLeadContext({ organisationId = '', leadId = '' } = {}) {
  const normalizedLeadId = normalizeText(leadId)
  const dbLeadId = normalizeLeadUuid(normalizedLeadId)
  if (!organisationId || !normalizedLeadId) {
    return { lead: null, contact: null, linkedTransaction: null }
  }

  const snapshot = getAgencyPipelineSnapshot(organisationId)
  const leads = Array.isArray(snapshot?.leads) ? snapshot.leads : []
  const lead = leads.find((item) => {
    const itemId = normalizeText(item?.leadId)
    return itemId === normalizedLeadId || normalizeLeadUuid(itemId) === dbLeadId
  }) || null
  if (!lead) return { lead: null, contact: null, linkedTransaction: null }

  const contacts = Array.isArray(snapshot?.contacts) ? snapshot.contacts : []
  const contact = contacts.find((item) => normalizeText(item?.contactId) === normalizeText(lead.contactId)) || null
  const deals = Array.isArray(snapshot?.deals) ? snapshot.deals : []
  const linkedTransaction =
    deals
      .filter((row) => normalizeText(row?.leadId) === normalizeText(lead.leadId))
      .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0] || null

  return { lead, contact, linkedTransaction }
}

function getFirstTemplate(templates = []) {
  return Array.isArray(templates) ? (templates[0] || null) : null
}

function getLatestVersion(status = null) {
  const versions = Array.isArray(status?.versions) ? status.versions : []
  return versions[0] || null
}

export default function LegalDocumentWorkspacePage() {
  const navigate = useNavigate()
  const params = useParams()
  const [searchParams] = useSearchParams()
  const { profile, role } = useWorkspace()
  const [loadingContext, setLoadingContext] = useState(true)
  const [pageError, setPageError] = useState('')
  const [transactionDetail, setTransactionDetail] = useState(null)
  const [organisationId, setOrganisationId] = useState(null)
  const [workspaceBranding, setWorkspaceBranding] = useState(null)
  const [leadContext, setLeadContext] = useState({ lead: null, contact: null, linkedTransaction: null })
  const [initialStatus, setInitialStatus] = useState(null)

  const routePacketId = normalizeText(params.packetId || searchParams.get('packetId'))
  const routeLeadId = normalizeText(params.leadId || searchParams.get('leadId'))
  const routeTransactionId = normalizeText(params.transactionId || searchParams.get('transactionId'))
  const mode = resolveModeFromQuery(searchParams.get('mode'))
  const returnTo = resolveSafeReturnPath(searchParams.get('returnTo'))
  const requestedPacketType = normalizeKey(params.packetType || searchParams.get('packetType'))
  const packetType = ['mandate', 'otp'].includes(requestedPacketType)
    ? requestedPacketType
    : normalizeKey(initialStatus?.packet?.packet_type || initialStatus?.packetType || 'mandate')
  const actor = useMemo(() => buildAgentFromProfile(profile), [profile])

  const backPath = useMemo(() => {
    if (returnTo) return returnTo
    if (routeTransactionId) return `/transactions/${routeTransactionId}`
    if (routeLeadId) return `/pipeline/leads/${routeLeadId}`
    return '/transactions'
  }, [returnTo, routeLeadId, routeTransactionId])

  const handleBack = useCallback(() => {
    navigate(backPath)
  }, [backPath, navigate])

  const loadRouteContext = useCallback(async () => {
    setLoadingContext(true)
    setPageError('')
    try {
      let resolvedOrganisationId = null
      let resolvedTransactionId = routeTransactionId
      let resolvedPacketType = requestedPacketType

      if (routePacketId && !resolvedPacketType) {
        const packet = await fetchDocumentPacket(routePacketId, { includeVersions: false, includeEvents: false })
        resolvedPacketType = normalizeKey(packet?.packet_type || packet?.packetType || 'mandate')
        resolvedTransactionId = resolvedTransactionId || normalizeText(packet?.transaction_id || packet?.transactionId)
        resolvedOrganisationId = normalizeText(packet?.organisation_id || packet?.organisationId) || null
      }

      if (!['mandate', 'otp'].includes(resolvedPacketType)) {
        throw new Error('This legal document type is not supported.')
      }

      let detail = null
      if (resolvedTransactionId) {
        detail = await fetchTransactionById(resolvedTransactionId)
        if (!detail?.transaction?.id) {
          throw new Error('Transaction could not be found or is not accessible.')
        }
        resolvedOrganisationId = normalizeText(detail?.transaction?.organisation_id) || resolvedOrganisationId
      }

      const settings = await fetchOrganisationSettings().catch(() => null)
      if (!resolvedOrganisationId) {
        resolvedOrganisationId = normalizeText(settings?.organisation?.id) || null
      }
      const brandingFromSettings = {
        organisationName:
          normalizeText(settings?.organisation?.display_name) ||
          normalizeText(settings?.organisation?.displayName) ||
          normalizeText(settings?.organisation?.name),
        logoLightUrl: normalizeText(settings?.onboarding?.branding?.logoLight) || normalizeText(settings?.organisation?.logo_url),
        logoDarkUrl: normalizeText(settings?.onboarding?.branding?.logoDark),
      }
      const packetBranding = resolvedOrganisationId
        ? await resolveDocumentPacketBranding({ organisationId: resolvedOrganisationId }).catch(() => null)
        : null

      const nextLeadContext = findLeadContext({
        organisationId: resolvedOrganisationId,
        leadId: routeLeadId,
      })
      if (routeLeadId && !nextLeadContext.lead && !routePacketId) {
        throw new Error('Seller lead context could not be found for this mandate workspace.')
      }

      const linkedTransactionId = normalizeText(
        nextLeadContext.linkedTransaction?.transactionId || nextLeadContext.linkedTransaction?.dealId,
      )
      if (!detail && linkedTransactionId) {
        detail = await fetchTransactionById(linkedTransactionId).catch(() => null)
        resolvedTransactionId = normalizeText(detail?.transaction?.id || linkedTransactionId)
      }

      if (!resolvedTransactionId && !routePacketId && !routeLeadId) {
        throw new Error('A transaction, packet, or lead reference is required to open this workspace.')
      }

      const status = await resolveDocumentPacketStatus({
        packetType: resolvedPacketType,
        packetId: routePacketId,
        transactionId: resolvedTransactionId,
        leadId: routeLeadId,
        organisationId: resolvedOrganisationId,
      })

      setTransactionDetail(detail)
      setOrganisationId(resolvedOrganisationId)
      setWorkspaceBranding({
        ...(packetBranding || {}),
        organisationName: normalizeText(packetBranding?.organisationName) || brandingFromSettings.organisationName,
        logoLightUrl: normalizeText(packetBranding?.logoLightUrl) || brandingFromSettings.logoLightUrl,
        logoDarkUrl: normalizeText(packetBranding?.logoDarkUrl) || brandingFromSettings.logoDarkUrl,
      })
      setLeadContext(nextLeadContext)
      setInitialStatus(status)
    } catch (error) {
      setPageError(toFriendlyPageError(error))
    } finally {
      setLoadingContext(false)
    }
  }, [requestedPacketType, routeLeadId, routePacketId, routeTransactionId])

  useEffect(() => {
    void loadRouteContext()
  }, [loadRouteContext])

  const transaction = transactionDetail?.transaction || null
  const transactionId = normalizeText(transaction?.id || routeTransactionId || leadContext.linkedTransaction?.transactionId || leadContext.linkedTransaction?.dealId)
  const transactionReference = resolveTransactionReference(
    transactionDetail,
    [
      normalizeText(leadContext.lead?.sellerPropertyAddress || leadContext.lead?.propertyInterest),
      normalizeText(leadContext.lead?.leadCategory),
    ].filter(Boolean).join(' · '),
  )

  const resolveCurrentStatus = useCallback(async () => {
    const status = await resolveDocumentPacketStatus({
      packetType,
      packetId: routePacketId || initialStatus?.packet?.id || '',
      transactionId,
      leadId: routeLeadId,
      organisationId,
    })
    setInitialStatus(status)
    return status
  }, [initialStatus?.packet?.id, organisationId, packetType, routeLeadId, routePacketId, transactionId])

  const ensurePacket = useCallback(async ({ template }) => {
    const currentStatus = await resolveCurrentStatus()
    if (currentStatus?.packet?.id) return currentStatus.packet

    const scopedPackets = await listDocumentPackets({
      organisationId,
      packetType,
      transactionId: transactionId || null,
      leadId: normalizeLeadUuid(routeLeadId) || null,
      limit: 5,
    })
    const existing = Array.isArray(scopedPackets) ? scopedPackets[0] : null
    if (existing?.id) return existing

    if (packetType === 'otp' && !transactionId) {
      throw new Error('A transaction is required before generating an OTP.')
    }

    const packet = await createDocumentPacket({
      organisationId,
      packetType,
      title: `${resolveDocumentLabel(packetType)} - ${transactionReference}`,
      transactionId: transactionId || null,
      dealId: transactionId || null,
      leadId: normalizeLeadUuid(routeLeadId) || null,
      status: 'ready_for_generation',
      templateId: normalizeText(template?.id),
      templateKeySnapshot: normalizeText(template?.template_key || template?.templateKey || template?.key),
      templateLabelSnapshot: normalizeText(template?.template_label || template?.templateLabel || template?.label || resolveDocumentLabel(packetType)),
      assignedAgentId: isUuidLike(actor.id) ? actor.id : null,
      sourceContextJson: {
        transactionId: transactionId || null,
        leadId: normalizeLeadUuid(routeLeadId) || null,
        uiLeadId: routeLeadId || null,
        route: 'legal_document_workspace_page',
      },
    })

    if (packetType === 'mandate' && leadContext.lead?.leadId) {
      updateAgencyLead(organisationId, leadContext.lead.leadId, {
        mandatePacketId: normalizeText(packet?.id),
      })
    }

    return packet
  }, [actor.id, leadContext.lead, organisationId, packetType, resolveCurrentStatus, routeLeadId, transactionId, transactionReference])

  const handleGenerate = useCallback(async ({ onProgress } = {}) => {
    onProgress?.('Preparing template...')
    const templates = await listPacketTemplates({
      packetType,
      moduleType: 'agency',
      includeInactive: false,
      organisationId,
    })
    const template = getFirstTemplate(templates)
    if (!template?.id) {
      throw new Error(`No active ${resolveDocumentLabel(packetType)} template is configured.`)
    }

    const existingStatus = await resolveCurrentStatus()
    if (['sent', 'partially_signed', 'signed', 'archived'].includes(normalizeKey(existingStatus?.state))) {
      throw new Error('This document is already sent or signed. Open the current packet instead of generating a new draft.')
    }

    const packet = await ensurePacket({ template })
    onProgress?.('Merging transaction details...')
    await generatePacketVersion({
      packetId: packet.id,
      packetType,
      template,
      allowWarnings: true,
      forceGenerate: true,
      context: {
        organisationId,
        transaction,
        transactionId,
        unit: transactionDetail?.unit || null,
        buyer: transactionDetail?.buyer || null,
        onboardingFormData: transactionDetail?.onboardingFormData?.formData || transactionDetail?.onboardingFormData || {},
        generatedByRole: role || 'agent',
        generatedByUserId: actor.id,
        generatedByName: actor.fullName,
        generatedByUserEmail: actor.email,
        agentEmail: actor.email,
        lead: leadContext.lead
          ? {
              id: normalizeLeadUuid(leadContext.lead.leadId) || null,
              lead_id: normalizeLeadUuid(leadContext.lead.leadId) || null,
              name: [leadContext.contact?.firstName, leadContext.contact?.lastName].map(normalizeText).filter(Boolean).join(' '),
              sellerName: normalizeText(leadContext.contact?.firstName),
              sellerSurname: normalizeText(leadContext.contact?.lastName),
              sellerEmail: normalizeText(leadContext.contact?.email),
              sellerPhone: normalizeText(leadContext.contact?.phone),
              propertyAddress: normalizeText(leadContext.lead?.sellerPropertyAddress || leadContext.lead?.areaInterest),
              propertyType: normalizeText(leadContext.lead?.propertyInterest) || 'Property',
              listingTitle: normalizeText(leadContext.lead?.propertyInterest || leadContext.lead?.sellerPropertyAddress),
              assignedAgentName: normalizeText(leadContext.lead?.assignedAgentName || actor.fullName),
              assignedAgentEmail: normalizeText(leadContext.lead?.assignedAgentEmail || actor.email),
            }
          : null,
      },
    })

    if (packetType === 'mandate' && leadContext.lead?.leadId) {
      updateAgencyLead(organisationId, leadContext.lead.leadId, {
        mandatePacketId: normalizeText(packet?.id),
        mandateStatus: 'generated',
      })
    }

    window.dispatchEvent(new Event('itg:transaction-updated'))
    await loadRouteContext()
    return true
  }, [
    actor.email,
    actor.fullName,
    actor.id,
    ensurePacket,
    leadContext.contact,
    leadContext.lead,
    loadRouteContext,
    organisationId,
    packetType,
    resolveCurrentStatus,
    role,
    transaction,
    transactionDetail?.buyer,
    transactionDetail?.onboardingFormData,
    transactionDetail?.unit,
    transactionId,
  ])

  const handleSend = useCallback(async () => {
    const status = await resolveCurrentStatus()
    const latestVersion = getLatestVersion(status)
    if (packetType === 'otp' && latestVersion?.rendered_document_id) {
      await updateOtpDocumentWorkflowState({
        documentId: latestVersion.rendered_document_id,
        workflowState: OTP_DOCUMENT_TYPES.sentToClient,
        isClientVisible: true,
      })
    }
    if (packetType === 'mandate' && leadContext.lead?.leadId) {
      updateAgencyLead(organisationId, leadContext.lead.leadId, {
        mandateStatus: 'sent',
        mandateSentAt: new Date().toISOString(),
      })
    }
    window.dispatchEvent(new Event('itg:transaction-updated'))
    await loadRouteContext()
  }, [leadContext.lead, loadRouteContext, organisationId, packetType, resolveCurrentStatus])

  const openLatestDocument = useCallback(async ({ signed = false } = {}) => {
    const status = await resolveCurrentStatus()
    const latestVersion = getLatestVersion(status)
    const url = signed
      ? normalizeText(latestVersion?.final_signed_file_access_url || latestVersion?.final_signed_file_url)
      : normalizeText(latestVersion?.rendered_file_access_url || latestVersion?.rendered_file_url)
    if (!url) {
      throw new Error(signed ? 'Signed document is not available yet.' : 'Document preview is not available yet.')
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [resolveCurrentStatus])

  if (loadingContext) {
    return (
      <section className="flex min-h-[420px] items-center justify-center rounded-[18px] border border-[#dce6f2] bg-white text-sm font-semibold text-[#60758d]">
        Loading legal document workspace...
      </section>
    )
  }

  if (pageError) {
    return (
      <section className="rounded-[20px] border border-[#f1d8d0] bg-[#fff7f5] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.08em] text-[#9d3b2b]">
              <AlertCircle size={16} />
              Legal Workspace Unavailable
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-[#142132]">This legal document could not be opened.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b7d93]">{pageError}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={handleBack}>
              <ArrowLeft size={14} />
              Back
            </Button>
            <Button type="button" onClick={() => void loadRouteContext()}>
              Retry
            </Button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <LegalDocumentWorkspace
      displayMode="page"
      open
      onBack={handleBack}
      onClose={handleBack}
      backLabel={routeLeadId && !transactionId ? 'Back to Lead' : 'Back to Transaction'}
      transactionId={transactionId}
      transactionReference={transactionReference}
      packetType={packetType}
      packetId={routePacketId || normalizeText(initialStatus?.packet?.id)}
      mode={mode}
      initialStatus={initialStatus}
      organisationId={organisationId}
      branding={workspaceBranding}
      onGenerate={handleGenerate}
      onEdit={handleGenerate}
      onSend={handleSend}
      onView={() => openLatestDocument({ signed: false })}
      onViewSigned={() => openLatestDocument({ signed: true })}
      onRefreshContext={loadRouteContext}
    />
  )
}
