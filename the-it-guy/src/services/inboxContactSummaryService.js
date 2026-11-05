import { supabase } from '../lib/supabaseClient'
const unique=values=>[...new Set(values.filter(value=>/^[0-9a-f-]{36}$/i.test(value||'')))]
export async function loadInboxContactSummary({organisationId,conversationId,email}) {
 const issues=[]
 async function read(query,label){const {data,error}=await query;if(error){issues.push(label);return []}return data||[]}
 const refs=await read(supabase.from('revo_inbox_associations').select('entity_type,entity_id').eq('organisation_id',organisationId).eq('conversation_id',conversationId),'Linked records')
 const linkedContacts=unique(refs.filter(row=>row.entity_type==='contact').map(row=>row.entity_id))
 const contactQueries=[]
 if(email)contactQueries.push(read(supabase.from('contacts').select('contact_id,first_name,last_name,email,phone').eq('organisation_id',organisationId).eq('email',email.trim().toLowerCase()),'Contact'))
 if(linkedContacts.length)contactQueries.push(read(supabase.from('contacts').select('contact_id,first_name,last_name,email,phone').eq('organisation_id',organisationId).in('contact_id',linkedContacts),'Contact'))
 const contacts=[...new Map((await Promise.all(contactQueries)).flat().map(row=>[row.contact_id,row])).values()]
 const contactIds=unique(contacts.map(row=>row.contact_id)),leadIds=unique(refs.filter(row=>row.entity_type==='lead').map(row=>row.entity_id))
 const leadFilters=[];if(contactIds.length)leadFilters.push(`contact_id.in.(${contactIds.join(',')})`);if(leadIds.length)leadFilters.push(`lead_id.in.(${leadIds.join(',')})`)
 const leads=leadFilters.length?await read(supabase.from('leads').select('lead_id,contact_id,lead_category,stage,status,priority,budget,area_interest,property_interest,next_follow_up_at,assigned_user_id,converted_transaction_id,enquired_listing_id,listing_id,enquired_property_title,enquired_property_address,created_at').eq('organisation_id',organisationId).or(leadFilters.join(',')).order('created_at',{ascending:false}),'Leads'):[]
 const missingContactIds=unique(leads.map(row=>row.contact_id)).filter(id=>!contactIds.includes(id))
 if(missingContactIds.length){contacts.push(...await read(supabase.from('contacts').select('contact_id,first_name,last_name,email,phone').eq('organisation_id',organisationId).in('contact_id',missingContactIds),'Contact'));contactIds.push(...missingContactIds)}
 const allLeadIds=unique(leads.map(row=>row.lead_id)),transactionIds=unique([...refs.filter(row=>row.entity_type==='transaction').map(row=>row.entity_id),...leads.map(row=>row.converted_transaction_id)])
 const transactionFilters=[];if(transactionIds.length)transactionFilters.push(`id.in.(${transactionIds.join(',')})`);if(allLeadIds.length)transactionFilters.push(`originating_buyer_lead_id.in.(${allLeadIds.join(',')})`);if(contactIds.length)transactionFilters.push(`buyer_contact_id.in.(${contactIds.join(',')})`,`seller_contact_id.in.(${contactIds.join(',')})`)
 const transactionPromise=transactionFilters.length?read(supabase.from('transactions').select('id,transaction_reference,property_address_line_1,suburb,current_main_stage,stage,sales_price,purchase_price,finance_status,next_action,expected_transfer_date,assigned_agent,attorney,risk_status,lifecycle_state,cancelled_at,updated_at').eq('organisation_id',organisationId).or(transactionFilters.join(',')).order('updated_at',{ascending:false}),'Transactions'):Promise.resolve([])
 const activityPromise=allLeadIds.length?read(supabase.from('lead_activities').select('activity_id,activity_type,activity_note,activity_date,created_at').eq('organisation_id',organisationId).in('lead_id',allLeadIds).order('activity_date',{ascending:false}).limit(50),'CRM history'):Promise.resolve([])
 const interestPromise=allLeadIds.length?read(supabase.from('lead_listing_interests').select('interest_id,listing_id,created_at,status').eq('organisation_id',organisationId).in('lead_id',allLeadIds),'Enquiries'):Promise.resolve([])
 const conversationsPromise=email?read(supabase.from('revo_inbox_conversations').select('id,subject,last_message_at,status').eq('organisation_id',organisationId).eq('contact_address',email.trim().toLowerCase()).order('last_message_at',{ascending:false}).limit(50),'Conversations'):Promise.resolve([])
 const [transactions,activities,interests,conversations]=await Promise.all([transactionPromise,activityPromise,interestPromise,conversationsPromise])
 const listingIds=unique([...leads.flatMap(row=>[row.listing_id,row.enquired_listing_id]),...interests.map(row=>row.listing_id)])
 const listings=listingIds.length?await read(supabase.from('private_listings').select('id,title,suburb').eq('organisation_id',organisationId).in('id',listingIds),'Properties'):[]
 const enquiries=listings.map(row=>({id:`listing:${row.id}`,title:row.title||row.suburb||'Listing',kind:'Listing',path:`/listings/${row.id}`,at:interests.find(item=>item.listing_id===row.id)?.created_at}))
 if(allLeadIds.length){
  const links=await read(supabase.from('agency_client_links').select('client_id').eq('organisation_id',organisationId).eq('source_kind','lead').in('source_id',allLeadIds),'Client links')
  const clientIds=unique(links.map(row=>row.client_id))
  if(clientIds.length){const manual=await read(supabase.from('agency_client_property_enquiries').select('id,listing_id,development_id,created_at,private_listings(id,title),developments(id,name)').eq('organisation_id',organisationId).in('client_id',clientIds).order('created_at',{ascending:false}),'Property enquiries');for(const row of manual){const development=Boolean(row.development_id);enquiries.push({id:`${development?'development':'listing'}:${row.development_id||row.listing_id}`,title:development?row.developments?.name:row.private_listings?.title,kind:development?'Development':'Listing',at:row.created_at,path:development?`/developments/${row.development_id}`:`/listings/${row.listing_id}`})}}
 }
 const owners=unique(leads.map(row=>row.assigned_user_id))
 const people=owners.length?await read(supabase.from('profiles').select('id,full_name,email').in('id',owners),'Lead owners'):[]
 return {contacts,leads,transactions,enquiries:[...new Map(enquiries.map(row=>[row.id,row])).values()],activities,conversations,people,issues:[...new Set(issues)]}
}
