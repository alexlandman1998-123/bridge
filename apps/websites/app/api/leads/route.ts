import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { normalizeHostname, resolveSite } from '@/lib/site-repository'
import { getServerSupabase } from '@/lib/supabase-server'

export const runtime = 'nodejs'

type LeadBody = {
  type?: string
  propertyId?: string
  name?: string
  email?: string
  phone?: string
  message?: string
  privacyAccepted?: boolean
  pageUrl?: string
  referrer?: string
  campaignPageId?: string
  idempotencyKey?: string
}

const supportedTypes = new Set(['property_enquiry', 'general_enquiry', 'valuation_request', 'campaign_enquiry'])
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(value: unknown, maximum = 500): string {
  return String(value || '').trim().slice(0, maximum)
}

function splitName(value: string): { firstName: string; lastName: string | null } {
  const [firstName = '', ...rest] = value.trim().split(/\s+/)
  return { firstName, lastName: rest.join(' ') || null }
}

export async function POST(request: Request) {
  let body: LeadBody
  try { body = await request.json() as LeadBody } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }

  const host = normalizeHostname(request.headers.get('host'))
  const site = await resolveSite(host)
  if (!site || site.status !== 'published') return NextResponse.json({ error: 'Website unavailable.' }, { status: 404 })

  const type = text(body.type, 48)
  const name = text(body.name, 160)
  const email = text(body.email, 254).toLowerCase()
  const phone = text(body.phone, 64)
  const message = text(body.message, 4000)
  const idempotencyKey = text(body.idempotencyKey, 128)
  const campaignPageId = text(body.campaignPageId, 64) || null
  if (!supportedTypes.has(type) || !name || !emailPattern.test(email) || !phone || !body.privacyAccepted || !idempotencyKey) {
    return NextResponse.json({ error: 'Please complete the required fields.' }, { status: 400 })
  }

  let supabase
  try {
    supabase = getServerSupabase()
  } catch {
    return NextResponse.json({ error: 'Enquiries are not configured for this preview yet.' }, { status: 503 })
  }
  if (body.propertyId) {
    const { data: property, error } = await supabase
      .from('listing_publication_data')
      .select('listing_id, title, private_listings!inner(organisation_id)')
      .eq('listing_id', body.propertyId)
      .eq('status', 'Published')
      .eq('private_listings.organisation_id', site.organisationId)
      .maybeSingle()
    if (error || !property) return NextResponse.json({ error: 'Property unavailable.' }, { status: 404 })
  }
  if (campaignPageId) {
    const { data: page, error } = await supabase.from('website_pages')
      .select('id, page_kind, website_site_revisions!inner(status)')
      .eq('id', campaignPageId).eq('website_site_id', site.id).eq('page_kind', 'campaign').eq('website_site_revisions.status', 'published').maybeSingle()
    if (error || !page) return NextResponse.json({ error: 'Campaign unavailable.' }, { status: 404 })
  }

  const receipt = {
    website_site_id: site.id,
    organisation_id: site.organisationId,
    listing_id: body.propertyId || null,
    page_id: campaignPageId,
    submission_type: type,
    idempotency_key: idempotencyKey,
    payload_json: { name, email, phone, message, campaignPageId, privacyAccepted: true },
    attribution_json: { host, pageUrl: text(body.pageUrl, 2048), referrer: text(body.referrer, 2048) },
  }
  const receiptResult = await supabase.from('website_lead_submissions').insert(receipt).select('id').maybeSingle()
  if (receiptResult.error?.code === '23505') return NextResponse.json({ accepted: true, duplicate: true }, { status: 202 })
  if (receiptResult.error || !receiptResult.data) return NextResponse.json({ error: 'Unable to record enquiry.' }, { status: 500 })

  try {
    const { firstName, lastName } = splitName(name)
    const { data: existingContact } = await supabase.from('contacts').select('contact_id').eq('organisation_id', site.organisationId).eq('email', email).limit(1).maybeSingle()
    const contactId = existingContact?.contact_id || randomUUID()
    if (!existingContact) {
      const contactResult = await supabase.from('contacts').insert({ contact_id: contactId, organisation_id: site.organisationId, first_name: firstName, last_name: lastName, email, phone, contact_type: 'Lead', notes: message || null })
      if (contactResult.error) throw contactResult.error
    }
    const leadId = randomUUID()
    const leadResult = await supabase.from('leads').insert({
      lead_id: leadId,
      organisation_id: site.organisationId,
      contact_id: contactId,
      lead_domain: 'agency',
      lead_category: type === 'valuation_request' ? 'seller' : 'buyer',
      lead_direction: 'Inbound',
      lead_source: 'Website',
      source_channel: 'website',
      stage: 'New Lead',
      status: 'New Lead',
      priority: 'High',
      listing_id: body.propertyId || null,
      enquired_listing_id: body.propertyId || null,
      source_reference_id: idempotencyKey,
      raw_enquiry_payload: receipt.payload_json,
      notes: message || null,
    }).select('lead_id').single()
    if (leadResult.error) throw leadResult.error
    await supabase.from('website_lead_submissions').update({ lead_id: leadId, status: 'routed', routed_at: new Date().toISOString() }).eq('id', receiptResult.data.id)
    return NextResponse.json({ accepted: true, leadId }, { status: 201 })
  } catch (error) {
    await supabase.from('website_lead_submissions').update({ status: 'failed', failure_reason: error instanceof Error ? error.message.slice(0, 500) : 'CRM write failed' }).eq('id', receiptResult.data.id)
    return NextResponse.json({ error: 'Unable to route enquiry.' }, { status: 500 })
  }
}
