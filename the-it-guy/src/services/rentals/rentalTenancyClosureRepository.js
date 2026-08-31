import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const text = (value) => String(value ?? '').trim()
const requireClient = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Tenancy closure requires Supabase configuration.'); return client }

export async function getRentalTenancyClosure(tenancyId, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_get_tenancy_closure', { p_tenancy_id: text(tenancyId) }); if (result.error) throw result.error; return result.data }
export async function closeRentalTenancy({ tenancyId, createVacancy = false, availableFrom = null } = {}, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_close_tenancy', { p_tenancy_id: text(tenancyId), p_create_vacancy: Boolean(createVacancy), p_available_from: availableFrom || null }); if (result.error) throw result.error; return result.data }
