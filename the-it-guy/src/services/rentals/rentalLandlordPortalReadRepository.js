import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const requireClient = (client = supabase) => { if (!isSupabaseConfigured || !client) throw new Error('Landlord portal requires Supabase configuration.'); return client }
export async function getRentalLandlordPortalPortfolio(propertyId = null, { client = supabase } = {}) { const result = await requireClient(client).rpc('rental_get_landlord_portal_portfolio', { p_property_id: propertyId || null }); if (result.error) throw result.error; return result.data || { properties: [] } }
