function AttorneyRecentActivity({ rows = [] }) {
  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-950">Recent Activity</h3>
      {rows.length ? (
        <ul className="grid gap-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <span className="block text-sm font-medium text-slate-800">{row.message}</span>
              <span className="mt-1 block text-xs text-slate-500">
                {row.occurredAt ? new Date(row.occurredAt).toLocaleString() : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Activity will appear here as your team works on matters.
        </p>
      )}
    </section>
  )
}

export default AttorneyRecentActivity
