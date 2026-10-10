import { describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { buildAgencyLeadLandingMetrics, buildAgencyLeadListModel, getAgencyLeadCategory } from '../agencyLeadListModel.js'
import { getLeadDevelopmentId } from '../../../core/leads/developmentBuyerLead.js'
import { enrichDevelopmentBuyerLeads, listBuyerLeadDevelopmentOptions } from '../../../services/developmentBuyerLeadService.js'
import { buildDevelopmentBuyerJourneyModel } from '../../../services/developmentBuyerJourneyService.js'

const org = '00000000-0000-4000-8000-000000000010'
const leadId = '00000000-0000-4000-8000-000000000020'
const developmentId = '00000000-0000-4000-8000-000000000030'
const listingId = '00000000-0000-4000-8000-000000000040'
const buyer = { leadId, organisationId: org, leadCategory: 'buyer', stage: 'Qualified' }

function clientFor(handler) {
  return createClient('http://localhost:55555', 'local-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const data = handler(new URL(String(input)))
      return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
    } },
  })
}

describe('development buyer category', () => {
  it('routes explicit, raw enquiry and linked-listing development links without requiring a unit', () => {
    for (const link of [{ developmentId }, { primary_development_id: developmentId }, { rawEnquiryPayload: JSON.stringify({ development_id: developmentId }) }, { linkedListing: { development_id: developmentId } }]) {
      expect(getAgencyLeadCategory({ ...buyer, ...link })).toBe('development')
    }
    expect(getAgencyLeadCategory({ ...buyer, propertyInterest: 'Harbour Heights development' })).toBe('buyer')
    expect(getAgencyLeadCategory({ ...buyer, leadCategory: 'seller', developmentId })).toBe('seller')
    expect(getLeadDevelopmentId({ rawEnquiryPayload: 'broken json' })).toBe('')
  })

  it('keeps counts, boards and archives consistent without duplicating the buyer', () => {
    const leads = [buyer, { ...buyer, leadId: 'development', developmentId, stage: 'Unit Selection & Reservation' }, { ...buyer, leadId: 'past-development', developmentId, stage: 'Archived' }, { ...buyer, leadId: 'seller', leadCategory: 'seller' }]
    expect(buildAgencyLeadListModel({ leads, category: 'buyer' }).rows.map((row) => row.id)).toEqual([leadId])
    const development = buildAgencyLeadListModel({ leads, category: 'development' })
    expect(development.rows.map((row) => row.id)).toEqual(['development'])
    expect(development.columns.find((column) => column.id === 'development_selection').cards[0].id).toBe('development')
    expect(buildAgencyLeadListModel({ leads, category: 'archived' }).rows.map((row) => row.id)).toEqual(['past-development'])
    expect(buildAgencyLeadLandingMetrics(leads).categoryCounts).toEqual({ buyer: 1, seller: 1, development: 1, archived: 1 })
  })

  it('moves the same lead back to Buyer after its development link is removed', () => {
    expect(getAgencyLeadCategory({ ...buyer, developmentId })).toBe('development')
    expect(getAgencyLeadCategory(buyer)).toBe('buyer')
  })
})

describe('development link reads', () => {
  it('uses source lead links and organisation-scoped listing links without reading private developer details', async () => {
    const requests = []
    const client = clientFor((url) => {
      requests.push(url)
      if (url.pathname.endsWith('/developer_leads')) return [{ developer_lead_id: 'developer-lead', source_lead_id: leadId, primary_development_id: developmentId, reservation_state: 'none' }]
      if (url.pathname.endsWith('/private_listings')) return [{ id: listingId, development_id: developmentId }]
      return []
    })
    const otherBuyer = { ...buyer, leadId: '00000000-0000-4000-8000-000000000021', listingId }
    const linked = await enrichDevelopmentBuyerLeads(org, [buyer, otherBuyer], { client })
    expect(linked.map(getAgencyLeadCategory)).toEqual(['development', 'development'])
    expect(linked[0].leadId).toBe(leadId)
    expect(linked[0].developmentLeadContext.preferredUnitId).toBe('')
    const sourceQuery = requests.find((url) => url.pathname.endsWith('/developer_leads'))
    expect(sourceQuery.searchParams.get('or')).toContain(`source_agency_org_id.eq.${org}`)
    expect(sourceQuery.searchParams.get('source_lead_id')).toContain(leadId)
    expect(requests.find((url) => url.pathname.endsWith('/private_listings')).searchParams.get('organisation_id')).toBe(`eq.${org}`)
    expect(requests.some((url) => url.pathname.includes('private_details'))).toBe(false)
  })

  it('fails on read failures instead of silently showing development leads as ordinary buyers', async () => {
    const client = createClient('http://localhost:55555', 'local-test-key', { auth: { persistSession: false }, global: { fetch: async () => new Response(JSON.stringify({ code: '42501', message: 'permission denied' }), { status: 403, headers: { 'Content-Type': 'application/json' } }) } })
    await expect(enrichDevelopmentBuyerLeads(org, [buyer], { client })).rejects.toMatchObject({ code: '42501' })
    await expect(enrichDevelopmentBuyerLeads('', [buyer], { client })).rejects.toThrow('resolved organisation')
  })

  it('offers owned and explicitly shared developments once, excluding archived developments', async () => {
    const client = clientFor((url) => {
      if (url.pathname.endsWith('/development_organisation_relationships')) return [{ development_id: developmentId }]
      return [{ id: developmentId, name: 'Harbour Heights', status: 'Active' }, { id: listingId, name: 'Old', status: 'Archived' }]
    })
    expect(await listBuyerLeadDevelopmentOptions(org, { client })).toEqual([{ id: developmentId, label: 'Harbour Heights' }])
  })
})

describe('shared development buyer journey', () => {
  const ready = { leadCaptured: true, contacted: true, qualified: true, viewingCompleted: true }
  it('retains the buyer stages and adds unit selection before onboarding', () => {
    const model = buildDevelopmentBuyerJourneyModel({ lead: { ...buyer, developmentId }, evidence: ready })
    expect(model.stages.map((stage) => stage.label)).toEqual(['Captured', 'Contacted', 'Qualified', 'Viewing / Presentation', 'Unit Selection & Reservation', 'Buyer Onboarding', 'OTP', 'Transaction'])
    expect(model.currentStageKey).toBe('development_selection')
    expect(model.nextAction.key).toBe('open_development')
  })

  it('preserves the development viewing stage after saving its board label', () => {
    const model = buildDevelopmentBuyerJourneyModel({ lead: buyer, persistedStage: 'Viewing / Presentation' })
    expect(model.currentStageKey).toBe('viewing')
    expect(model.nextAction.key).toBe('schedule_viewing')
  })

  it('does not treat a pipeline drag, selected unit or uploaded OTP as a confirmed reservation', () => {
    const model = buildDevelopmentBuyerJourneyModel({ lead: { ...buyer, developmentId, developmentLeadContext: { preferredUnitId: 'unit', reservationState: 'provisional' } }, persistedStage: 'OTP', evidence: { ...ready, offerComplete: true } })
    expect(model.stages.find((stage) => stage.key === 'development_selection').done).toBe(false)
    expect(model.currentStageKey).toBe('development_selection')
    expect(model.stages.find((stage) => stage.key === 'development_selection').detail).toContain('not confirmed')
  })

  it('continues through the existing onboarding and OTP actions once reservation is confirmed', () => {
    const lead = { ...buyer, developmentLeadContext: { preferredUnitId: 'unit', reservationState: 'reserved' } }
    const onboarding = buildDevelopmentBuyerJourneyModel({ lead, evidence: ready })
    expect(onboarding.currentStageKey).toBe('transaction_setup')
    expect(onboarding.nextAction.key).toBe('complete_transaction_setup')
    const otp = buildDevelopmentBuyerJourneyModel({ lead, evidence: { ...ready, transactionSetupComplete: true } })
    expect(otp.currentStageKey).toBe('offer')
    expect(otp.nextAction.key).toBe('upload_signed_otp')
    const expired = buildDevelopmentBuyerJourneyModel({ lead: { ...lead, developmentLeadContext: { preferredUnitId: 'unit', reservationState: 'expired' } }, evidence: ready })
    expect(expired.currentStageKey).toBe('development_selection')
    expect(expired.currentStage.detail).toBe('Reservation expired')
  })

  it('keeps an existing transaction accessible without inventing missing reservation history', () => {
    const model = buildDevelopmentBuyerJourneyModel({ lead: buyer, evidence: { transactionCreated: true } })
    expect(model.currentStageKey).toBe('transaction')
    expect(model.nextAction.key).toBe('open_transaction')
    expect(model.stages.find((stage) => stage.key === 'development_selection').done).toBe(false)
  })
})
