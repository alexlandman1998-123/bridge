function DepartmentStatusPill({ status = '' }) {
  const normalized = String(status || '').toLowerCase()
  const color = normalized.includes('attention') ? '#b42318' : normalized === 'active' ? '#067647' : '#4f5f79'
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

function AttorneyDepartmentOverview({ departments = [] }) {
  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">Department Overview</h3>
      {departments.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Department</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Type</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Active Matters</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Assigned Staff</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Delayed</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departments.map((department) => (
                <tr key={department.departmentId}>
                  <td className="px-3 py-3 text-sm font-semibold text-slate-950">{department.departmentName}</td>
                  <td className="px-3 py-3 text-sm text-slate-600">{department.departmentType}</td>
                  <td className="px-3 py-3 text-sm text-slate-700">{department.activeMatters}</td>
                  <td className="px-3 py-3 text-sm text-slate-700">{department.assignedStaff}</td>
                  <td className="px-3 py-3 text-sm text-slate-700">{department.delayedMatters}</td>
                  <td className="px-3 py-3"><DepartmentStatusPill status={department.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Departments will appear here once your firm setup is complete.</p>
      )}
    </section>
  )
}

export default AttorneyDepartmentOverview
