export const RENTAL_MODULE_API_VERSION = 'arch9_rentals_module_api_v1'

// Future rental features receive repositories through this seam instead of making
// Supabase calls from pages or components.
export function createRentalModuleApi(repositories = {}) {
  return Object.freeze({
    version: RENTAL_MODULE_API_VERSION,
    getRepository(name) {
      const repository = repositories[name]
      if (!repository) throw new Error(`Rental repository is not registered: ${name}`)
      return repository
    },
  })
}
