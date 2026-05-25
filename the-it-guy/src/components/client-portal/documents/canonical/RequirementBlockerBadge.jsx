import { AlertTriangle } from 'lucide-react'

const LEVEL_META = {
  blocker: ['Blocker', 'border-[#f4b7b7] bg-[#fff1f1] text-[#b42318]'],
  required: ['Required', 'border-[#f7d6b7] bg-[#fff7ed] text-[#9a4d00]'],
  recommended: ['Recommended', 'border-[#d8e6fb] bg-[#f2f7ff] text-[#245da8]'],
  optional: ['Optional', 'border-[#dbe5ef] bg-[#f8fbff] text-[#5f738a]'],
  not_applicable: ['Not applicable', 'border-[#e3e8ef] bg-[#f8fafc] text-[#64748b]'],
}

function RequirementBlockerBadge({ level = 'required', blocking = false }) {
  const normalized = String(level || 'required').toLowerCase()
  const [label, className] = LEVEL_META[normalized] || LEVEL_META.required
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${blocking || normalized === 'blocker' ? LEVEL_META.blocker[1] : className}`}>
      {blocking || normalized === 'blocker' ? <AlertTriangle size={12} /> : null}
      {blocking && normalized !== 'blocker' ? 'Blocking' : label}
    </span>
  )
}

export default RequirementBlockerBadge
