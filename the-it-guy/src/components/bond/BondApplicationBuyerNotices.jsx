import { useEffect, useState } from 'react'
import { fetchBondApplicationBuyerNotices } from '../../lib/clientPortalApi'

export default function BondApplicationBuyerNotices({ accessToken, token }) {
  const [state, setState] = useState({ data: null, error: '' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    fetchBondApplicationBuyerNotices({ accessToken, token }).then((data) => {
      if (active) setState({ data, error: '' })
    }).catch(() => { if (active) setState({ data: null, error: 'We could not load your finance team’s requests.' }) })
    return () => { active = false }
  }, [accessToken, token, attempt])
  if (state.error) return <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">{state.error} <button className="underline" onClick={() => setAttempt((value) => value + 1)}>Try again</button></p>
  const corrections = state.data?.corrections || []
  const documents = state.data?.documents || []
  if (!corrections.length && !documents.length) return null
  return <section className="my-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><h2 className="font-semibold">Your finance team needs your attention</h2>
    {corrections.map((item) => <div key={item.id}><p className="font-semibold">Application correction</p><p>{item.instruction}</p><p>Correct the requested details and complete a new signed application for your finance team to review.</p></div>)}
    {documents.map((item) => <div key={item.id}><p className="font-semibold">{item.title} · {item.status.replaceAll('_', ' ')}</p><p>{item.feedback || item.instruction}</p></div>)}
  </section>
}
