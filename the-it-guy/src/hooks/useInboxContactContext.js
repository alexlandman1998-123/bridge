import { useCallback, useEffect, useState } from 'react'
import { metaIntegrationRequest } from '../services/metaIntegrationService'
import { clientForInboxLead, loadClientPropertyEnquiries } from '../services/inboxClientService'
import { supabase } from '../lib/supabaseClient'

// Signed-in client + organisation filters preserve CRM and mailbox access rules.
export default function useInboxContactContext({ organisationId, accessScope, conversationId }) {
  const key = `${organisationId}:${accessScope}:${conversationId}`
  const [state, setState] = useState({ key: '', loading: true })
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  const [activityLimit, setActivityLimit] = useState(200)
  const loadMoreActivity = useCallback(() => setActivityLimit(limit => limit + 200), [])
  useEffect(() => {
    let active = true
    async function load() {
      const issues = []
      async function read(query, section, fallback = []) {
        const { data, error } = await query
        if (error) { issues.push({ section, message: error.message }); return fallback }
        return data ?? fallback
      }
      setState(previous => previous.key === key ? { ...previous, loadingMore: true } : previous)
      try {
        const context = await metaIntegrationRequest(organisationId, 'crm_context', { conversationId })
        let client = null, lead = null, contact = null, listings = [], linkedLeads = [], requirements = [], activities = [], emailMessages = [], enquiryEvents = [], activityHasMore = false
        if (context.linked && context.linked.kind !== 'recruitment' && supabase) {
          lead = await read(supabase.from('leads').select('lead_id,contact_id,lead_category,stage,status,priority,lead_source,notes,budget,min_budget,area_interest,property_interest,finance_type,next_follow_up_at,last_contacted_at,created_at,enquired_listing_id,listing_id,enquired_property_title,enquired_property_address').eq('organisation_id', organisationId).eq('lead_id', context.linked.recordId).maybeSingle(), 'Profile', null)
          if (lead) { try { client = await clientForInboxLead(organisationId, lead.lead_id) } catch (error) { issues.push({ section: 'Client profile', message: error.message }) } }
          if (lead?.contact_id) {
            contact = await read(supabase.from('contacts').select('first_name,last_name,email,phone,contact_type,notes,created_at').eq('organisation_id', organisationId).eq('contact_id', lead.contact_id).maybeSingle(), 'Profile', null)
            linkedLeads = await read(supabase.from('leads').select('lead_id,lead_category,stage,status,created_at,enquired_listing_id,listing_id,enquired_property_title,enquired_property_address').eq('organisation_id', organisationId).eq('contact_id', lead.contact_id).order('created_at', { ascending: false }), 'Linked records')
          }
          if (lead) {
            if (!linkedLeads.length) linkedLeads = [lead]
            const leadIds = linkedLeads.map(row => row.lead_id)
            const interests = await read(supabase.from('lead_listing_interests').select('interest_id,listing_id,is_original_enquiry,status,created_at').eq('organisation_id', organisationId).in('lead_id', leadIds).eq('is_original_enquiry', true), 'Enquiries')
            const ids = [...new Set([...linkedLeads.flatMap(row => [row.enquired_listing_id, row.listing_id]), ...interests.map(row => row.listing_id)].filter(Boolean))]
            if (ids.length) {
              const properties = await read(supabase.from('private_listings').select('id,title,suburb').eq('organisation_id', organisationId).in('id', ids), 'Enquiries')
              listings = properties.map(row => ({ id: row.id, title: row.title || row.suburb || 'Listing', path: `/listings/${row.id}` }))
            }
            if (!listings.length && lead.enquired_property_title) listings = [{ title: lead.enquired_property_title, address: lead.enquired_property_address }]
            enquiryEvents = interests.map(row => ({ id: `enquiry:${row.interest_id}`, at: row.created_at, title: 'Listing enquiry', body: listings.find(listing => listing.id === row.listing_id)?.title || 'Linked listing enquiry', path: listings.find(listing => listing.id === row.listing_id)?.path }))
            requirements = await read(supabase.from('lead_requirements').select('requirement_id,title,property_types,areas,suburbs,budget_min,budget_max,bedrooms_min,bathrooms_min,must_haves,finance_status,timeline,communication_preference,notes,status').eq('organisation_id', organisationId).in('lead_id', leadIds).order('created_at', { ascending: false }), 'Requirements')
            const events = await read(supabase.from('lead_activities').select('activity_id,activity_type,activity_note,activity_date,outcome,created_at').eq('organisation_id', organisationId).in('lead_id', leadIds).order('activity_date', { ascending: false }).order('activity_id').limit(activityLimit + 1), 'Activity')
            activityHasMore = events.length > activityLimit
            activities = events.slice(0, activityLimit).map(row => ({ id: `crm:${row.activity_id}`, at: row.activity_date || row.created_at, title: row.activity_type || 'CRM activity', body: row.activity_note || row.outcome || '', outcome: row.activity_note ? row.outcome : null }))
            // Only conversations explicitly associated with these visible CRM records.
            const refs = await read(supabase.from('revo_inbox_associations').select('conversation_id').eq('organisation_id', organisationId).eq('entity_type', 'lead').in('entity_id', leadIds), 'Related conversations')
            const contactRefs = lead.contact_id ? await read(supabase.from('revo_inbox_associations').select('conversation_id').eq('organisation_id', organisationId).eq('entity_type', 'contact').eq('entity_id', lead.contact_id), 'Related conversations') : []
            const threads = [...new Set([...refs, ...contactRefs].map(row => row.conversation_id))]
            if (threads.length) {
              const mail = await read(supabase.from('revo_inbox_messages').select('id,channel,direction,subject,body_text,message_type,occurred_at').eq('organisation_id', organisationId).in('conversation_id', threads).order('occurred_at', { ascending: false }).order('id').limit(activityLimit + 1), 'Related messages')
              activityHasMore ||= mail.length > activityLimit
              emailMessages = mail.slice(0, activityLimit).map(row => ({ id: `inbox:${row.id}`, at: row.occurred_at, title: row.message_type === 'note' ? 'Internal note' : `${row.channel === 'email' ? 'Email' : 'Message'} ${row.direction === 'inbound' ? 'received' : 'sent'}`, body: row.subject || row.body_text || '' }))
            }
          }
        }
        if (client) {
          try { const manual=await loadClientPropertyEnquiries(client); listings=[...new Map([...listings,...manual.map(row=>({...row,id:row.targetId}))].map(row=>[`${row.kind||'listing'}:${row.id}`,row])).values()]; enquiryEvents.push(...manual.map(row=>({id:`client-enquiry:${row.id}`,at:row.createdAt,title:`${row.kind==='development'?'Development':'Listing'} enquiry added`,body:row.title||'Property enquiry',path:row.path}))) }
          catch (error) { issues.push({ section: 'Enquiries', message: error.message }) }
        }
        if (active) setState({ key, loading: false, loadingMore: false, context, client, lead, contact, listings, linkedLeads, requirements, activities: [...activities, ...emailMessages, ...enquiryEvents], activityHasMore, issues })
      } catch (error) { if (active) setState({ key, loading: false, loadingMore: false, error: error.message }) }
    }
    if (organisationId && conversationId) void load()
    return () => { active = false }
  }, [key, organisationId, conversationId, activityLimit, revision])
  const current = state.key === key ? state : { loading: true, listings: [] }
  return { ...current, loadMoreActivity, refresh }
}
