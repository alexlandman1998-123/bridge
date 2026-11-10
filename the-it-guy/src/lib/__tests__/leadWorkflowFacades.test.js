import { expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => {
  const names = {"agencyPipeline": ["listAppointmentResourcesAsync", "checkAppointmentSchedulingIntegrityAsync", "getAppointmentAsync", "createAppointmentAsync", "updateAppointmentAsync", "updateAppointmentParticipantRsvpAsync", "setAppointmentArchiveAsync", "addAppointmentOutcomeAsync", "listAppointmentsAsync", "getAppointmentsDashboardSummaryAsync", "convertLeadToTransactionRecord", "convertLeadToDealRecord"], "buyerLifecycle": ["recordBuyerLeadActivity", "updateBuyerLeadStage", "applyBuyerLifecycleEvent", "getCanonicalOfferInviteContext", "submitCanonicalBuyerOnboarding", "submitCanonicalBuyerOffer", "createCanonicalOffer", "ensureAcceptedOfferConversionCandidate", "updateCanonicalOfferStatus", "reviewCanonicalOfferConditions", "createOfferSellerReviewSession", "getSellerOfferReviewContext", "submitSellerOfferDecision", "listCanonicalOffersForLead", "getBuyerLeadLifecycleDiagnostic", "listCanonicalOffersForListing", "listAppointmentViewedListings", "upsertAppointmentViewedListings", "createOfferPortalSession", "listOfferPortalSessions", "getOfferPortalSessionContext", "submitOfferPortalOffer", "createTransactionFromAcceptedCanonicalOffer", "upsertAcceptedOfferOnboardingPrefill"]}
  const calls = [], state = { error: null }
  const query = {
    select(...args) { calls.push(['select',...args]); return query },
    eq(...args) { calls.push(['eq',...args]); return query },
    order() { return query },
    abortSignal(signal) { calls.push(['signal',signal]); return query },
    insert(row) { calls.push(['insert',row]); return Promise.resolve({error:state.error}) },
    then(resolve,reject) { return Promise.resolve({data:[],error:state.error}).then(resolve,reject) },
  }
  return { names, calls, state, client: { from(table) { calls.push(['from',table]); return query } } }
})
vi.mock('../supabaseClient', async actual => ({ ...await actual(),supabase:fixture.client,isSupabaseConfigured:true }))
import * as agency from '../agencyPipelineService.js'
import * as agencyModel from '../agencyPipelineModel.js'
import * as buyer from '../buyerLifecycleService.js'
import * as buyerModel from '../buyerLifecycleModel.js'

it('retains the public exports and shared synchronous model identities', () => {
  for (const [key, facade, model] of [['agencyPipeline',agency,agencyModel],['buyerLifecycle',buyer,buyerModel]]) {
    const sync = Object.keys(model).filter(name => !name.startsWith('__'))
    expect(Object.keys(facade).sort()).toEqual([...sync,...fixture.names[key]].sort())
    for (const name of sync) expect(facade[name]).toBe(model[name])
  }
  expect(agency.listAppointmentsAsync.length).toBe(1)
  expect(agency.getAppointmentAsync.length).toBe(2)
  expect(buyer.updateCanonicalOfferStatus.length).toBe(2)
})
it('retains organisation scoping, cancellation and error propagation in a deferred read', async () => {
  const org='10000000-0000-4000-8000-000000000001',signal=new AbortController().signal
  const options={signal,includeInactive:false}
  const pending=agency.listAppointmentResourcesAsync(org,options)
  options.includeInactive=true
  await pending
  expect(fixture.calls).toContainEqual(['eq','organisation_id',org])
  expect(fixture.calls).toContainEqual(['eq','is_active',true])
  expect(fixture.calls).toContainEqual(['signal',signal])
  const error={code:'42501',message:'fixture permission denial'}
  fixture.state.error=error
  await expect(agency.listAppointmentResourcesAsync(org)).rejects.toBe(error)
  fixture.state.error=null
})
it('retains a deferred buyer operation payload and rejects a failed save', async () => {
  const payload={organisationId:'10000000-0000-4000-8000-000000000001',leadId:'20000000-0000-4000-8000-000000000001',activityType:'Note',activityNote:'fixture only'}
  await buyer.recordBuyerLeadActivity(payload)
  expect(fixture.calls).toContainEqual(['insert',expect.objectContaining({organisation_id:payload.organisationId,lead_id:payload.leadId,activity_note:'fixture only'})])
  const error={code:'42501',message:'fixture save denied'}
  fixture.state.error=error
  await expect(buyer.recordBuyerLeadActivity(payload)).rejects.toBe(error)
})
