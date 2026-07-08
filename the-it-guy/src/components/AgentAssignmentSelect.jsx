import { Check, ChevronDown, Loader2, UserPlus, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  getAgentDisplayName,
  getAgentOptionKey,
  getAgentProfileAvatarUrl,
} from './agentAssignmentSelectModel'

function normalizeText(value) {
  return String(value || '').trim()
}

function getAgentInitials(agent = {}) {
  const label = getAgentDisplayName(agent)
  const initials = label
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return initials || 'A'
}

function AgentAvatar({ agent, className = 'h-10 w-10' }) {
  const avatarUrl = getAgentProfileAvatarUrl(agent)
  return (
    <span className={`${className} inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#dce9f4] text-xs font-bold text-[#26445c] ring-2 ring-white`.trim()}>
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : getAgentInitials(agent)}
    </span>
  )
}

function AgentOptionContent({ agent, selected = false }) {
  return (
    <>
      <AgentAvatar agent={agent} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-[#162334]">{getAgentDisplayName(agent)}</span>
          {agent.isCurrentUser ? (
            <span className="shrink-0 rounded-full bg-[#edf8f1] px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[#1f7a45]">
              You
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-[#6b7d93]">
          <span className="truncate">{agent.email || 'No email on profile'}</span>
          <span className="hidden text-[#a3b2c2] sm:inline">•</span>
          <span className="shrink-0">{agent.roleLabel || 'Agent'}</span>
        </span>
      </span>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${selected ? 'bg-[#0f2742] text-white' : 'bg-[#eef4fb] text-[#8aa0b4]'}`}>
        {selected ? <Check size={14} /> : <UserPlus size={13} />}
      </span>
    </>
  )
}

export default function AgentAssignmentSelect({ value = '', agents = [], loading = false, onChange }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const selectedAgent =
    agents.find((agent) => getAgentOptionKey(agent) === normalizeText(value)) ||
    agents.find((agent) => normalizeText(agent.email) === normalizeText(value).toLowerCase()) ||
    agents[0] ||
    null

  useEffect(() => {
    function onClickOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="flex min-h-[58px] w-full items-center gap-3 rounded-[14px] border border-[#cfdae6] bg-gradient-to-b from-white to-[#f8fbfd] px-3 py-2 text-left shadow-[0_1px_0_rgba(255,255,255,0.88)] outline-none transition hover:border-[#b7c6d5] focus:border-[#22445e] focus:ring-2 focus:ring-[#22445e]/10 disabled:cursor-not-allowed disabled:opacity-70"
        onClick={() => setOpen((previous) => !previous)}
        disabled={loading && !agents.length}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedAgent ? (
          <AgentOptionContent agent={selectedAgent} selected />
        ) : (
          <>
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef4fb] text-[#49657c]">
              <UsersRound size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[#162334]">{loading ? 'Loading agents...' : 'Choose an agent'}</span>
              <span className="block text-xs font-medium text-[#6b7d93]">Select from your agency directory</span>
            </span>
          </>
        )}
        <ChevronDown size={15} className={`shrink-0 text-[#71879b] transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div
          className="absolute left-0 right-0 z-[70] mt-2 max-h-[292px] overflow-y-auto rounded-[16px] border border-[#d8e3ef] bg-white p-2 shadow-[0_22px_55px_rgba(15,39,66,0.18)]"
          role="listbox"
        >
          {loading ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm font-semibold text-[#597086]">
              <Loader2 size={15} className="animate-spin" />
              Loading agency agents...
            </div>
          ) : null}
          {!loading && !agents.length ? (
            <div className="rounded-[12px] bg-[#f6f9fc] px-3 py-3 text-sm font-medium text-[#597086]">
              No assignable agents found for this workspace.
            </div>
          ) : null}
          {agents.map((agent) => {
            const key = getAgentOptionKey(agent)
            const selected = selectedAgent ? getAgentOptionKey(selectedAgent) === key : false
            return (
              <button
                key={key}
                type="button"
                className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left transition ${
                  selected ? 'bg-[#eef4fb]' : 'hover:bg-[#f7fafc]'
                }`}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(agent)
                  setOpen(false)
                }}
              >
                <AgentOptionContent agent={agent} selected={selected} />
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
