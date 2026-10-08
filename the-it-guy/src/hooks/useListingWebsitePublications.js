import { useEffect, useReducer, useState } from 'react'
import { getWebsiteListingPublicationStatus } from '../services/websiteListingPublicationService'

const EMPTY_STATUSES = {}

// Publication reads use the existing membership-guarded RPC. They enrich cards
// after rendering, with bounded concurrency rather than blocking the stock list.
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
    async function worker() {
      while (!cancelled && cursor < rows.length) {
        const [id] = rows[cursor++]
        try {
          statuses[id] = await getWebsiteListingPublicationStatus(id)
        } catch {
          // An inaccessible or failed read must never become a live badge.
          statuses[id] = null
        }
        if (!cancelled) setSnapshot({ key, statuses: { ...statuses } })
      }
    }
    if (scope) void Promise.all(Array.from({ length: Math.min(4, rows.length) }, worker))
    return () => { cancelled = true }
  }, [key, rowsKey, scope])

  return snapshot.key === key ? snapshot.statuses : EMPTY_STATUSES
}
