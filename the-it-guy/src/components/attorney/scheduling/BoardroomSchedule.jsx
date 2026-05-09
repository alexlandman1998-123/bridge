function BoardroomSchedule({ resources = [], usageRows = [], onAssignResource = null }) {
  const usageByResource = usageRows.reduce((acc, row) => {
    const key = row.resourceId || '__unassigned__'
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {})

  return (
    <section className="panel card-tier-standard" style={{ display: 'grid', gap: '0.75rem' }}>
      <h3 style={{ margin: 0 }}>Boardroom / Resource Usage</h3>
      {!resources.length ? (
        <p className="status-message" style={{ margin: 0 }}>No appointment resources configured yet.</p>
      ) : (
        <div style={{ display: 'grid', gap: '0.6rem', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {resources.map((resource) => {
            const rows = usageByResource[resource.resourceId] || []
            return (
              <article key={resource.resourceId} style={{ border: '1px solid #dce6f2', borderRadius: '12px', padding: '0.65rem', display: 'grid', gap: '0.4rem' }}>
                <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700 }}>{resource.resourceName}</p>
                <p className="status-message" style={{ margin: 0 }}>{rows.length} scheduled</p>
                {rows.slice(0, 4).map((row) => (
                  <div key={row.id} style={{ border: '1px dashed #dce6f2', borderRadius: '8px', padding: '0.38rem 0.45rem' }}>
                    <p style={{ margin: 0, fontSize: '0.74rem', fontWeight: 600 }}>{row.appointmentType}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#5f7690' }}>{row.matterReference}</p>
                  </div>
                ))}
              </article>
            )
          })}
          <article style={{ border: '1px solid #dce6f2', borderRadius: '12px', padding: '0.65rem', display: 'grid', gap: '0.4rem' }}>
            <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700 }}>Unassigned</p>
            <p className="status-message" style={{ margin: 0 }}>{(usageByResource.__unassigned__ || []).length} appointments</p>
            {(usageByResource.__unassigned__ || []).slice(0, 4).map((row) => (
              <div key={row.id} style={{ display: 'grid', gap: '0.28rem' }}>
                <p style={{ margin: 0, fontSize: '0.73rem' }}>{row.appointmentType} · {row.matterReference}</p>
                <select className="input" value="" onChange={(event) => onAssignResource?.(row, event.target.value)}>
                  <option value="">Assign resource</option>
                  {(resources || []).map((resource) => (
                    <option key={resource.resourceId} value={resource.resourceId}>{resource.resourceName}</option>
                  ))}
                </select>
              </div>
            ))}
          </article>
        </div>
      )}
    </section>
  )
}

export default BoardroomSchedule
