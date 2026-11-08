import { useEffect, useReducer, useState } from 'react'
import { getWebsiteListingPublicationStatuses } from '../services/websiteListingPublicationService'

const EMPTY_STATUSES = {}

// Publication reads use the existing membership-guarded RPC. They enrich cards
// after rendering, in bounded batches rather than blocking the stock list.
export default function useListingWebsitePublications(listings, scope) {
  const [revision, refresh] = useReducer((value) => value + 1, 0)
  const [snapshot, setSnapshot] = useState({ key: '', statuses: {} })
  const rowsKey = JSON.stringify([...new Map(listings
    .filter((row) => /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(String(row.id || '')))
    .map((row) => [row.id, [row.id, row.updatedAt || row.updated_at || '']])).values()].sort())
  const key = JSON.stringify([scope, rowsKey, revision])

  useEffect(() => {
    window.addEventListener('itg:listings-updated', refresh)
    return () => window.removeEventListener('itg:listings-updated', refresh)
  }, [])

  useEffect(() => {
    let cancelled = false
    let cursor = 0
    const rows = JSON.parse(rowsKey)
    const statuses = {}
    async function loadBatches() {
      while (!cancelled && cursor < rows.length) {
        const ids = rows.slice(cursor, cursor + 100).map(([id]) => id)
        cursor += ids.length
        try {
          const batch = await getWebsiteListingPublicationStatuses(ids)
          for (const id of ids) statuses[id] = batch[id] || null
        } catch {
          // An inaccessible or failed read must never become a live badge.
          for (const id of ids) statuses[id] = null
        }
        if (!cancelled) setSnapshot({ key, statuses: { ...statuses } })
      }
    }
    if (scope) void loadBatches()
    return () => { cancelled = true }
  }, [key, rowsKey, scope])

  return snapshot.key === key ? snapshot.statuses : EMPTY_STATUSES
}
