const email = 'seller.demo@arch9.co.za'
const baseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!baseUrl || !serviceKey) throw new Error('Missing Supabase env vars')

const headers = {
  apikey: serviceKey,
  Authorization: `Bearer ${serviceKey}`,
  'Content-Type': 'application/json',
}

async function get(path) {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/v1/${path}`, { headers })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} failed: ${response.status} ${text}`)
  return text ? JSON.parse(text) : []
}

const queries = [
  ['profiles', `profiles?select=id,email,full_name,first_name,last_name,created_at,updated_at&email=eq.${encodeURIComponent(email)}`],
  ['organisation_users', `organisation_users?select=id,user_id,organisation_id,email,role,workspace_role,organisation_role,status,is_demo_data,created_at,updated_at&email=eq.${encodeURIComponent(email)}`],
  ['transactions', `transactions?select=id,organisation_id,seller_email,seller_name,buyer_id,is_demo_data,created_at,updated_at&seller_email=eq.${encodeURIComponent(email)}`],
  ['buyers', `buyers?select=id,name,email,phone,is_demo_data,created_at,updated_at&email=eq.${encodeURIComponent(email)}`],
  ['leads', `leads?select=lead_id,organisation_id,email,seller_email,contact_email,is_demo_data,created_at,updated_at&or=(email.eq.${encodeURIComponent(email)},seller_email.eq.${encodeURIComponent(email)},contact_email.eq.${encodeURIComponent(email)})`],
  ['contacts', `contacts?select=contact_id,organisation_id,email,full_name,is_demo_data,created_at,updated_at&email=eq.${encodeURIComponent(email)}`],
  ['private_listings', `private_listings?select=id,organisation_id,seller_email,seller_name,is_demo_data,created_at,updated_at&or=(seller_email.eq.${encodeURIComponent(email)},email.eq.${encodeURIComponent(email)})`],
  ['appointments', `appointments?select=id,organisation_id,contact_email,attendee_email,is_demo_data,created_at,updated_at&or=(contact_email.eq.${encodeURIComponent(email)},attendee_email.eq.${encodeURIComponent(email)})`],
  ['tasks', `tasks?select=id,organisation_id,assignee_email,is_demo_data,created_at,updated_at&assignee_email=eq.${encodeURIComponent(email)}`],
  ['lead_activities', `lead_activities?select=id,organisation_id,email,is_demo_data,created_at,updated_at&email=eq.${encodeURIComponent(email)}`],
  ['documents', `documents?select=id,organisation_id,uploaded_by_email,owner_email,is_demo_data,created_at,updated_at&or=(uploaded_by_email.eq.${encodeURIComponent(email)},owner_email.eq.${encodeURIComponent(email)})`],
  ['document_requests', `document_requests?select=id,organisation_id,requested_for_email,recipient_email,is_demo_data,created_at,updated_at&or=(requested_for_email.eq.${encodeURIComponent(email)},recipient_email.eq.${encodeURIComponent(email)})`],
  ['private_listing_seller_onboarding', `private_listing_seller_onboarding?select=id,private_listing_id,status,is_demo_data,created_at,updated_at&select=id&limit=5`],
]

const result = {}
for (const [key, path] of queries) {
  try {
    result[key] = await get(path)
  } catch (error) {
    result[key] = { error: String(error.message || error) }
  }
}

console.log(JSON.stringify(result, null, 2))
