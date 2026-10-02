import { useEffect, useState } from 'react'
import { loadImportedDealReviewStatuses } from '../services/importedDealReviewStatusService.js'

export default function useImportedDealReviewStatuses(transactions = [], refreshToken = 0) {
  const identity = JSON.stringify(transactions.filter((tx) => tx?.id).map((tx) => [tx.id, tx.updated_at || '']).sort((a,b) => a[0].localeCompare(b[0])))
  const [eventVersion, setEventVersion] = useState(0)
  const [result, setResult] = useState({ identity: '', version: '', summaries: {}, error: '' })
  const version = `${refreshToken}:${eventVersion}`
  useEffect(() => {
    const refresh = () => setEventVersion((current) => current + 1)
    window.addEventListener('itg:transaction-updated', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('itg:transaction-updated', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  useEffect(() => {
    let active = true
    const ids = JSON.parse(identity).map(([id]) => id)
    loadImportedDealReviewStatuses({ transactionIds: ids }).then((summaries) => {
      if (active) setResult({ identity, version, summaries, error: '' })
    }).catch((cause) => {
      if (active) setResult({ identity, version, summaries: {}, error: cause.message })
    })
    return () => { active = false }
  }, [identity, version])
  // A changed record or explicit refresh never keeps an old green badge.
  const current = result.identity === identity && result.version === version
  return { summaries: current ? result.summaries : {}, error: current ? result.error : '', loading: !current }
}
