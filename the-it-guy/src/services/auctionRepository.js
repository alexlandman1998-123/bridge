import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getOrganisationPrivateListings } from './privateListingService'

const text = (value) => String(value || '').trim()
const money = (value) => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(Number(value || 0))
const titleCase = (value) => text(value).replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
const formatDate = (value, options) => value ? new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', ...options }).format(new Date(value)) : 'To be confirmed'

export function canPersistAuctions(organisationId = '') {
  return Boolean(isSupabaseConfigured && supabase && text(organisationId))
}

export function mapAuction(row = {}, bidderRows = [], bidRows = []) {
  const bids = bidRows.filter((bid) => bid.auction_id === row.id).sort((left, right) => Number(right.amount) - Number(left.amount) || String(right.recorded_at).localeCompare(String(left.recorded_at)))
  const bidders = bidderRows.filter((bidder) => bidder.auction_id === row.id)
  const current = bids[0]?.amount
  return {
    ...row,
    id: row.id,
    title: text(row.title),
    address: text(row.address_snapshot) || 'Linked listing',
    venue: text(row.venue) || 'Venue to be confirmed',
    date: formatDate(row.starts_at, { day: 'numeric', month: 'short', year: 'numeric' }),
    time: formatDate(row.starts_at, { hour: '2-digit', minute: '2-digit', hour12: false }),
    registrationClose: formatDate(row.registration_closes_at, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }),
    status: titleCase(row.status),
    guidePrice: row.guide_price ? `${money(row.guide_price)} guide` : 'Guide price to be confirmed',
    openingBid: money(row.opening_price),
    currentBid: current ? money(current) : 'No bids recorded',
    currentBidAmount: current || null,
    bidders: String(bidders.length),
    approvedBidders: bidders.filter((bidder) => bidder.status === 'approved').length,
    viewings: '—',
    documents: row.terms_document_url ? 'Linked' : 'Not linked',
    auctioneer: row.auctioneer_user_id ? 'Assigned auctioneer' : 'Unassigned',
    deposit: text(row.deposit_terms) || 'Deposit terms to be confirmed',
    description: 'This auction is linked to an existing listing. Bidder registration and live bid entry are enabled in later phases.',
    image: text(row.image_url) || 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=520&q=84',
  }
}

export async function listAuctions(organisationId) {
  const { data: auctionRows, error } = await supabase.from('auctions').select('*').eq('organisation_id', organisationId).order('starts_at', { ascending: true })
  if (error) throw error
  const ids = (auctionRows || []).map((row) => row.id)
  if (!ids.length) return []
  const [{ data: bidderRows, error: biddersError }, { data: bidRows, error: bidsError }] = await Promise.all([
    supabase.from('auction_bidders').select('id, auction_id, status').in('auction_id', ids),
    supabase.from('auction_bids').select('auction_id, amount, recorded_at').in('auction_id', ids),
  ])
  if (biddersError) throw biddersError
  if (bidsError) throw bidsError
  return auctionRows.map((row) => mapAuction(row, bidderRows || [], bidRows || []))
}

export async function listAuctionListings(organisationId) {
  const listings = await getOrganisationPrivateListings(organisationId, { includeRequirementsAndDocuments: false })
  return listings.map((listing) => ({ id: listing.id, label: text(listing.title || listing.listingTitle || listing.address || listing.propertyAddress) || listing.id }))
}

function toTimestamp(date, time) {
  if (!date || !time) return null
  return new Date(`${date}T${time}:00+02:00`).toISOString()
}

function rpcPayload(organisationId, values) {
  return {
    p_organisation_id: organisationId,
    p_listing_id: values.listingId,
    p_title: text(values.title),
    p_starts_at: toTimestamp(values.startDate, values.startTime),
    p_registration_closes_at: toTimestamp(values.registrationCloseDate, values.registrationCloseTime),
    p_opening_price: Number(values.openingPrice),
    p_bid_increment: Number(values.bidIncrement),
    p_reserve_price: values.reservePrice === '' ? null : Number(values.reservePrice),
    p_guide_price: values.guidePrice === '' ? null : Number(values.guidePrice),
    p_venue: text(values.venue) || null,
    p_auctioneer_user_id: null,
  }
}

export async function createAuction(organisationId, values) {
  const { data, error } = await supabase.rpc('auction_create', rpcPayload(organisationId, values))
  if (error) throw error
  return data
}

export async function updateAuctionSetup(auctionId, values) {
  const payload = rpcPayload('', values)
  delete payload.p_organisation_id
  delete payload.p_listing_id
  const { data, error } = await supabase.rpc('auction_update_setup', { p_auction_id: auctionId, ...payload, p_deposit_terms: text(values.depositTerms) || null, p_terms_document_url: text(values.termsDocumentUrl) || null })
  if (error) throw error
  return data
}

export async function transitionAuction(auctionId, nextStatus) {
  const { data, error } = await supabase.rpc('auction_transition', { p_auction_id: auctionId, p_next_status: nextStatus, p_reason: null })
  if (error) throw error
  return data
}

export async function listAuctionBidders(auctionId) {
  const { data, error } = await supabase.from('auction_bidders').select('id, bidder_number, legal_name, email, phone, registration_evidence_url, status, status_note, created_at, approved_at').eq('auction_id', auctionId).order('bidder_number', { ascending: true })
  if (error) throw error
  return data || []
}

export async function registerAuctionBidder(auctionId, values) {
  const { data, error } = await supabase.rpc('auction_register_bidder', {
    p_auction_id: auctionId,
    p_legal_name: text(values.legalName),
    p_email: text(values.email) || null,
    p_phone: text(values.phone) || null,
    p_registration_evidence_url: text(values.evidenceUrl) || null,
    p_note: text(values.note) || null,
  })
  if (error) throw error
  return data
}

export async function setAuctionBidderStatus(bidderId, status, note = '') {
  const { data, error } = await supabase.rpc('auction_set_bidder_status', { p_bidder_id: bidderId, p_status: status, p_note: text(note) || null })
  if (error) throw error
  return data
}

export async function listAuctionBids(auctionId) {
  const { data, error } = await supabase.from('auction_bids').select('id, bidder_id, amount, recorded_at').eq('auction_id', auctionId).order('recorded_at', { ascending: false }).order('id', { ascending: false })
  if (error) throw error
  return data || []
}

export async function recordAuctionBid(auctionId, bidderId, amount) {
  const { data, error } = await supabase.rpc('auction_record_bid', { p_auction_id: auctionId, p_bidder_id: bidderId, p_amount: Number(amount) })
  if (error) throw error
  return data
}

export function subscribeToAuctionChanges(auctionId, onChange) {
  if (!supabase || !auctionId) return () => {}
  const channel = supabase.channel(`auction-live-${auctionId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'auction_bids', filter: `auction_id=eq.${auctionId}` }, onChange)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'auctions', filter: `id=eq.${auctionId}` }, onChange)
    .subscribe()
  return () => { void supabase.removeChannel(channel) }
}

export async function getAuctionOutcome(auctionId) {
  const { data, error } = await supabase.from('auction_outcomes').select('*').eq('auction_id', auctionId).maybeSingle()
  if (error) throw error
  return data || null
}

export async function recordAuctionOutcome(auctionId, values) {
  const { data, error } = await supabase.rpc('auction_close', {
    p_auction_id: auctionId,
    p_outcome: values.outcome,
    p_winning_bidder_id: values.outcome === 'sold' ? values.winningBidderId : null,
    p_final_price: values.outcome === 'sold' ? Number(values.finalPrice) : null,
    p_closeout_note: text(values.note) || null,
  })
  if (error) throw error
  return data
}

export async function prepareAuctionTransactionHandoff(auctionId, note = '') {
  const { data, error } = await supabase.rpc('auction_prepare_transaction_handoff', { p_auction_id: auctionId, p_note: text(note) || null })
  if (error) throw error
  return data
}

export async function getAuctionTransactionHandoff(auctionId) {
  const { data, error } = await supabase.from('auction_transaction_handoffs').select('*').eq('auction_id', auctionId).maybeSingle()
  if (error) throw error
  return data || null
}

export async function listAuctionAuditEvents(auctionId) {
  const { data, error } = await supabase.from('auction_audit_events').select('id, event_type, payload, occurred_at').eq('auction_id', auctionId).order('occurred_at', { ascending: false }).limit(50)
  if (error) throw error
  return data || []
}
