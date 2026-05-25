const STATUS_META = {
  pending: ['Pending', 'border-[#dbe5ef] bg-[#f8fbff] text-[#52667c]'],
  requested: ['Requested', 'border-[#cfe0ef] bg-[#eef6ff] text-[#234c74]'],
  uploaded: ['Uploaded', 'border-[#d8e6fb] bg-[#f2f7ff] text-[#245da8]'],
  under_review: ['Under review', 'border-[#d8e6fb] bg-[#f2f7ff] text-[#245da8]'],
  approved: ['Approved', 'border-[#ccebd8] bg-[#f0fbf4] text-[#1f7d44]'],
  rejected: ['Rejected', 'border-[#f5c4c4] bg-[#fff3f3] text-[#b42318]'],
  waived: ['Waived', 'border-[#e4d7f5] bg-[#f8f3ff] text-[#6c3aa1]'],
  expired: ['Expired', 'border-[#f7d6b7] bg-[#fff7ed] text-[#b45309]'],
  completed: ['Completed', 'border-[#ccebd8] bg-[#f0fbf4] text-[#1f7d44]'],
  not_applicable: ['Not applicable', 'border-[#e3e8ef] bg-[#f8fafc] text-[#64748b]'],
}

function RequirementStatusBadge({ status = '' }) {
  const [label, className] = STATUS_META[String(status || '').toLowerCase()] || STATUS_META.pending
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold ${className}`}>
      {label}
    </span>
  )
}

export default RequirementStatusBadge
