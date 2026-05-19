function WorkloadStatusPill({ status = '' }) {
  const normalized = String(status || '').toLowerCase()
  let color = '#4f5f79'
  if (normalized.includes('overloaded')) color = '#b42318'
  else if (normalized.includes('busy')) color = '#b54708'
  else if (normalized.includes('attention')) color = '#b42318'
  else if (normalized.includes('normal')) color = '#067647'

  return (
    <span
      style={{
        display: 'inline-flex',
        padding: '0.2rem 0.55rem',
        borderRadius: '999px',
        border: `1px solid ${color}44`,
        background: `${color}1A`,
        color,
        fontSize: '0.78rem',
        fontWeight: 600,
      }}
    >
      {status || 'Unknown'}
    </span>
  )
}

function AttorneyStaffWorkload({ rows = [] }) {
  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">Staff Workload</h3>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Staff Member</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Role</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Department</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Assigned Matters</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Delayed Matters</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.memberId}>
                  <td className="px-3 py-3 text-sm font-semibold text-slate-950">{row.fullName}</td>
                  <td className="px-3 py-3 text-sm text-slate-600">{row.role}</td>
                  <td className="px-3 py-3 text-sm text-slate-600">{row.departmentName}</td>
                  <td className="px-3 py-3 text-sm text-slate-700">{row.assignedMatters}</td>
                  <td className="px-3 py-3 text-sm text-slate-700">{row.delayedMatters}</td>
                  <td className="px-3 py-3"><WorkloadStatusPill status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Team members will appear here once they are added to the firm.</p>
      )}
    </section>
  )
}

export default AttorneyStaffWorkload
