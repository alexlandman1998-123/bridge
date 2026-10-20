import { useEffect, useState } from 'react'
import { fetchAgencyCrmLeadWorkspace } from '../../lib/agencyCrmRepository.js'
import MobileLeadWorkspaceHeader from './MobileLeadWorkspaceHeader.jsx'
import MobileLeadContextCards from './MobileLeadContextCards.jsx'
import MobileBuyerJourney from './MobileBuyerJourney.jsx'
import { useMobileLeadActions } from './mobileLeadActionContext.js'

export default function MobileLeadWorkspaceOverview({ organisationId, leadId, onContactAction, actor, includeAll = false }) {
  const revision = useMobileLeadActions()?.revision || 0
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const key = `${organisationId || ''}:${leadId}`
  useEffect(() => {
    let active = true
    if (!organisationId || !leadId) return undefined
    fetchAgencyCrmLeadWorkspace(organisationId, leadId).then(snapshot => {
      if (!active) return
      const lead = snapshot.leads?.find(row => (row.leadId || row.lead_id) === (snapshot.resolvedLeadId || leadId))
      if (!lead) throw new Error('Lead unavailable')
      const contact = snapshot.contacts?.find(row => row.contactId === lead.contactId) || lead.contact || {}
      setResult({ key, lead, contact, activities: snapshot.leadActivities || [] })
    }).catch(() => {
      if (active) setResult({ key, error: true })
    })
    return () => { active = false }
  }, [organisationId, leadId, key, attempt, revision])
  const current = result?.key === key ? result : null
  return <>
    <MobileLeadWorkspaceHeader current={current} organisationId={organisationId} onRetry={() => { setResult(null); setAttempt(value => value + 1) }} onContactAction={onContactAction} />
    {current?.lead && <>
      <MobileLeadContextCards key={key} lead={current.lead} contact={current.contact} organisationId={organisationId} />
      <MobileBuyerJourney key={`journey:${key}`} organisationId={organisationId} lead={current.lead} contact={current.contact} activities={current.activities} actor={actor} includeAll={includeAll} />
    </>}
  </>
}
