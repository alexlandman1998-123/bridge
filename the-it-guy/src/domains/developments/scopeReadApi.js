// Extracted from the legacy API; query, mapping and error behaviour are preserved.
import { isMissingColumnError, isPermissionDeniedError, isMissingTableError } from '../../lib/api/shared/readHelpers.js'

export async function fetchDevelopmentIdsForOrganisation(client, organisationId = '', { parallel = false } = {}) {
  const normalizedOrganisationId = String(organisationId || '').trim()
  if (!normalizedOrganisationId) return []

  const directRead = client.from('developments').select('id').eq('organisation_id', normalizedOrganisationId)
  const readTransactions = () => client.from('transactions').select('development_id')
    .eq('organisation_id', normalizedOrganisationId).not('development_id', 'is', null)
  const results = parallel ? await Promise.all([directRead, readTransactions()]) : [await directRead]
  const directQuery = results[0]

  const directIds = !directQuery.error
    ? (directQuery.data || []).map((row) => String(row?.id || '').trim()).filter(Boolean)
    : []

  if (
    directQuery.error &&
    !isMissingColumnError(directQuery.error, 'organisation_id') &&
    !isPermissionDeniedError(directQuery.error)
  ) {
    throw directQuery.error
  }

  const transactionQuery = parallel ? results[1] : await readTransactions()

  if (transactionQuery.error) {
    if (
      isMissingColumnError(transactionQuery.error, 'organisation_id') ||
      isMissingColumnError(transactionQuery.error, 'development_id') ||
      isMissingTableError(transactionQuery.error, 'transactions') ||
      isPermissionDeniedError(transactionQuery.error)
    ) {
      return [...new Set(directIds)]
    }
    throw transactionQuery.error
  }

  return [
    ...new Set([
      ...directIds,
      ...(transactionQuery.data || []).map((row) => String(row?.development_id || '').trim()).filter(Boolean),
    ]),
  ]
}
