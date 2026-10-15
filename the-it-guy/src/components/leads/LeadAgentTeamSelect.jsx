import { useState } from 'react'
import AgentAssignmentSelect from '../AgentAssignmentSelect'
import { getAgentDisplayName } from '../agentAssignmentSelectModel'

const agentId = agent => String(agent?.userId || agent?.id || '').trim()

export default function LeadAgentTeamSelect({ agents = [], primaryAgent, additionalAgents = [], lockPrimary = false, onPrimaryChange, onAdditionalChange }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const primaryId = agentId(primaryAgent)
  const options = agents.some(agent => agentId(agent) === primaryId) ? agents : [primaryAgent, ...agents].filter(Boolean)
  const additionalIds = new Set(additionalAgents.map(agentId))
  const available = agents.filter(agent => agentId(agent) && agentId(agent) !== primaryId)
  const matches = available.filter(agent => `${getAgentDisplayName(agent)} ${agent.email || ''}`.toLowerCase().includes(search.trim().toLowerCase()))

  return <div className="col-span-2 grid min-w-0 gap-4 sm:grid-cols-2">
    <fieldset disabled={lockPrimary} className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-[#2a4057]">Primary agent</legend>
      <AgentAssignmentSelect compact agents={options} value={primaryAgent?.id || primaryAgent?.userId || ''} onChange={agent => {
        onPrimaryChange(agent)
        onAdditionalChange(additionalAgents.filter(member => agentId(member) !== agentId(agent)))
      }} />
    </fieldset>
    <details onToggle={event => setOpen(event.currentTarget.open)} className="min-w-0 rounded-[14px] border border-[#d7e2ed] bg-white px-3 py-3">
      <summary className="cursor-pointer text-sm font-medium text-[#2a4057]">Additional agents{additionalAgents.length ? ` (${additionalAgents.length})` : ''}</summary>
      {open ? <>
      <input type="search" aria-label="Search additional agents" placeholder="Search agents" value={search} onChange={event => setSearch(event.target.value)} className="ui-input mt-3 w-full" />
      <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
        {matches.map(agent => <label key={agentId(agent)} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-[#f4f7fa]">
          <input type="checkbox" checked={additionalIds.has(agentId(agent))} onChange={event => onAdditionalChange(event.target.checked
            ? [...additionalAgents, agent] : additionalAgents.filter(member => agentId(member) !== agentId(agent)))} />
          <span className="min-w-0"><span className="block font-medium">{getAgentDisplayName(agent)}</span><span className="block truncate text-xs text-[#60748b]">{agent.email}</span></span>
        </label>)}
        {!matches.length ? <p className="px-2 py-2 text-sm text-[#60748b]">No additional agents available.</p> : null}
      </div>
      </> : null}
    </details>
    {additionalAgents.length ? <p className="col-span-full text-sm text-[#60748b]">Also assigned: {additionalAgents.map(getAgentDisplayName).join(', ')}</p> : null}
  </div>
}
