const email = 'seller.demo@bridgenine.co.za'
const baseUrl = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!baseUrl || !serviceKey) throw new Error('Missing Supabase env vars')

const response = await fetch(`${baseUrl.replace(/\/$/, '')}/auth/v1/admin/users?page=1&per_page=1000`, {
  headers: {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  },
})

const text = await response.text()
console.log(JSON.stringify({ status: response.status, body: text.slice(0, 4000) }, null, 2))
