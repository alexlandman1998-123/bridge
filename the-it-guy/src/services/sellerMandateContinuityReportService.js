import { buildSellerMandateContinuityModel } from './sellerMandateContinuityService.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function getNestedObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function getArray(value) {
  return Array.isArray(value) ? value : []
}

function getQueryWarning(label, error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.trim()
  return {
    label,
    message: message || 'Query failed.',
    code: normalizeText(error?.code),
  }
}

async function safeQuery(label, queryPromise, warnings = []) {
  const { data, error } = await queryPromise
  if (error) {
    const warning = getQueryWarning(label, error)
    warnings.push(warning)
    console.warn(`[seller-mandate-continuity] ${label} skipped: ${warning.message}`)
    return []
  }
  return Array.isArray(data) ? data : []
}

function groupBy(rows = [], key) {
  return getArray(rows).reduce((accumulator, row) => {
    const value = normalizeText(row?.[key])
    if (!value) return accumulator
    if (!accumulator[value]) accumulator[value] = []
    accumulator[value].push(row)
    return accumulator
  }, {})
}

function unique(values = []) {
  return Array.from(new Set(getArray(values).map(normalizeText).filter(Boolean)))
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function getListing(record = {}) {
  const listing = getNestedObject(record.listing || record.privateListing || record.private_listing)
  if (Object.keys(listing).length) return listing
  return {
    id: record.listingId || record.listing_id || record.privateListingId || record.private_listing_id || record.id,
    title: record.title || record.listingTitle || record.listing_title,
    address: record.address || record.addressLine1 || record.address_line_1,
    mandatePacketId: record.mandatePacketId || record.mandate_packet_id,
    mandateStatus: record.mandateStatus || record.mandate_status,
    listingStatus: record.listingStatus || record.listing_status || record.status,
    sellerWorkspaceToken: record.sellerWorkspaceToken || record.seller_workspace_token,
  }
}

function getLead(record = {}) {
  const lead = getNestedObject(record.lead || record.sellerLead || record.seller_lead)
  if (Object.keys(lead).length) return lead
  return {
    id: record.leadId || record.lead_id || record.sellerLeadId || record.seller_lead_id,
    name: record.leadName || record.lead_name || record.sellerName || record.seller_name,
    mandatePacketId: record.leadMandatePacketId || record.lead_mandate_packet_id,
    mandateStatus: record.leadMandateStatus || record.lead_mandate_status,
    status: record.leadStatus || record.lead_status,
    stage: record.leadStage || record.lead_stage,
  }
}

function getMandatePacket(record = {}) {
  const packet = getNestedObject(record.mandatePacket || record.mandate_packet || record.documentPacket || record.document_packet)
  if (Object.keys(packet).length) return packet
  const packetId = firstText(record.mandatePacketId, record.mandate_packet_id)
  const signedFilePath = firstText(record.finalSignedFilePath, record.final_signed_file_path, record.mandate_signed_document_path)
  const signedFileUrl = firstText(record.finalSignedFileUrl, record.final_signed_file_url, record.mandate_signed_document_url)
  if (!packetId && !signedFilePath && !signedFileUrl) return null
  return {
    id: packetId,
    status: record.mandatePacketStatus || record.mandate_packet_status || record.mandateStatus || record.mandate_status,
    finalSignedFilePath: signedFilePath,
    finalSignedFileUrl: signedFileUrl,
    finalSignedFileName: record.finalSignedFileName || record.final_signed_file_name,
  }
}

function getPortalContext(record = {}) {
  const portalContext = getNestedObject(record.portalContext || record.portal_context || record.sellerPortalContext || record.seller_portal_context)
  if (Object.keys(portalContext).length) return portalContext
  const packetId = firstText(record.portalMandatePacketId, record.portal_mandate_packet_id)
  if (!packetId) return {}
  return { mandatePacketId: packetId }
}

function getDocuments(record = {}) {
  return getArray(record.documents || record.sellerDocuments || record.seller_documents || record.privateListingDocuments || record.private_listing_documents)
}

function getActivityEvents(record = {}) {
  return getArray(record.activityEvents || record.activity_events || record.events || record.activities || record.privateListingActivity || record.private_listing_activity)
}

function getActionForCheck(check = {}) {
  if (check.state === 'complete' || check.state === 'not_applicable') return ''
  const key = normalizeKey(check.key)
  if (key === 'mandate_packet_resolved') return 'Resolve the signed mandate packet id and confirm the packet has a signed artifact.'
  if (key === 'lead_packet_linked') return 'Sync the mandate packet id back to the seller lead.'
  if (key === 'listing_packet_linked') return 'Sync the mandate packet id onto the listing record.'
  if (key === 'listing_marked_signed') return 'Mark the listing mandate status as signed after confirming the packet.'
  if (key === 'seller_visible_signed_document') return 'Link a seller-visible signed mandate document or final signed packet artifact.'
  if (key === 'seller_visible_activity') return 'Create a client-visible mandate signed activity event for the seller portal timeline.'
  if (key === 'seller_portal_context_linked') return 'Refresh the seller portal context so it references the same mandate packet.'
  return check.detail || `Review ${check.label || check.key}.`
}

function buildActionItems(model = {}) {
  return [...getArray(model.blockers), ...getArray(model.warnings)]
    .map(getActionForCheck)
    .filter(Boolean)
}

export function buildSellerMandateContinuityAuditRecord(record = {}) {
  const listing = getListing(record)
  const lead = getLead(record)
  const mandatePacket = getMandatePacket(record)
  const portalContext = getPortalContext(record)
  const sellerWorkspaceToken = firstText(
    record.sellerWorkspaceToken,
    record.seller_workspace_token,
    listing.sellerWorkspaceToken,
    listing.seller_workspace_token,
    portalContext.sellerWorkspaceToken,
    portalContext.seller_workspace_token,
  )
  const model = buildSellerMandateContinuityModel({
    lead,
    listing,
    documents: getDocuments(record),
    mandatePacket,
    activityEvents: getActivityEvents(record),
    portalContext,
    sellerWorkspaceToken,
  })
  const listingId = firstText(listing.id, record.listingId, record.listing_id, record.privateListingId, record.private_listing_id)
  const leadId = firstText(lead.id, record.leadId, record.lead_id, record.sellerLeadId, record.seller_lead_id)
  return {
    listingId,
    leadId,
    title: firstText(listing.title, listing.address, listing.addressLine1, listing.address_line_1, record.title, record.address),
    status: model.status,
    ready: model.ready,
    packetId: model.packetId,
    sellerWorkspaceToken: model.sellerWorkspaceToken,
    signedDocumentId: model.signedDocumentId,
    signedActivityId: model.signedActivityId,
    summary: model.summary,
    blockers: model.blockers,
    warnings: model.warnings,
    checks: model.checks,
    actionItems: buildActionItems(model),
  }
}

function summarize(records = []) {
  const summary = {
    total: records.length,
    ready: 0,
    warning: 0,
    blocked: 0,
    missingPacket: 0,
    missingListingLink: 0,
    missingSignedDocument: 0,
    missingSellerActivity: 0,
    portalWarnings: 0,
    checks: {},
  }

  records.forEach((record) => {
    if (record.status === 'ready') summary.ready += 1
    else if (record.status === 'warning') summary.warning += 1
    else summary.blocked += 1

    getArray(record.checks).forEach((check) => {
      if (check.state === 'complete' || check.state === 'not_applicable') return
      const key = normalizeKey(check.key)
      summary.checks[key] = (summary.checks[key] || 0) + 1
      if (key === 'mandate_packet_resolved') summary.missingPacket += 1
      if (key === 'listing_packet_linked') summary.missingListingLink += 1
      if (key === 'seller_visible_signed_document') summary.missingSignedDocument += 1
      if (key === 'seller_visible_activity') summary.missingSellerActivity += 1
      if (key === 'seller_portal_context_linked') summary.portalWarnings += 1
    })
  })

  return {
    ...summary,
    status: summary.blocked ? 'blocked' : summary.warning ? 'needs_review' : 'ready',
    score: summary.total ? Math.max(0, Math.round(((summary.ready + summary.warning * 0.5) / summary.total) * 100)) : 100,
  }
}

function compareRecords(left, right) {
  const rank = { blocked: 0, warning: 1, ready: 2 }
  const statusDelta = (rank[left.status] ?? 3) - (rank[right.status] ?? 3)
  if (statusDelta) return statusDelta
  const leftIssueCount = getArray(left.blockers).length + getArray(left.warnings).length
  const rightIssueCount = getArray(right.blockers).length + getArray(right.warnings).length
  if (rightIssueCount !== leftIssueCount) return rightIssueCount - leftIssueCount
  return normalizeText(left.title || left.listingId).localeCompare(normalizeText(right.title || right.listingId))
}

export function createSellerMandateContinuityReport({ records = [], generatedAt = new Date().toISOString(), limit = 50 } = {}) {
  const auditRecords = getArray(records)
    .map(buildSellerMandateContinuityAuditRecord)
    .sort(compareRecords)
  const summary = summarize(auditRecords)
  const limitNumber = Math.max(1, Number(limit) || 50)
  return {
    generatedAt,
    summary,
    records: auditRecords.slice(0, limitNumber),
    totalRecords: auditRecords.length,
  }
}

export function getSellerMandateContinuityReleaseGate(report = {}, { failOnWarning = false } = {}) {
  const summary = report.summary || {}
  const blocked = Number(summary.blocked || 0)
  const warning = Number(summary.warning || 0)
  const failed = blocked > 0 || (failOnWarning && warning > 0)
  return {
    status: failed ? 'fail' : 'pass',
    exitCode: failed ? 1 : 0,
    reason: failed
      ? blocked > 0
        ? `${blocked} signed mandate continuity record${blocked === 1 ? '' : 's'} blocked.`
        : `${warning} signed mandate continuity warning${warning === 1 ? '' : 's'} present.`
      : 'Signed mandate continuity is release-ready.',
  }
}

function applyOrganisationFilter(query, organisationId = '') {
  const normalizedOrganisationId = normalizeText(organisationId)
  return normalizedOrganisationId ? query.eq('organisation_id', normalizedOrganisationId) : query
}

export async function fetchSellerMandateContinuityRows(client, { limit = 50, organisationId = '', queryWarnings = [] } = {}) {
  if (!client || typeof client.from !== 'function') {
    throw new Error('A Supabase client is required for seller mandate continuity diagnostics.')
  }

  const listingLimit = Math.max(1, Number(limit) || 50)
  const listingQuery = applyOrganisationFilter(
    client
      .from('private_listings')
      .select('*')
      .or('mandate_status.in.(signed,fully_signed,signed_uploaded,uploaded_signed,completed),listing_status.in.(mandate_signed,active,under_offer,sold)'),
    organisationId,
  )
    .order('updated_at', { ascending: false })
    .limit(listingLimit)

  const listings = await safeQuery('private_listings', listingQuery, queryWarnings)
  const listingIds = unique(listings.map((listing) => listing.id))
  const leadIds = unique(listings.flatMap((listing) => [
    listing.seller_lead_id,
    listing.originating_crm_lead_id,
    listing.lead_id,
  ]))
  const packetIds = unique(listings.map((listing) => listing.mandate_packet_id))
  const sellerTokens = unique(listings.map((listing) => listing.seller_workspace_token))

  const [documents, activities, leads, packets, portalContexts] = await Promise.all([
    listingIds.length
      ? safeQuery('private_listing_documents', client.from('private_listing_documents').select('*').in('private_listing_id', listingIds), queryWarnings)
      : [],
    listingIds.length
      ? safeQuery('private_listing_activity', client.from('private_listing_activity').select('*').in('private_listing_id', listingIds), queryWarnings)
      : [],
    leadIds.length
      ? safeQuery('leads', applyOrganisationFilter(client.from('leads').select('*').in('lead_id', leadIds), organisationId), queryWarnings)
      : [],
    packetIds.length
      ? safeQuery('document_packets', applyOrganisationFilter(client.from('document_packets').select('*').in('id', packetIds), organisationId), queryWarnings)
      : [],
    sellerTokens.length
      ? safeQuery('client_portal_contexts', client.from('client_portal_contexts').select('*').in('seller_workspace_token', sellerTokens), queryWarnings)
      : [],
  ])

  const documentsByListing = groupBy(documents, 'private_listing_id')
  const activitiesByListing = groupBy(activities, 'private_listing_id')
  const leadsByLeadId = groupBy(leads, 'lead_id')
  const packetsById = groupBy(packets, 'id')
  const portalContextsByToken = groupBy(portalContexts, 'seller_workspace_token')

  return listings.map((listing) => {
    const leadId = normalizeText(listing.seller_lead_id || listing.originating_crm_lead_id || listing.lead_id)
    const sellerToken = normalizeText(listing.seller_workspace_token)
    return {
      listing,
      lead: leadsByLeadId[leadId]?.[0] || {},
      documents: documentsByListing[listing.id] || [],
      activityEvents: activitiesByListing[listing.id] || [],
      mandatePacket: packetsById[normalizeText(listing.mandate_packet_id)]?.[0] || null,
      portalContext: portalContextsByToken[sellerToken]?.[0] || {},
      sellerWorkspaceToken: sellerToken,
    }
  })
}

export async function getSellerMandateContinuityDiagnosticsSnapshot({
  client,
  limit = 50,
  organisationId = '',
  failOnWarning = false,
} = {}) {
  const queryWarnings = []
  const records = await fetchSellerMandateContinuityRows(client, {
    limit,
    organisationId,
    queryWarnings,
  })
  const report = createSellerMandateContinuityReport({ records, limit })
  return {
    ...report,
    gate: getSellerMandateContinuityReleaseGate(report, { failOnWarning }),
    queryWarnings,
    organisationId: normalizeText(organisationId),
  }
}

export function renderSellerMandateContinuityMarkdown(report = {}) {
  const summary = report.summary || {}
  const lines = [
    '# Seller Mandate Continuity Report',
    '',
    `Generated: ${report.generatedAt || 'Not recorded'}`,
    '',
    '## Summary',
    '',
    `- Status: ${summary.status || 'unknown'}`,
    `- Score: ${Number(summary.score || 0)}`,
    `- Total signed mandate records: ${Number(summary.total || 0)}`,
    `- Ready: ${Number(summary.ready || 0)}`,
    `- Needs review: ${Number(summary.warning || 0)}`,
    `- Blocked: ${Number(summary.blocked || 0)}`,
    `- Missing packet: ${Number(summary.missingPacket || 0)}`,
    `- Missing listing link: ${Number(summary.missingListingLink || 0)}`,
    `- Missing signed document: ${Number(summary.missingSignedDocument || 0)}`,
    `- Missing seller activity: ${Number(summary.missingSellerActivity || 0)}`,
    '',
    '## Records',
    '',
  ]

  if (!getArray(report.records).length) {
    lines.push('No signed mandate records were included in this report.', '')
    return lines.join('\n')
  }

  lines.push('| Status | Listing | Packet | Action |')
  lines.push('| --- | --- | --- | --- |')
  for (const record of report.records) {
    const action = record.actionItems?.[0] || (record.ready ? 'No action required.' : 'Review continuity checks.')
    lines.push(`| ${record.status} | ${record.title || record.listingId || 'Unlabelled listing'} | ${record.packetId || '-'} | ${action} |`)
  }
  lines.push('')
  return lines.join('\n')
}
