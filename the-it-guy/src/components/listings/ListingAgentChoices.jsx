import { CheckCircle2, UserRound } from 'lucide-react'

export default function ListingAgentChoices({ agents = [], value, onChange }) {
  return <fieldset className="min-w-0 rounded-xl border border-[#dbe6f2] bg-white p-4">
    <legend className="px-2 text-sm font-semibold text-[#18324b]">Assigned agent</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      {agents.map(agent => {
        const key = String(agent.userId || agent.id || agent.email || '').trim()
        const selected = key === value
        return <label key={key} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${selected ? 'border-[#1f7d44] bg-[#f0f8f3]' : 'border-[#dbe6f2] hover:bg-[#f5f9fc]'}`}>
          <input className="sr-only peer" type="radio" name="assignedAgentChoice" value={key} checked={selected} onChange={() => onChange(key)} />
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#eef4fa] text-[#315f80] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
            {agent.avatarUrl ? <img src={agent.avatarUrl} alt="" className="h-full w-full object-cover" /> : <UserRound size={20} aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{agent.fullName || agent.email || 'Agent'}</span>{agent.fullName && agent.email ? <span className="block break-all text-xs text-[#607387]">{agent.email}</span> : null}</span>
          {selected ? <CheckCircle2 size={18} className="shrink-0 text-[#1f7d44]" aria-hidden="true" /> : null}
        </label>
      })}
    </div>
  </fieldset>
}
