// Shared client boundary for extracted domain repositories.
// Existing api.js callers remain unchanged until their domain is migrated.
export {
  DOCUMENTS_BUCKET_CANDIDATES,
  createScopedSupabaseClient,
  supabase,
} from '../../supabaseClient'
