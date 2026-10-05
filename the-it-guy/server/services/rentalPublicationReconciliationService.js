import { getRentalPublicationAttempt, updateRentalPublicationAttempt, publicRentalPublicationAttempt } from './rentalPublicationAttemptService.js'
import { resolveProperty24PublicUrl } from '../property24/publishService.js'
import { recordProperty24ListingSync } from './property24ListingSyncService.js'
import { recordPrivatePropertyListingSync, resolvePrivatePropertyExternalStatus } from './privatePropertyListingSyncService.js'
import { resolvePrivatePropertyAgencyConfig, resolvePrivatePropertyCredentials } from './privatePropertyAgencyConfigService.js'
import { createPrivatePropertyClient, extractPrivatePropertyXmlTag } from './privatePropertyClient.js'

const text = value => String(value ?? '').trim()
const pending = (attempt, message) => ({ status:'UNCERTAIN', submissionAttempt:publicRentalPublicationAttempt(attempt), message,
  safety:{ portalChanged:false } })

export async function reconcileRentalProperty24Publication({ client,property24,config }) {
  const attempt = await getRentalPublicationAttempt(client,config.listingId,'property24',config.environment)
  if (!attempt) return null
  const identity = attempt.identity
  if (text(identity.agencyId) !== text(config.agencyId)) return pending(attempt,'The Property24 agency connection changed. Review the original submission account before reconciling.')
  try {
    const response = await property24.fetchListingReconciliation({ agencyId:identity.agencyId,agentId:identity.agentId })
    const body = response.data
    const rows = Array.isArray(body) ? body : body?.listings || body?.Listings || body?.items || body?.Items
    if (!Array.isArray(rows)) return pending(attempt,'Property24 did not return a usable listing inventory. The previous request remains unconfirmed.')
    const savedNumber = text(attempt.receipt?.reference || identity.listingNumber)
    if (identity.listingNumber && attempt.receipt?.reference && text(identity.listingNumber) !== text(attempt.receipt.reference)) return pending(attempt,'Property24 returned a different listing number for this update. Review both records before sending again.')
    const matches = rows.filter(row => {
      const number = text(row.listingNumber || row.ListingNumber || row.listingId || row.ListingId)
      const source = text(row.sourceReference || row.SourceReference || row.reference || row.Reference)
      return savedNumber ? number === savedNumber : Boolean(identity.sourceReference) && source === text(identity.sourceReference)
    })
    if (matches.length !== 1) return pending(attempt,matches.length ? 'Multiple Property24 records match the submission. Review them before sending again.' : 'Property24 has not confirmed this submission yet. An absent advert does not prove the request failed; check again later.')
    const row = matches[0]
    const number = Number(row.listingNumber || row.ListingNumber || row.listingId || row.ListingId)
    if (!Number.isInteger(number) || number <= 0) return pending(attempt,'Property24 returned no usable listing number.')
    if (identity.listingNumber && !attempt.receipt?.accepted) {
      const modified = Date.parse(row.updatedAt || row.UpdatedAt || row.lastUpdatedAt || row.LastUpdatedAt || '')
      const requestedStatus = text(identity.status).toLowerCase()
      const observedStatus = text(row.status || row.Status || row.listingStatus || row.ListingStatus).toLowerCase()
      if (attempt.operation !== 'status_update' || requestedStatus !== observedStatus || !(modified >= Date.parse(attempt.started_at))) {
        return pending(attempt,'The existing Property24 record was found, but this update is not confirmed. Review the original request with the portal before sending it again.')
      }
    }
    const live = await property24.checkListingOnPortal(number)
    if (typeof live.data !== 'boolean') return pending(attempt,'Property24 did not confirm the current public state.')
    const status = text(row.status || row.Status || row.listingStatus || row.ListingStatus).toLowerCase()
    if (attempt.operation === 'status_update') {
      const desired = text(identity.status).toLowerCase()
      const withdrawal = ['withdrawn','expired','rented'].includes(desired)
      const activated = ['active','backonmarket'].includes(desired)
      if (withdrawal ? live.data || (status && status !== desired && status !== 'removed') : activated ? !live.data : status !== desired) {
        return pending(attempt,'Property24 has not confirmed the requested status yet. The previous status request remains protected.')
      }
    }
    const removed = ['withdrawn','expired','rented','removed'].includes(status)
    const sync = await recordProperty24ListingSync({ client,listingId:config.listingId,agencyId:identity.agencyId,listingNumber:number,
      environment:config.environment,isOnPortal:live.data,externalStatus:removed && !live.data ? 'removed' : live.data ? 'on_portal' : 'submitted',
      responseSummary:{ reconciledAttemptId:attempt.id },payloadSummary:{ sourceReference:identity.sourceReference,listingType:'Rental' },
      property24ListingUrl:resolveProperty24PublicUrl(row,attempt.receipt?.publicUrl || ''),allowPublishWithoutMandate:false })
    if (sync.statusUpdateWarning || sync.externalLinkWarning) throw new Error('Local channel details could not all be repaired.')
    await updateRentalPublicationAttempt(client,attempt,{ state:'reconciled',receipt:{ ...attempt.receipt,reference:String(number),reconciled:true },last_error:null })
    return { status:'RECONCILED',message:'The existing Property24 submission was found and its local reference repaired. No listing was sent again.',
      submissionAttempt:publicRentalPublicationAttempt({ ...attempt,state:'reconciled',receipt:{ reference:String(number) } }),safety:{ portalChanged:false,databaseWritten:true } }
  } catch { return pending(attempt,'The portal check or local repair did not complete. The saved submission remains protected; check again before sending.') }
}

export async function reconcileRentalPrivatePropertyPublication({ client,listingId,environment,secrets,privateProperty }) {
  const attempt = await getRentalPublicationAttempt(client,listingId,'private_property',environment)
  if (!attempt) return null
  try {
    const identity = attempt.identity
    const agency = await resolvePrivatePropertyAgencyConfig({ client,listingId,environment })
    if (!agency.ready || text(agency.config.branchGuid) !== text(identity.branchGuid)) return pending(attempt,'The Private Property branch connection changed. Review the original submission branch before reconciling.')
    const credentials = await resolvePrivatePropertyCredentials({ client,config:agency.config,secrets })
    if (credentials.missingSecrets.length) return pending(attempt,'The original Private Property connection is unavailable.')
    const portal = privateProperty || createPrivatePropertyClient({ baseUrl:agency.config.baseUrl,username:credentials.username,password:credentials.password })
    const [statusResponse,detailsResponse] = await Promise.all([
      portal.getListingStatus({ branchGuid:identity.branchGuid,propertyId:identity.propertyId }),
      portal.getListingsDetails({ branchGuid:identity.branchGuid,uniqueListingId:identity.propertyId }),
    ])
    const details = extractPrivatePropertyXmlTag(detailsResponse.data,'GetListingsDetailsResult')
    if (extractPrivatePropertyXmlTag(details,'PropertyId') !== identity.propertyId) return pending(attempt,'Private Property did not return this exact submitted property. The request remains unconfirmed.')
    const status = extractPrivatePropertyXmlTag(statusResponse.data,'GetListingStatusResult')
    const externalStatus = resolvePrivatePropertyExternalStatus({ privatePropertyStatus:status,fallback:'unknown' })
    if (['unknown','failed'].includes(externalStatus)) return pending(attempt,'Private Property has not confirmed this submission. Review the portal result before sending again.')
    if (identity.existed && !attempt.receipt?.accepted && !(attempt.operation === 'status_update' && text(status).toLowerCase() === text(identity.status).toLowerCase())) {
      return pending(attempt,'The existing Private Property record was found, but this content update is not confirmed. Review the original request with the portal before sending it again.')
    }
    if (attempt.operation === 'status_update') {
      const requested = resolvePrivatePropertyExternalStatus({ privatePropertyStatus:identity.status,fallback:'unknown' })
      if (requested === 'unknown' || externalStatus !== requested) return pending(attempt,'Private Property has not confirmed the requested status yet. The previous request remains protected.')
    }
    const reference = extractPrivatePropertyXmlTag(details,'Ref') || attempt.receipt?.reference || ''
    const sync = await recordPrivatePropertyListingSync({ client,listingId,environment,propertyId:identity.propertyId,branchGuid:identity.branchGuid,
      listingType:identity.listingType || 'Rental',privatePropertyRef:reference,externalStatus,isOnPortal:externalStatus==='active',
      responseSummary:{ reconciledAttemptId:attempt.id },submittedAt:attempt.started_at })
    if (!sync.sync?.id || sync.externalLinkWarning) throw new Error('Local Private Property details could not be repaired.')
    await updateRentalPublicationAttempt(client,attempt,{ state:'reconciled',receipt:{ ...attempt.receipt,reference,reconciled:true },last_error:null })
    return { status:'RECONCILED',message:'The existing Private Property submission was found and its local reference repaired. No listing was sent again.',
      submissionAttempt:publicRentalPublicationAttempt({ ...attempt,state:'reconciled',receipt:{ reference } }),safety:{ portalChanged:false,databaseWritten:true } }
  } catch { return pending(attempt,'The portal check or local repair did not complete. The saved submission remains protected; check again before sending.') }
}
