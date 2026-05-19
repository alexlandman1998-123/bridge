import { Link } from 'react-router-dom'

function AttorneyMattersAttention({ rows = [] }) {
  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">Matters Requiring Attention</h3>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse">
            <thead className="border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Matter / Transaction</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Client / Buyer</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Department</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Current Stage</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Assigned User</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Issue</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Last Updated</th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.matterId}>
                  <td className="px-3 py-3 text-sm font-semibold text-slate-950">{row.matterReference || 'Matter'}</td>
                  <td className="px-3 py-3 text-sm text-slate-600">{row.clientName || 'Unassigned client'}</td>
                  <td className="px-3 py-3 text-sm text-slate-600">{row.department || '—'}</td>
                  <td className="px-3 py-3 text-sm text-slate-600">{row.currentStage || 'Unknown'}</td>
                  <td className="px-3 py-3 text-sm text-slate-600">{row.assignedUser || 'Unassigned'}</td>
                  <td className="px-3 py-3 text-sm text-slate-700">{row.issue || '—'}</td>
                  <td className="px-3 py-3 text-sm text-slate-600">
                    {row.lastUpdated ? new Date(row.lastUpdated).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-3">
                    {row.actionHref ? (
                      <Link to={row.actionHref} className="inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                        {row.actionLabel || 'Open'}
                      </Link>
                    ) : (
                      <span className="text-sm text-slate-500">Unavailable</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No matters need attention yet.</p>
      )}
    </section>
  )
}

export default AttorneyMattersAttention
